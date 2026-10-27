#!/usr/bin/env bun
/**
 * Import MTProto KV from a legacy per-phone SQLite into the shared multi-account DB.
 * Usage: bun run scripts/session-import.ts --from .telegram/sqlite/accounts/15551234567.sqlite --account 15551234567
 */
import { resolve } from "node:path";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  importSessionFromDatabase,
  openMtprotoSessionDatabase,
  upsertSessionAccount,
} from "../src/storage/sqlite";

function parseArgs(argv: string[]) {
  let from: string | undefined;
  let account: string | undefined;
  let dbPath = defaultSessionDbPath();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from" && argv[i + 1]) from = resolve(argv[++i]);
    else if (a === "--account" && argv[i + 1]) account = argv[++i];
    else if (a === "--db" && argv[i + 1]) dbPath = resolve(argv[++i]);
  }
  if (!from || !account) {
    console.error("Usage: session-import.ts --from PATH --account ID|+phone [--db PATH]");
    process.exit(1);
  }
  const accountId = /^\+?\d/.test(account)
    ? accountIdFromPhone(account)
    : account;
  return { from, accountId, dbPath };
}

const { from, accountId, dbPath } = parseArgs(process.argv.slice(2));
const db = openMtprotoSessionDatabase(dbPath);
const n = importSessionFromDatabase(db, from, accountId, "default");
upsertSessionAccount(db, {
  accountId,
  phone: accountId.match(/^\d+$/) ? `+${accountId}` : undefined,
  makeDefault: false,
});
db.close();
console.log(`Imported ${n} keys → account "${accountId}" in ${dbPath}`);
