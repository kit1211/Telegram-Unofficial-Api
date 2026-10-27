import MTProto from "@mtproto/core/envs/node";
import { WEBK_APP_CONFIG } from "../../config/webk";
import {
  createMtprotoSessionStore,
  defaultLegacySessionPath,
  defaultSessionDbPath,
  openMtprotoSessionDatabase,
  resolveSessionAccountId,
} from "../../storage/sqlite";
import type { RpcMethod } from "./mtproto-client";

export interface MtprotoCoreSessionOptions {
  /** SQLite file for MTProto session keys (default: `.telegram-session.sqlite`). */
  dbPath?: string;
  /** Account slot inside `dbPath` (env `TELEGRAM_ACCOUNT` if omitted). */
  accountId?: string;
  /** Legacy configstore JSON to import once if DB is empty. */
  legacyPath?: string;
  apiId?: number;
  apiHash?: string;
}

/**
 * Node MTProto client using the same api_id/hash as Telegram Web K.
 * Requires an existing authorized session in `storagePath` (login via Web export or prior auth).
 */
type MtprotoInstance = InstanceType<typeof MTProto>;

export class MtprotoCoreSession {
  private readonly mtproto: MtprotoInstance;

  readonly dbPath: string;

  readonly accountId: string;

  constructor(options: MtprotoCoreSessionOptions = {}) {
    this.dbPath = options.dbPath ?? defaultSessionDbPath();
    const db = openMtprotoSessionDatabase(this.dbPath);
    this.accountId =
      options.accountId ?? resolveSessionAccountId(db, undefined);
    db.close();
    const legacyPath = options.legacyPath ?? defaultLegacySessionPath();
    const storage = createMtprotoSessionStore({
      dbPath: this.dbPath,
      accountId: this.accountId,
      legacyPath,
    });

    this.mtproto = new MTProto({
      api_id: options.apiId ?? WEBK_APP_CONFIG.id,
      api_hash: options.apiHash ?? WEBK_APP_CONFIG.hash,
      storageOptions: { instance: storage },
    });
  }

  call<T = unknown>(
    method: RpcMethod | string,
    params: Record<string, unknown> = {},
    options: { syncAuth?: boolean; dcId?: number } = {},
  ): Promise<T> {
    return this.mtproto.call(method, params, options) as Promise<T>;
  }

  setDefaultDc(dcId: number): Promise<void> {
    return this.mtproto.setDefaultDc(dcId);
  }

  syncAuth(dcId: number): Promise<unknown[]> {
    return this.mtproto.syncAuth(dcId);
  }
}
