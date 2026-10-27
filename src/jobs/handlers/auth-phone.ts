import { WEBK_APP_CONFIG } from "../../config/webk";
import { MtprotoCoreSession } from "../../mtproto/client/mtproto-core-session";
import {
  accountIdFromPhone,
  openMtprotoSessionDatabase,
  upsertSessionAccount,
  ensureTelegramDataLayout,
  defaultSessionDbPath,
} from "../../storage/sqlite";
import {
  loginWithPhoneOtp,
  sendPhoneCode,
  isSessionPasswordNeeded,
} from "../../services/auth/phone-login";
import { getJobInput, setJobMeta } from "../../queue/job-meta";
import type { AuthPhonePayload } from "../types";

async function waitForInput(
  jobId: string,
  field: string,
  timeoutMs = 600_000,
): Promise<string | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await getJobInput(jobId, field);
    if (val) return val;
    await Bun.sleep(2000);
  }
  return undefined;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}…${phone.slice(-2)}`;
}

export async function runAuthPhone(payload: AuthPhonePayload): Promise<void> {
  ensureTelegramDataLayout();
  const jobId = payload.jobId;
  const phone = payload.phone.trim();
  const accountId =
    payload.accountId || accountIdFromPhone(phone) || "default";
  const dbPath = defaultSessionDbPath();

  await setJobMeta(jobId, {
    type: "auth.phone",
    status: "active",
    params: { phone: maskPhone(phone), accountId },
  });

  const session = new MtprotoCoreSession({ dbPath, accountId });
  const sent = await sendPhoneCode(session, phone);

  await setJobMeta(jobId, {
    type: "auth.phone",
    status: "waiting_input",
    input: { needs: "otp" },
    params: { phone: maskPhone(phone), accountId },
  });

  const phoneCode = await waitForInput(jobId, "code");
  if (!phoneCode) {
    throw new Error("OTP input timeout");
  }

  await setJobMeta(jobId, {
    type: "auth.phone",
    status: "active",
    input: undefined,
  });

  let password: string | undefined;
  try {
    const auth = await loginWithPhoneOtp({
      session,
      phoneNumber: phone,
      phoneCode,
      phoneCodeHash: sent.phone_code_hash,
    });
    await finishPhoneLogin(session, phone, auth.user, jobId);
    return;
  } catch (error) {
    if (error instanceof Error && error.message === "SIGN_UP_REQUIRED") {
      await setJobMeta(jobId, {
        type: "auth.phone",
        status: "waiting_input",
        input: { needs: "signup" },
      });
      const firstName = await waitForInput(jobId, "firstName");
      const lastName = await waitForInput(jobId, "lastName");
      if (!firstName) throw new Error("firstName required for sign up");
      const auth = await loginWithPhoneOtp({
        session,
        phoneNumber: phone,
        phoneCode,
        phoneCodeHash: sent.phone_code_hash,
        signUp: { firstName, lastName: lastName || undefined },
      });
      await finishPhoneLogin(session, phone, auth.user, jobId);
      return;
    }

    if (
      (error instanceof Error &&
        error.message === "SESSION_PASSWORD_NEEDED") ||
      isSessionPasswordNeeded(error)
    ) {
      await setJobMeta(jobId, {
        type: "auth.phone",
        status: "waiting_input",
        input: { needs: "password" },
      });
      password = await waitForInput(jobId, "password");
      if (!password) throw new Error("password input timeout");
      const auth = await loginWithPhoneOtp({
        session,
        phoneNumber: phone,
        phoneCode,
        phoneCodeHash: sent.phone_code_hash,
        password,
      });
      await finishPhoneLogin(session, phone, auth.user, jobId);
      return;
    }
    throw error;
  }
}

async function finishPhoneLogin(
  session: MtprotoCoreSession,
  phone: string,
  user: Record<string, unknown>,
  jobId: string,
): Promise<void> {
  const db = openMtprotoSessionDatabase(session.dbPath);
  upsertSessionAccount(db, {
    accountId: session.accountId,
    phone,
    userId: user.id as string | bigint,
    displayName: String(user.first_name ?? ""),
    makeDefault: true,
  });
  db.close();

  try {
    await session.syncAuth(WEBK_APP_CONFIG.baseDcId);
  } catch {
    /* best-effort */
  }

  await setJobMeta(jobId, {
    type: "auth.phone",
    status: "completed",
    result: {
      auth: {
        account: session.accountId,
        id: user.id,
        username: user.username,
        first_name: user.first_name,
      },
    },
  });
}
