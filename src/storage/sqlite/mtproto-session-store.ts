import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ensureAccountsSchema,
  resolveSessionAccountId,
} from "./session-accounts";
import {
  ensureTelegramDataLayout,
  TELEGRAM_PATHS,
} from "../telegram-paths";

/** Key-value adapter expected by `@mtproto/core` Storage (`storageOptions.instance`). */
export interface MtprotoKvStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS mtproto_session_kv (
  account_id TEXT NOT NULL DEFAULT 'default',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, key)
);
`;

function tableHasAccountIdColumn(db: Database): boolean {
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(mtproto_session_kv)").all();
  if (cols.length === 0) return true;
  return cols.some((c) => c.name === "account_id");
}

function migrateV1SessionTable(db: Database): void {
  if (tableHasAccountIdColumn(db)) return;
  db.exec(`
    CREATE TABLE mtproto_session_kv_v2 (
      account_id TEXT NOT NULL DEFAULT 'default',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (account_id, key)
    );
    INSERT INTO mtproto_session_kv_v2 (account_id, key, value, updated_at)
      SELECT 'default', key, value, updated_at FROM mtproto_session_kv;
    DROP TABLE mtproto_session_kv;
    ALTER TABLE mtproto_session_kv_v2 RENAME TO mtproto_session_kv;
  `);
}

export function openMtprotoSessionDatabase(dbPath: string): Database {
  ensureTelegramDataLayout();
  const absolute = resolve(dbPath);
  mkdirSync(dirname(absolute), { recursive: true });
  const db = new Database(absolute);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_V2);
  migrateV1SessionTable(db);
  ensureAccountsSchema(db);
  return db;
}

export function createMtprotoSqliteStorage(
  db: Database,
  accountId: string,
): MtprotoKvStorage {
  const getStmt = db.query<{ value: string }, [string, string]>(
    "SELECT value FROM mtproto_session_kv WHERE account_id = ? AND key = ?",
  );
  const upsertStmt = db.query(
    `INSERT INTO mtproto_session_kv (account_id, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );

  return {
    async get(key: string) {
      const row = getStmt.get(accountId, key);
      return row?.value;
    },
    async set(key: string, value: string) {
      upsertStmt.run(accountId, key, value, Date.now());
    },
  };
}

function countKeysForAccount(db: Database, accountId: string): number {
  const row = db
    .query<{ n: number }, [string]>(
      "SELECT COUNT(*) AS n FROM mtproto_session_kv WHERE account_id = ?",
    )
    .get(accountId);
  return row?.n ?? 0;
}

/**
 * Import keys from legacy configstore file (default @mtproto/core `.telegram-session` JSON).
 */
export function migrateLegacySessionFile(
  db: Database,
  legacyConfigPath: string,
  accountId = "default",
): number {
  const legacyPath = resolve(legacyConfigPath);
  if (!existsSync(legacyPath)) return 0;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(legacyPath, "utf8")) as Record<string, unknown>;
  } catch {
    return 0;
  }

  const upsertStmt = db.query(
    `INSERT INTO mtproto_session_kv (account_id, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );
  let imported = 0;
  const now = Date.now();
  for (const [key, value] of Object.entries(raw)) {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    upsertStmt.run(accountId, key, serialized, now);
    imported++;
  }
  return imported;
}

/** Copy MTProto KV from another SQLite file (e.g. per-phone `.telegram-session-*.sqlite`). */
export function importSessionFromDatabase(
  targetDb: Database,
  sourceDbPath: string,
  targetAccountId: string,
  sourceAccountId = "default",
): number {
  const source = openMtprotoSessionDatabase(sourceDbPath);
  const rows = source
    .query<{ key: string; value: string }, [string]>(
      "SELECT key, value FROM mtproto_session_kv WHERE account_id = ?",
    )
    .all(sourceAccountId);
  source.close();

  const upsertStmt = targetDb.query(
    `INSERT INTO mtproto_session_kv (account_id, key, value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  );
  const now = Date.now();
  for (const row of rows) {
    upsertStmt.run(targetAccountId, row.key, row.value, now);
  }
  return rows.length;
}

export interface SessionStoreOptions {
  dbPath: string;
  accountId: string;
  /** Configstore JSON path to import when this account's KV is empty. */
  legacyPath?: string;
}

export function createMtprotoSessionStore(
  options: SessionStoreOptions,
): MtprotoKvStorage {
  const db = openMtprotoSessionDatabase(options.dbPath);
  if (countKeysForAccount(db, options.accountId) === 0 && options.legacyPath) {
    migrateLegacySessionFile(db, options.legacyPath, options.accountId);
  }
  return createMtprotoSqliteStorage(db, options.accountId);
}

export function defaultSessionDbPath(): string {
  if (process.env.TELEGRAM_SESSION_DB) {
    return resolve(process.env.TELEGRAM_SESSION_DB);
  }
  if (process.env.TELEGRAM_SESSION_PATH) {
    return resolve(process.env.TELEGRAM_SESSION_PATH);
  }
  return TELEGRAM_PATHS.sessionDb();
}

export function defaultLegacySessionPath(): string {
  const env = process.env.TELEGRAM_SESSION_LEGACY;
  if (env) return resolve(env);
  return TELEGRAM_PATHS.legacySession();
}

export { TELEGRAM_PATHS, ensureTelegramDataLayout } from "../telegram-paths";

export { resolveSessionAccountId } from "./session-accounts";
