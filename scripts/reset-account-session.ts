#!/usr/bin/env bun
/**
 * Wipe MTProto KV + registry row for one account (fresh login).
 * Usage: bun run scripts/reset-account-session.ts [accountId|+phone]
 */
import { existsSync, rmSync } from "node:fs";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  normalizeAccountId,
  openMtprotoSessionDatabase,
  TELEGRAM_PATHS,
} from "../src/storage/sqlite";

const raw = process.argv[2];
if (!raw) {
  console.error("Usage: reset-account-session.ts 15551234567 | +15551234567");
  process.exit(1);
}

const accountId = /^\+?\d/.test(raw)
  ? accountIdFromPhone(raw)
  : normalizeAccountId(raw);

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

console.log(
  `Reset account "${accountId}" in ${dbPath} (kv changes: ${kv.changes}, accounts: ${acc.changes})`,
);
