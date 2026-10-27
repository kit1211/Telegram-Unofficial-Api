import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Root for local Telegram auth artifacts (gitignored). */
export const TELEGRAM_DATA_DIR = resolve(
  process.env.TELEGRAM_DATA_DIR ?? ".telegram",
);

export const TELEGRAM_PATHS = {
  root: TELEGRAM_DATA_DIR,
  pendingDir: () => join(TELEGRAM_DATA_DIR, "pending"),
  pendingLogin: () => join(TELEGRAM_DATA_DIR, "pending", "login-pending.json"),
  legacyDir: () => join(TELEGRAM_DATA_DIR, "legacy"),
  legacySession: () => join(TELEGRAM_DATA_DIR, "legacy", "session"),
  sqliteDir: () => join(TELEGRAM_DATA_DIR, "sqlite"),
  /** Multi-account MTProto KV (default DB). */
  sessionDb: () => join(TELEGRAM_DATA_DIR, "sqlite", "session.sqlite"),
  /** Optional per-account SQLite before import into `sessionDb`. */
  accountSqlite: (accountId: string) =>
    join(TELEGRAM_DATA_DIR, "sqlite", "accounts", `${accountId}.sqlite`),
} as const;

const ROOT_LEGACY_FILES: { from: string; to: () => string }[] = [
  { from: ".telegram-login-pending.json", to: TELEGRAM_PATHS.pendingLogin },
  { from: ".telegram-session", to: TELEGRAM_PATHS.legacySession },
  { from: ".telegram-session.sqlite", to: TELEGRAM_PATHS.sessionDb },
];

function moveWalShm(baseFrom: string, baseTo: string) {
  for (const ext of ["-wal", "-shm"]) {
    const from = baseFrom + ext;
    const to = baseTo + ext;
    if (existsSync(from) && !existsSync(to)) {
      renameSync(from, to);
    }
  }
}

/** Create layout and move old repo-root session files once. */
export function ensureTelegramDataLayout(): void {
  mkdirSync(TELEGRAM_PATHS.pendingDir(), { recursive: true });
  mkdirSync(TELEGRAM_PATHS.legacyDir(), { recursive: true });
  mkdirSync(TELEGRAM_PATHS.sqliteDir(), { recursive: true });
  mkdirSync(join(TELEGRAM_PATHS.sqliteDir(), "accounts"), { recursive: true });

  for (const { from, to } of ROOT_LEGACY_FILES) {
    const src = resolve(from);
    const dest = to();
    if (!existsSync(src)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    if (!existsSync(dest)) {
      renameSync(src, dest);
      if (from.endsWith(".sqlite")) moveWalShm(src, dest);
    }
  }

  // Generic: .telegram-session-<id>.sqlite at repo root → accounts/
  const root = resolve(".");
  for (const name of readdirSync(root)) {
    const m = /^\.telegram-session-(\d+)\.sqlite$/.exec(name);
    if (!m) continue;
    const src = join(root, name);
    const dest = TELEGRAM_PATHS.accountSqlite(m[1]);
    if (!existsSync(dest)) {
      renameSync(src, dest);
      moveWalShm(src, dest);
    }
  }
}
