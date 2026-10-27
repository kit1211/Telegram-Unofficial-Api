import { WEBK_APP_CONFIG } from "../../config/webk";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import type { MtprotoCoreSession } from "../../mtproto/client/mtproto-core-session";
import { webkCodeSettings } from "./code-settings";
import {
  buildInputCheckPasswordSrp,
  type AccountPasswordPayload,
} from "./password-check";

export interface AuthSentCode {
  _: "auth.sentCode";
  phone_code_hash: string;
  type?: { _: string; length?: number };
}

export interface AuthAuthorization {
  _: "auth.authorization";
  user: Record<string, unknown>;
  setup_password_required?: boolean;
}

export interface AuthSignUpRequired {
  _: "auth.authorizationSignUpRequired";
  terms_of_service?: unknown;
}

export type SignInResult =
  | AuthAuthorization
  | AuthSignUpRequired;

export interface PhoneLoginCredentials {
  phoneNumber: string;
  phoneCode: string;
  phoneCodeHash: string;
}

export interface SignUpDetails {
  firstName: string;
  lastName?: string;
}

export interface PhoneLoginOptions {
  session: MtprotoCoreSession;
  phoneNumber: string;
  phoneCode: string;
  phoneCodeHash: string;
  /** Cloud password when `SESSION_PASSWORD_NEEDED`. */
  password?: string;
  signUp?: SignUpDetails;
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim().replace(/\s+/g, "");
  if (!trimmed.startsWith("+")) {
    throw new Error("Phone must be in international format, e.g. +66812345678");
  }
  return trimmed;
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

export function isSessionPasswordNeeded(error: unknown): boolean {
  if (isRpcError(error)) {
    return error.error_message === "SESSION_PASSWORD_NEEDED";
  }
  if (error instanceof Error) {
    return error.message.includes("SESSION_PASSWORD_NEEDED");
  }
  return false;
}

export async function sendPhoneCode(
  session: MtprotoCoreSession,
  phoneNumber: string,
): Promise<AuthSentCode> {
  const phone_number = normalizePhone(phoneNumber);
  return callWithDcMigrate<AuthSentCode>(session, "auth.sendCode", {
    phone_number,
    api_id: WEBK_APP_CONFIG.id,
    api_hash: WEBK_APP_CONFIG.hash,
    settings: webkCodeSettings(),
  });
}

export async function signInWithPhoneCode(
  session: MtprotoCoreSession,
  creds: PhoneLoginCredentials,
): Promise<SignInResult> {
  const phone_number = normalizePhone(creds.phoneNumber);
  return callWithDcMigrate<SignInResult>(session, "auth.signIn", {
    phone_number,
    phone_code_hash: creds.phoneCodeHash,
    phone_code: creds.phoneCode.trim(),
  });
}

export async function signUpWithPhoneCode(
  session: MtprotoCoreSession,
  creds: PhoneLoginCredentials,
  details: SignUpDetails,
): Promise<AuthAuthorization> {
  const phone_number = normalizePhone(creds.phoneNumber);
  return callWithDcMigrate<AuthAuthorization>(session, "auth.signUp", {
    phone_number,
    phone_code_hash: creds.phoneCodeHash,
    phone_code: creds.phoneCode.trim(),
    first_name: details.firstName.trim(),
    last_name: (details.lastName ?? "").trim(),
  });
}

async function checkPasswordAndAuthorize(
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

/**
 * Full phone OTP login: signIn (or signUp) and optional 2FA cloud password.
 */
export async function loginWithPhoneOtp(
  options: PhoneLoginOptions,
): Promise<AuthAuthorization> {
  const creds: PhoneLoginCredentials = {
    phoneNumber: options.phoneNumber,
    phoneCode: options.phoneCode,
    phoneCodeHash: options.phoneCodeHash,
  };

  let result: SignInResult;
  try {
    result = await signInWithPhoneCode(options.session, creds);
  } catch (error) {
    if (isSessionPasswordNeeded(error)) {
      if (!options.password) {
        throw new Error("SESSION_PASSWORD_NEEDED", { cause: error });
      }
      return checkPasswordAndAuthorize(options.session, options.password);
    }
    throw error;
  }

  if (result._ === "auth.authorizationSignUpRequired") {
    if (!options.signUp?.firstName) {
      throw new Error("SIGN_UP_REQUIRED", { cause: result });
    }
    return signUpWithPhoneCode(options.session, creds, options.signUp);
  }

  return result;
}
