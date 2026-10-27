import { createMtprotoSession } from "../src/mtproto/client/create-session";
import {
  getFullUser,
  type UserFullResult,
} from "../src/services/users/profile";

function summarizeProfile(result: UserFullResult) {
  const user = result.users?.[0];
  return {
    id: user?.id,
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
    phone: user?.phone ? `${user.phone.slice(0, 4)}…` : undefined,
    about: result.full_user?.about,
  };
}

async function main() {
  const session = createMtprotoSession();
  console.log(`Account: ${session.accountId}  DB: ${session.dbPath}`);

  const adapter = {
    invoke<T>(method: string, params: Record<string, unknown>) {
      return session.call<T>(method, params);
    },
  };

  console.log("Calling users.getFullUser (inputUserSelf)…");
  try {
    const full = await getFullUser(adapter as never);
    console.log("OK — profile:");
    console.log(JSON.stringify(summarizeProfile(full), null, 2));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? JSON.stringify(error, null, 2)
          : String(error);
    console.error("Profile fetch failed:", message);
    if (/AUTH_KEY|SESSION|401|406/.test(message)) {
      console.error(`
No authorized MTProto session yet.
  1. Log in at https://web.telegram.org/k/ (same account).
  2. Run: bun run login:phone (session in TELEGRAM_SESSION_DB / .telegram-session.sqlite).
  3. Re-run: bun run scripts/test-profile.ts
`);
    }
    process.exitCode = 1;
  }
}

main();
