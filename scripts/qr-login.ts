#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { WEBK_APP_CONFIG } from "../src/config/webk";
import { MtprotoCoreSession } from "../src/mtproto/client/mtproto-core-session";
import { parseAccountCliArgs } from "../src/mtproto/client/create-session";
import {
  checkCloudPasswordAfterLogin,
  isSessionPasswordNeeded,
  pollQrLogin,
} from "../src/services/auth/qr-login";
import type { Database } from "bun:sqlite";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  ensureTelegramDataLayout,
  listSessionAccounts,
  openMtprotoSessionDatabase,
  resolveSessionAccountId,
  upsertSessionAccount,
} from "../src/storage/sqlite";

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

function printQr(deepLink: string) {
  console.log("\n" + "─".repeat(48));
  console.log("สแกน QR (มือถือ: Settings → Devices → Link Desktop Device)");
  console.log(deepLink);
  console.log("─".repeat(48));
  const qr = spawnSync("qrencode", ["-t", "UTF8", deepLink], {
    encoding: "utf8",
  });
  if (qr.status === 0 && qr.stdout) {
    console.log(qr.stdout);
  } else {
    console.warn("(ติดตั้ง qrencode เพื่อแสดง QR ในเทอร์มินัล)");
  }
}

async function promptHidden(rl: readline.Interface, label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await rl.question(label)).trim();
  }
  process.stdout.write(label);
  const chunks: string[] = [];
  return new Promise((resolvePromise) => {
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        input.setRawMode?.(false);
        input.pause();
        input.removeListener("data", onData);
        process.stdout.write("\n");
        resolvePromise(chunks.join("").trim());
        return;
      }
      if (char === "\u007f" || char === "\b") {
        chunks.pop();
        return;
      }
      if (char === "\u0003") {
        process.exit(130);
      }
      chunks.push(char);
    };
    input.on("data", onData);
  });
}

async function main() {
  ensureTelegramDataLayout();
  const { account: accountArg, dbPath: dbArg } = parseAccountCliArgs(
    process.argv.slice(2),
  );
  const dbPath = resolve(dbArg ?? defaultSessionDbPath());
  const explicitAccount = accountArg?.trim();

  const db = openMtprotoSessionDatabase(dbPath);
  const accountId = resolveSessionAccountId(db, explicitAccount);
  const exceptIds = listSessionAccounts(db)
    .map((row) => row.user_id)
    .filter((id): id is string => id != null && id.length > 0)
    .map((id) => BigInt(id));
  db.close();

  const session = new MtprotoCoreSession({ dbPath, accountId });
  const rl = readline.createInterface({ input, output });
  const ac = new AbortController();

  process.on("SIGINT", () => {
    ac.abort();
    rl.close();
    process.exit(130);
  });

  console.log(`Session DB: ${session.dbPath}`);
  console.log(`Account slot: ${session.accountId}`);
  if (exceptIds.length) {
    console.log(
      `except_ids (บัญชีที่มีอยู่แล้ว): ${exceptIds.map(String).join(", ")}`,
    );
  }
  console.log("รอ QR… (Ctrl+C ยกเลิก)");

  try {
    let auth = await pollQrLogin({
      session,
      exceptIds,
      onToken: (link) => printQr(link),
      signal: ac.signal,
    }).then((r) => r.authorization);

    try {
      await session.syncAuth(WEBK_APP_CONFIG.baseDcId);
    } catch {
      /* best-effort */
    }

    if (auth.setup_password_required) {
      const password = await promptHidden(rl, "Cloud password (2FA): ");
      auth = await checkCloudPasswordAfterLogin(session, password);
    }

    printSuccess(session, auth.user, {
      makeDefault: !explicitAccount,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "SESSION_PASSWORD_NEEDED" ||
        isSessionPasswordNeeded(error))
    ) {
      const password = await promptHidden(rl, "Cloud password (2FA): ");
      const auth = await checkCloudPasswordAfterLogin(session, password);
      printSuccess(session, auth.user, {
        makeDefault: !explicitAccount,
      });
      rl.close();
      return;
    }
    console.error("Login failed:", error);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

function printSuccess(
  session: MtprotoCoreSession,
  user: Record<string, unknown>,
  options: { makeDefault: boolean },
) {
  const phone = user.phone ? String(user.phone) : undefined;
  let accountId = session.accountId;
  if (phone) {
    accountId = accountIdFromPhone(phone);
  }

  const db = openMtprotoSessionDatabase(session.dbPath);
  if (accountId !== session.accountId) {
    migrateMtprotoKvSlot(db, session.accountId, accountId);
  }
  upsertSessionAccount(db, {
    accountId,
    phone,
    userId: user.id as string | bigint,
    displayName: String(user.first_name ?? ""),
    makeDefault: options.makeDefault,
  });
  db.close();

  console.log("\nLogged in (QR).");
  console.log(
    JSON.stringify(
      {
        account: accountId,
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        phone,
      },
      null,
      2,
    ),
  );
  console.log(`\nVerify: TELEGRAM_ACCOUNT=${accountId} bun run test:profile`);
  if (!options.makeDefault) {
    console.log(
      `(ไม่ได้ตั้งเป็น default — ใช้ TELEGRAM_ACCOUNT=${accountId} กับสคริปต์อื่น)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
