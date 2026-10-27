import { WEBK_APP_CONFIG } from "../../config/webk";
import type { MtprotoCoreSession } from "../../mtproto/client/mtproto-core-session";
import {
  buildInputCheckPasswordSrp,
  type AccountPasswordPayload,
} from "./password-check";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";

/** Poll interval (seconds) — matches WebK `SignQRCard`. */
export const QR_LOGIN_POLL_INTERVAL_SEC = 3;

export type AuthLoginToken =
  | { _: "auth.loginToken"; expires: number; token: Uint8Array }
  | { _: "auth.loginTokenMigrateTo"; dc_id: number; token: Uint8Array }
  | {
      _: "auth.loginTokenSuccess";
      authorization: AuthAuthorization;
    };

export interface AuthAuthorization {
  _: "auth.authorization";
  user: Record<string, unknown>;
  setup_password_required?: boolean;
}

function isRpcError(
  error: unknown,
): error is { _: "mt_rpc_error"; error_message: string; error_code: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { _: string })._ === "mt_rpc_error"
  );
}

export function rpcErrorType(error: unknown): string | undefined {
  if (isRpcError(error)) return error.error_message;
  if (error instanceof Error) {
    const match = error.message.match(/\[400\] ([A-Z_]+)/);
    return match?.[1] ?? error.message;
  }
  return undefined;
}

export function isSessionPasswordNeeded(error: unknown): boolean {
  const t = rpcErrorType(error);
  return t === "SESSION_PASSWORD_NEEDED";
}

/** `tg://login?token=` + base64url (see core.telegram.org/api/qr-login). */
export function loginTokenToDeepLink(token: Uint8Array): string {
  const b64 = Buffer.from(token).toString("base64");
  const urlSafe = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `tg://login?token=${urlSafe}`;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface QrLoginPollOptions {
  session: MtprotoCoreSession;
  exceptIds?: bigint[];
  onToken?: (deepLink: string, expires: number) => void;
  signal?: AbortSignal;
}

export interface QrLoginResult {
  authorization: AuthAuthorization;
}

async function exportOnce(
  session: MtprotoCoreSession,
  exceptIds: bigint[],
  state: { initDcId?: number },
): Promise<AuthLoginToken> {
  let loginToken = await session.call<AuthLoginToken>("auth.exportLoginToken", {
    api_id: WEBK_APP_CONFIG.id,
    api_hash: WEBK_APP_CONFIG.hash,
    except_ids: exceptIds,
  });

  if (loginToken._ === "auth.loginTokenMigrateTo") {
    const dcId = loginToken.dc_id;
    if (state.initDcId === undefined) {
      state.initDcId = dcId;
      await session.setDefaultDc(dcId);
    }
    loginToken = await session.call<AuthLoginToken>(
      "auth.importLoginToken",
      { token: loginToken.token },
      { dcId },
    );
  }

  return loginToken;
}

/**
 * Poll `auth.exportLoginToken` until scan succeeds or aborted.
 * Server flow documented in poc/mytelegram `ExportLoginTokenHandler` + QrCode aggregate.
 */
export async function pollQrLogin(
  options: QrLoginPollOptions,
): Promise<QrLoginResult> {
  const exceptIds = options.exceptIds ?? [];
  const dcState: { initDcId?: number } = {};
  let lastToken: Uint8Array | undefined;

  while (!options.signal?.aborted) {
    try {
      const loginToken = await exportOnce(
        options.session,
        exceptIds,
        dcState,
      );

      if (loginToken._ === "auth.loginTokenSuccess") {
        return { authorization: loginToken.authorization };
      }
      if (loginToken._ !== "auth.loginToken") {
        throw new Error(`Unexpected QR token state: ${loginToken._}`);
      }

      const token = loginToken.token;
      if (!lastToken || !bytesEqual(lastToken, token)) {
        lastToken = token;
        options.onToken?.(
          loginTokenToDeepLink(token),
          loginToken.expires,
        );
      }

      const nowSec = Date.now() / 1000;
      const waitSec = Math.max(
        0,
        loginToken.expires - nowSec - QR_LOGIN_POLL_INTERVAL_SEC,
      );
      const sleepMs =
        waitSec > QR_LOGIN_POLL_INTERVAL_SEC
          ? QR_LOGIN_POLL_INTERVAL_SEC * 1000
          : Math.max(500, Math.floor(waitSec * 1000));
      await Bun.sleep(sleepMs);
    } catch (error) {
      const type = rpcErrorType(error);
      if (type === "AUTH_TOKEN_EXPIRED") {
        lastToken = undefined;
        continue;
      }
      if (type === "SESSION_PASSWORD_NEEDED") {
        throw new Error("SESSION_PASSWORD_NEEDED", { cause: error });
      }
      throw error;
    }
  }

  throw new Error("QR login aborted");
}

export async function checkCloudPasswordAfterLogin(
  session: MtprotoCoreSession,
  password: string,
): Promise<AuthAuthorization> {
  const accountPassword = await callWithDcMigrate<AccountPasswordPayload>(
    session,
    "account.getPassword",
    {},
  );
  const check = await buildInputCheckPasswordSrp(accountPassword, password);
  return callWithDcMigrate<AuthAuthorization>(session, "auth.checkPassword", {
    password: check,
  });
}
