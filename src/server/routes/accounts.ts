import { Elysia, t } from "elysia";
import { resolve } from "node:path";
import {
  accountIdFromPhone,
  defaultSessionDbPath,
  importSessionFromDatabase,
  listSessionAccounts,
  openMtprotoSessionDatabase,
  upsertSessionAccount,
  normalizeAccountId,
} from "../../storage/sqlite";
import { existsSync, rmSync } from "node:fs";
import { TELEGRAM_PATHS } from "../../storage/sqlite";
import { createMtprotoSession } from "../../mtproto/client/create-session";
import { getFullUser } from "../../services/users/profile";

export const accountsRoutes = new Elysia({ prefix: "/v1/accounts" })
  .get("/", () => {
    const dbPath = defaultSessionDbPath();
    const db = openMtprotoSessionDatabase(dbPath);
    const rows = listSessionAccounts(db);
    db.close();
    return { dbPath, accounts: rows };
  })
  .get("/:accountId/profile", async ({ params, set }) => {
    try {
      const session = createMtprotoSession({ account: params.accountId });
      const adapter = {
        invoke<T>(method: string, p: Record<string, unknown>) {
          return session.call<T>(method, p);
        },
      };
      const full = await getFullUser(adapter as never);
      const user = full.users?.[0];
      return {
        account: session.accountId,
        id: user?.id,
        username: user?.username,
        firstName: user?.first_name,
        lastName: user?.last_name,
        about: full.full_user?.about,
      };
    } catch (e) {
      set.status = 400;
      return { error: e instanceof Error ? e.message : String(e) };
    }
  })
  .post(
    "/import",
    ({ body, set }) => {
      const from = resolve(body.fromPath);
      if (!existsSync(from)) {
        set.status = 400;
        return { error: `fromPath not found: ${from}` };
      }
      const accountId = /^\+?\d/.test(body.account)
        ? accountIdFromPhone(body.account)
        : normalizeAccountId(body.account);
      const dbPath = defaultSessionDbPath();
      const db = openMtprotoSessionDatabase(dbPath);
      const n = importSessionFromDatabase(db, from, accountId, "default");
      upsertSessionAccount(db, {
        accountId,
        phone: accountId.match(/^\d+$/) ? `+${accountId}` : undefined,
        makeDefault: false,
      });
      db.close();
      return { importedKeys: n, accountId, dbPath };
    },
    {
      body: t.Object({
        fromPath: t.String(),
        account: t.String(),
      }),
    },
  )
  .post("/:accountId/reset", ({ params }) => {
    let accountId = params.accountId;
    if (/^\+?\d/.test(accountId)) {
      accountId = accountIdFromPhone(accountId);
    } else {
      accountId = normalizeAccountId(accountId);
    }
    const dbPath = defaultSessionDbPath();
    const db = openMtprotoSessionDatabase(dbPath);
    const kv = db.run(
      "DELETE FROM mtproto_session_kv WHERE account_id = ?",
      [accountId],
    );
    const acc = db.run("DELETE FROM telegram_accounts WHERE account_id = ?", [
      accountId,
    ]);
    db.close();

    const pending = TELEGRAM_PATHS.pendingLogin();
    if (existsSync(pending)) rmSync(pending);

    const accountFile = TELEGRAM_PATHS.accountSqlite(accountId);
    for (const p of [accountFile, `${accountFile}-wal`, `${accountFile}-shm`]) {
      if (existsSync(p)) rmSync(p);
    }

    return {
      accountId,
      kvDeleted: kv.changes,
      accountsDeleted: acc.changes,
    };
  });
