import { existsSync, rmSync } from "node:fs";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  normalizeAccountId,
  openMtprotoSessionDatabase,
  TELEGRAM_PATHS,
} from "../../storage/sqlite";
import { setJobMeta } from "../../queue/job-meta";
import type { AccountResetPayload } from "../types";

export async function runAccountReset(payload: AccountResetPayload): Promise<void> {
  const jobId = payload.jobId;
  let accountId = payload.accountId;
  if (/^\+?\d/.test(accountId)) {
    accountId = accountIdFromPhone(accountId);
  } else {
    accountId = normalizeAccountId(accountId);
  }

  await setJobMeta(jobId, { type: "account.reset", status: "active" });

  const dbPath = defaultSessionDbPath();
  const db = openMtprotoSessionDatabase(dbPath);
  const kv = db.run(
    "DELETE FROM mtproto_session_kv WHERE account_id = ?",
    [accountId],
  );
  const acc = db.run("DELETE FROM telegram_accounts WHERE account_id = ?", [
    accountId,
  ]);
  db.close();

  const pending = TELEGRAM_PATHS.pendingLogin();
  if (existsSync(pending)) rmSync(pending);

  const accountFile = TELEGRAM_PATHS.accountSqlite(accountId);
  for (const p of [accountFile, `${accountFile}-wal`, `${accountFile}-shm`]) {
    if (existsSync(p)) rmSync(p);
  }

  await setJobMeta(jobId, {
    type: "account.reset",
    status: "completed",
    result: {
      logs: [
        `Reset account "${accountId}" (kv=${kv.changes}, accounts=${acc.changes})`,
      ],
    },
  });
}
