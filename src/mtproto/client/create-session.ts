import { MtprotoCoreSession } from "./mtproto-core-session";
import type { MtprotoCoreSessionOptions } from "./mtproto-core-session";
import {
  defaultSessionDbPath,
  openMtprotoSessionDatabase,
  resolveSessionAccountId,
} from "../../storage/sqlite";

export interface CreateSessionOptions extends MtprotoCoreSessionOptions {
  /** Account slug or phone (see TELEGRAM_ACCOUNT). */
  account?: string;
}

/** CLI / scripts: one place to build a multi-account session. */
export function createMtprotoSession(
  options: CreateSessionOptions = {},
): MtprotoCoreSession {
  const dbPath = options.dbPath ?? defaultSessionDbPath();
  const db = openMtprotoSessionDatabase(dbPath);
  const accountId = resolveSessionAccountId(db, options.account);
  db.close();
  return new MtprotoCoreSession({
    ...options,
    dbPath,
    accountId,
  });
}

export function parseAccountCliArgs(argv: string[]): {
  account?: string;
  dbPath?: string;
  rest: string[];
} {
  let account: string | undefined;
  let dbPath: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--account" || arg === "-a") && argv[i + 1]) {
      account = argv[++i];
    } else if ((arg === "--db" || arg === "--session") && argv[i + 1]) {
      dbPath = argv[++i];
    } else {
      rest.push(arg);
    }
  }
  return { account, dbPath, rest };
}
