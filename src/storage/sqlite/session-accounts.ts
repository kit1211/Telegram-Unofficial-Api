import type { Database } from "bun:sqlite";

export interface SessionAccountRow {
  account_id: string;
  phone: string | null;
  user_id: string | null;
  display_name: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

const ACCOUNTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS telegram_accounts (
  account_id TEXT PRIMARY KEY NOT NULL,
  phone TEXT,
  user_id TEXT,
  display_name TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export function ensureAccountsSchema(db: Database): void {
  db.exec(ACCOUNTS_SCHEMA);
}

/** Stable id from E.164 phone: +15551234567 → 15551234567 */
export function accountIdFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error(`Invalid phone for account id: ${phone}`);
  }
  return digits;
}

/** Slug for TELEGRAM_ACCOUNT / --account (phone digits or [a-z0-9_-]). */
export function normalizeAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (/^\+?\d[\d\s-]{6,}$/.test(trimmed)) {
    return accountIdFromPhone(trimmed);
  }
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!slug) throw new Error(`Invalid account id: ${raw}`);
  return slug;
}

export function getDefaultAccountId(db: Database): string | undefined {
  ensureAccountsSchema(db);
  const row = db
    .query<{ account_id: string }, []>(
      "SELECT account_id FROM telegram_accounts WHERE is_default = 1 LIMIT 1",
    )
    .get();
  return row?.account_id;
}

export function listSessionAccounts(db: Database): SessionAccountRow[] {
  ensureAccountsSchema(db);
  return db
    .query<SessionAccountRow, []>(
      `SELECT account_id, phone, user_id, display_name, is_default, created_at, updated_at
       FROM telegram_accounts ORDER BY is_default DESC, updated_at DESC`,
    )
    .all();
}

export function upsertSessionAccount(
  db: Database,
  info: {
    accountId: string;
    phone?: string;
    userId?: string | bigint;
    displayName?: string;
    makeDefault?: boolean;
  },
): void {
  ensureAccountsSchema(db);
  const now = Date.now();
  const existing = db
    .query<{ account_id: string }, [string]>(
      "SELECT account_id FROM telegram_accounts WHERE account_id = ?",
    )
    .get(info.accountId);

  if (info.makeDefault) {
    db.run("UPDATE telegram_accounts SET is_default = 0");
  }

  if (existing) {
    db.run(
      `UPDATE telegram_accounts SET
         phone = COALESCE(?, phone),
         user_id = COALESCE(?, user_id),
         display_name = COALESCE(?, display_name),
         is_default = CASE WHEN ? = 1 THEN 1 ELSE is_default END,
         updated_at = ?
       WHERE account_id = ?`,
      [
        info.phone ?? null,
        info.userId != null ? String(info.userId) : null,
        info.displayName ?? null,
        info.makeDefault ? 1 : 0,
        now,
        info.accountId,
      ],
    );
    return;
  }

  db.run(
    `INSERT INTO telegram_accounts (account_id, phone, user_id, display_name, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      info.accountId,
      info.phone ?? null,
      info.userId != null ? String(info.userId) : null,
      info.displayName ?? null,
      info.makeDefault ? 1 : 0,
      now,
      now,
    ],
  );
}

export function resolveSessionAccountId(
  db: Database,
  explicit?: string,
): string {
  if (explicit?.trim()) return normalizeAccountId(explicit);
  const envAccount = process.env.TELEGRAM_ACCOUNT?.trim();
  if (envAccount) return normalizeAccountId(envAccount);
  const envPhone = process.env.TELEGRAM_PHONE?.trim();
  if (envPhone) return accountIdFromPhone(envPhone);
  return getDefaultAccountId(db) ?? "default";
}
