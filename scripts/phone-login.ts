#!/usr/bin/env bun
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { MtprotoCoreSession } from "../src/mtproto/client/mtproto-core-session";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  openMtprotoSessionDatabase,
  ensureTelegramDataLayout,
  TELEGRAM_PATHS,
  upsertSessionAccount,
} from "../src/storage/sqlite";
import {
  isSessionPasswordNeeded,
  loginWithPhoneOtp,
  sendPhoneCode,
} from "../src/services/auth/phone-login";

function parseArgs(argv: string[]) {
  let dbPath = process.env.TELEGRAM_SESSION_DB ?? process.env.TELEGRAM_SESSION_PATH;
  let phone = process.env.TELEGRAM_PHONE;
  let account: string | undefined = process.env.TELEGRAM_ACCOUNT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--session" || arg === "--db") && argv[i + 1]) {
      dbPath = argv[++i];
    } else if ((arg === "--account" || arg === "-a") && argv[i + 1]) {
      account = argv[++i];
    } else if (arg === "--phone" && argv[i + 1]) {
      phone = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun run scripts/phone-login.ts [--db PATH] [--account ID] [--phone +66...]

Environment:
  TELEGRAM_SESSION_DB     default .telegram/sqlite/session.sqlite
  TELEGRAM_ACCOUNT        account slot (or derived from phone on login)
  TELEGRAM_PHONE          skip phone prompt if set
`);
      process.exit(0);
    }
  }
  return {
    dbPath: resolve(dbPath ?? defaultSessionDbPath()),
    phone,
    account,
  };
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 4)}…${phone.slice(-2)}`;
}

async function promptHidden(rl: readline.Interface, label: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await rl.question(label)).trim();
  }
  process.stdout.write(label);
  const chunks: string[] = [];
  return new Promise((resolvePromise) => {
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolvePromise(chunks.join("").trim());
        return;
      }
      if (char === "\u007f" || char === "\b") {
        chunks.pop();
        return;
      }
      if (char === "\u0003") {
        process.exit(130);
      }
      chunks.push(char);
    };
    stdin.on("data", onData);
  });
}

async function main() {
  ensureTelegramDataLayout();
  const { dbPath, phone: phoneArg, account: accountArg } = parseArgs(
    process.argv.slice(2),
  );
  const rl = readline.createInterface({ input, output });

  const phone =
    phoneArg?.trim() ||
    (await rl.question("Phone (+668…): ")).trim();

  const accountId =
    accountArg?.trim() ||
    (phone ? accountIdFromPhone(phone) : undefined) ||
    "default";

  const session = new MtprotoCoreSession({ dbPath, accountId });

  console.log(`Session DB: ${session.dbPath}`);
  console.log(`Account: ${session.accountId}`);
  console.log(`Sending OTP to ${maskPhone(phone)}…`);

  const sent = await sendPhoneCode(session, phone);
  writeFileSync(
    TELEGRAM_PATHS.pendingLogin(),
    JSON.stringify(
      {
        phone,
        phone_code_hash: sent.phone_code_hash,
        dbPath: session.dbPath,
        accountId: session.accountId,
      },
      null,
      2,
    ),
  );
  const codeType = sent.type?._?.replace("auth.sentCodeType", "") ?? "unknown";
  const length = sent.type && "length" in sent.type ? sent.type.length : "?";
  console.log(`Code type: ${codeType} (${length} digits)`);

  const phoneCode = (await rl.question("OTP code: ")).trim();
  let password: string | undefined;

  try {
    const auth = await loginWithPhoneOtp({
      session,
      phoneNumber: phone,
      phoneCode,
      phoneCodeHash: sent.phone_code_hash,
    });
    printSuccess(session, phone, auth.user);
  } catch (error) {
    if (error instanceof Error && error.message === "SIGN_UP_REQUIRED") {
      const firstName = (await rl.question("First name (new account): ")).trim();
      const lastName = (await rl.question("Last name (optional): ")).trim();
      const auth = await loginWithPhoneOtp({
        session,
        phoneNumber: phone,
        phoneCode,
        phoneCodeHash: sent.phone_code_hash,
        signUp: { firstName, lastName: lastName || undefined },
      });
      printSuccess(session, phone, auth.user);
      rl.close();
      return;
    }

    if (
      error instanceof Error &&
      error.message === "SESSION_PASSWORD_NEEDED"
    ) {
      password = await promptHidden(rl, "Cloud password (2FA): ");
      const auth = await loginWithPhoneOtp({
        session,
        phoneNumber: phone,
        phoneCode,
        phoneCodeHash: sent.phone_code_hash,
        password,
      });
      printSuccess(session, phone, auth.user);
      rl.close();
      return;
    }

    if (isSessionPasswordNeeded(error)) {
      password = await promptHidden(rl, "Cloud password (2FA): ");
      const auth = await loginWithPhoneOtp({
        session,
        phoneNumber: phone,
        phoneCode,
        phoneCodeHash: sent.phone_code_hash,
        password,
      });
      printSuccess(session, phone, auth.user);
      rl.close();
      return;
    }

    console.error("Login failed:", formatError(error));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

function printSuccess(
  session: MtprotoCoreSession,
  phone: string,
  user: Record<string, unknown>,
) {
  const db = openMtprotoSessionDatabase(session.dbPath);
  upsertSessionAccount(db, {
    accountId: session.accountId,
    phone,
    userId: user.id as string | bigint,
    displayName: String(user.first_name ?? ""),
    makeDefault: true,
  });
  db.close();

  console.log("\nLogged in.");
  console.log(
    JSON.stringify(
      {
        account: session.accountId,
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone ? maskPhone(String(user.phone)) : undefined,
      },
      null,
      2,
    ),
  );
  console.log(
    `\nVerify: TELEGRAM_ACCOUNT=${session.accountId} bun run test:profile`,
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error, null, 2);
  }
  return String(error);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exit(1);
});
