import { spawnSync } from "node:child_process";
import { WEBK_APP_CONFIG } from "../../config/webk";
import { MtprotoCoreSession } from "../../mtproto/client/mtproto-core-session";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  ensureTelegramDataLayout,
  listSessionAccounts,
  openMtprotoSessionDatabase,
  resolveSessionAccountId,
  upsertSessionAccount,
} from "../../storage/sqlite";
import type { Database } from "bun:sqlite";
import {
  checkCloudPasswordAfterLogin,
  isSessionPasswordNeeded,
  pollQrLogin,
} from "../../services/auth/qr-login";
import { getJobInput, setJobMeta } from "../../queue/job-meta";
import type { AuthQrPayload } from "../types";

function migrateMtprotoKvSlot(db: Database, fromId: string, toId: string): void {
  if (fromId === toId) return;
  const now = Date.now();
  const rows = db
    .query<{ key: string; value: string }, [string]>(
      "SELECT key, value FROM mtproto_session_kv WHERE account_id = ?",
    )
    .all(fromId);
  const upsert = db.query(
    `INSERT INTO mtproto_session_kv (account_id, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );
  for (const row of rows) {
    upsert.run(toId, row.key, row.value, now);
  }
  db.run("DELETE FROM mtproto_session_kv WHERE account_id = ?", [fromId]);
  db.run("DELETE FROM telegram_accounts WHERE account_id = ?", [fromId]);
}

function qrUtf8(deepLink: string): string | undefined {
  const qr = spawnSync("qrencode", ["-t", "UTF8", deepLink], {
    encoding: "utf8",
  });
  if (qr.status === 0 && qr.stdout) return qr.stdout;
  return undefined;
}

async function waitForPassword(jobId: string): Promise<string | undefined> {
  for (let i = 0; i < 300; i++) {
    const val = await getJobInput(jobId, "password");
    if (val) return val;
    await Bun.sleep(2000);
  }
  return undefined;
}

export async function runAuthQr(payload: AuthQrPayload): Promise<void> {
  ensureTelegramDataLayout();
  const jobId = payload.jobId;
  const dbPath = defaultSessionDbPath();
  const db = openMtprotoSessionDatabase(dbPath);
  const accountId = resolveSessionAccountId(db, payload.accountId);
  const exceptIds = listSessionAccounts(db)
    .map((row) => row.user_id)
    .filter((id): id is string => id != null && id.length > 0)
    .map((id) => BigInt(id));
  db.close();

  await setJobMeta(jobId, {
    type: "auth.qr",
    status: "active",
    params: { accountId },
  });

  const session = new MtprotoCoreSession({ dbPath, accountId });
  const ac = new AbortController();

  await setJobMeta(jobId, {
    type: "auth.qr",
    status: "waiting_input",
    input: { needs: "scan" },
  });

  let auth = await pollQrLogin({
    session,
    exceptIds,
    onToken: (deepLink) => {
      void setJobMeta(jobId, {
        type: "auth.qr",
        status: "waiting_input",
        input: {
          needs: "scan",
          deepLink,
          qrUtf8: qrUtf8(deepLink),
        },
      });
    },
    signal: ac.signal,
  }).then((r) => r.authorization);

  try {
    await session.syncAuth(WEBK_APP_CONFIG.baseDcId);
  } catch {
    /* best-effort */
  }

  if (auth.setup_password_required) {
    await setJobMeta(jobId, {
      type: "auth.qr",
      status: "waiting_input",
      input: { needs: "password" },
    });
    const password = await waitForPassword(jobId);
    if (!password) throw new Error("password input timeout");
    auth = await checkCloudPasswordAfterLogin(session, password);
  }

  try {
    await finishQrLogin(session, auth.user, jobId, !payload.accountId);
  } catch (error) {
    if (isSessionPasswordNeeded(error)) {
      await setJobMeta(jobId, {
        type: "auth.qr",
        status: "waiting_input",
        input: { needs: "password" },
      });
      const password = await waitForPassword(jobId);
      if (!password) throw new Error("password input timeout");
      auth = await checkCloudPasswordAfterLogin(session, password);
      await finishQrLogin(session, auth.user, jobId, !payload.accountId);
      return;
    }
    throw error;
  }
}

async function finishQrLogin(
  session: MtprotoCoreSession,
  user: Record<string, unknown>,
  jobId: string,
  makeDefault: boolean,
): Promise<void> {
  const phone = user.phone ? String(user.phone) : undefined;
  let accountId = session.accountId;
  if (phone) accountId = accountIdFromPhone(phone);

  const db = openMtprotoSessionDatabase(session.dbPath);
  if (accountId !== session.accountId) {
    migrateMtprotoKvSlot(db, session.accountId, accountId);
  }
  upsertSessionAccount(db, {
    accountId,
    phone,
    userId: user.id as string | bigint,
    displayName: String(user.first_name ?? ""),
    makeDefault,
  });
  db.close();

  await setJobMeta(jobId, {
    type: "auth.qr",
    status: "completed",
    result: {
      auth: {
        account: accountId,
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        phone,
      },
    },
  });
}
