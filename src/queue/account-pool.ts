import {
  defaultSessionDbPath,
  listSessionAccounts,
  openMtprotoSessionDatabase,
  resolveSessionAccountId,
} from "../storage/sqlite";

/** Resolve account ids for a job (explicit list or all registered + default). */
export function resolveAccountPool(explicit?: string[]): string[] {
  const dbPath = defaultSessionDbPath();
  const db = openMtprotoSessionDatabase(dbPath);
  try {
    if (explicit?.length) {
      return explicit.map((a) => resolveSessionAccountId(db, a));
    }
    const rows = listSessionAccounts(db);
    const ids = rows.map((r) => r.account_id);
    if (ids.length === 0) {
      ids.push(resolveSessionAccountId(db, undefined));
    }
    return [...new Set(ids)];
  } finally {
    db.close();
  }
}

export function pickAccount(pool: string[], index: number): string {
  return pool[index % pool.length]!;
}
