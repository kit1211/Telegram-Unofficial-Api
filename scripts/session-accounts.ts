#!/usr/bin/env bun
import {
  defaultSessionDbPath,
  listSessionAccounts,
  openMtprotoSessionDatabase,
} from "../src/storage/sqlite";

const dbPath = process.argv[2] ?? defaultSessionDbPath();
const db = openMtprotoSessionDatabase(dbPath);
const rows = listSessionAccounts(db);
db.close();

console.log(`Session DB: ${dbPath}\n`);
if (rows.length === 0) {
  console.log("No accounts registered (KV may still exist under account id `default`).");
  console.log("Use TELEGRAM_ACCOUNT or --account on login/scripts.");
  process.exit(0);
}

for (const row of rows) {
  const def = row.is_default ? " [default]" : "";
  console.log(
    `${row.account_id}${def}  user=${row.user_id ?? "—"}  phone=${row.phone ?? "—"}  ${row.display_name ?? ""}`,
  );
}
