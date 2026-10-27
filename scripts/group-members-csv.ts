/**
 * Dump supergroup/channel members to CSV, or invite users from CSV.
 *
 * Dump:
 *   bun run scripts/group-members-csv.ts dump @example_channel out.csv
 *
 * Invite (needs admin + invite_users on target):
 *   bun run scripts/group-members-csv.ts invite @target_group out.csv --limit 10 --delay-ms 2000
 *
 * CSV columns (dump): user_id, access_hash, username, first_name, last_name, is_bot
 * Invite uses user_id + access_hash (access_hash may expire — re-dump if invite fails).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createMtprotoSession,
  parseAccountCliArgs,
} from "../src/mtproto/client/create-session";
import { callWithDcMigrate } from "../src/mtproto/dc-migrate";

type AnyRecord = Record<string, unknown>;

const PAGE = 200;
const PAGE_DELAY_MS = 900;

function usage(): never {
  console.error(`
Usage:
  dump   <@username> <out.csv>
  invite <@target> <in.csv> [--account ID] [--limit N] [--delay-ms N] [--batch N]

Examples:
  bun run scripts/group-members-csv.ts dump example_channel ./data/members.csv
  bun run scripts/group-members-csv.ts invite target_group ./data/members.csv --limit 10
`);
  process.exit(1);
}

function parseUsername(raw: string): string {
  return raw.replace(/^@/, "").replace(/^https:\/\/t\.me\//, "").split("/")[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function floodWaitSeconds(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const msg = (error as { error_message?: string }).error_message;
  if (!msg) return undefined;
  const m = msg.match(/^FLOOD_WAIT_(\d+)$/);
  return m ? Number(m[1]) : undefined;
}

async function callRetry<T>(
  call: (method: string, params: AnyRecord) => Promise<T>,
  method: string,
  params: AnyRecord,
): Promise<T> {
  for (;;) {
    try {
      return await call(method, params);
    } catch (error) {
      const wait = floodWaitSeconds(error);
      if (wait === undefined) throw error;
      console.log(`  FLOOD_WAIT_${wait} — sleeping ${wait + 1}s…`);
      await sleep((wait + 1) * 1000);
    }
  }
}

function searchQueries(): string[] {
  const chars =
    "abcdefghijklmnopqrstuvwxyz0123456789_" +
    "กขคฆงจฉชซญดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
  return ["", ...chars.split("")];
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function resolveChannel(
  call: (m: string, p: AnyRecord) => Promise<unknown>,
  username: string,
) {
  const resolved = (await call("contacts.resolveUsername", {
    username,
  })) as AnyRecord;
  const chat = (resolved.chats as AnyRecord[])?.[0];
  if (!chat || chat._ !== "channel") {
    throw new Error(`@${username} is not a channel/supergroup`);
  }
  return {
    chat,
    inputChannel: {
      _: "inputChannel",
      channel_id: chat.id,
      access_hash: chat.access_hash,
    },
    inputPeer: {
      _: "inputPeerChannel",
      channel_id: chat.id,
      access_hash: chat.access_hash,
    },
  };
}

function writeMemberCsv(outPath: string, seen: Map<string, AnyRecord>) {
  const header = "user_id,access_hash,username,first_name,last_name,is_bot\n";
  const lines = [...seen.values()].map((u) => {
    const row = [
      String(u.id),
      String(u.access_hash ?? ""),
      String(u.username ?? ""),
      String(u.first_name ?? ""),
      String(u.last_name ?? ""),
      u.bot ? "1" : "0",
    ].map((c) => csvEscape(c));
    return row.join(",");
  });
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, header + lines.join("\n") + "\n", "utf-8");
}

function loadExistingCsv(outPath: string): Map<string, AnyRecord> {
  const seen = new Map<string, AnyRecord>();
  try {
    for (const row of parseCsv(readFileSync(outPath, "utf-8"))) {
      seen.set(String(row.user_id), {
        id: row.user_id,
        access_hash: row.access_hash,
        username: row.username || undefined,
        first_name: row.first_name,
        last_name: row.last_name,
        bot: row.is_bot,
      });
    }
  } catch {
    /* fresh dump */
  }
  return seen;
}

async function fetchParticipantsPage(
  call: (method: string, params: AnyRecord) => Promise<unknown>,
  inputChannel: AnyRecord,
  filter: AnyRecord,
  offset: number,
): Promise<AnyRecord> {
  return callRetry(call, "channels.getParticipants", {
    channel: inputChannel,
    filter,
    offset,
    limit: PAGE,
    hash: BigInt(0),
  }) as Promise<AnyRecord>;
}

async function paginateFilter(
  call: (method: string, params: AnyRecord) => Promise<unknown>,
  inputChannel: AnyRecord,
  filter: AnyRecord,
  label: string,
  seen: Map<string, AnyRecord>,
  outPath: string,
) {
  let offset = 0;
  let total = 0;
  while (true) {
    const part = await fetchParticipantsPage(
      call,
      inputChannel,
      filter,
      offset,
    );
    const users = (part.users as AnyRecord[]) ?? [];
    if (typeof part.count === "number") total = part.count;
    if (users.length === 0) break;

    for (const u of users) seen.set(String(u.id), u);
    offset += users.length;
    console.log(`  [${label}] offset ${offset}/${total || "?"} unique ${seen.size}`);
    writeMemberCsv(outPath, seen);
    if (users.length < PAGE || (total > 0 && offset >= total)) break;
    await sleep(PAGE_DELAY_MS);
  }
}

async function dumpMembers(username: string, outPath: string, account?: string) {
  const session = createMtprotoSession({ account });
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);

  const { chat, inputChannel } = await resolveChannel(call, username);

  const full = await callRetry(call, "channels.getFullChannel", {
    channel: inputChannel,
  });
  const canView = full.full_chat?.can_view_participants !== false;
  if (!canView) {
    throw new Error(
      "can_view_participants is false — cannot dump member list via API",
    );
  }

  const reported = Number(full.full_chat?.participants_count ?? 0);
  const seen = loadExistingCsv(outPath);
  if (seen.size) console.log(`Resume: ${seen.size} rows already in ${outPath}`);

  console.log(`Dump @${username} (${chat.title}) ~${reported} members…`);

  await paginateFilter(
    call,
    inputChannel,
    { _: "channelParticipantsRecent" },
    "recent",
    seen,
    outPath,
  );

  if (seen.size < reported * 0.95) {
    console.log(
      `Unique ${seen.size} < reported ${reported} — search pass (Telegram often caps ~10k per filter)…`,
    );
    for (const q of searchQueries()) {
      await paginateFilter(
        call,
        inputChannel,
        { _: "channelParticipantsSearch", q },
        `search:${q === "" ? "(empty)" : q}`,
        seen,
        outPath,
      );
      if (seen.size >= reported) break;
      await sleep(PAGE_DELAY_MS);
    }
  }

  writeMemberCsv(outPath, seen);
  console.log(`Done: ${seen.size} unique rows → ${outPath}`);
}

function parseCsv(text: string): AnyRecord[] {
  const lines = text.trim().split(/\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);
  const out: AnyRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const user_id = cols[idx("user_id")];
    const access_hash = cols[idx("access_hash")];
    if (!user_id || !access_hash) continue;
    out.push({
      user_id,
      access_hash,
      username: cols[idx("username")] ?? "",
      is_bot: cols[idx("is_bot")] === "1",
    });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result;
}

function flag(name: string, def: number): number {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return Number(process.argv[i + 1] ?? def);
}

async function inviteFromCsv(
  targetUsername: string,
  csvPath: string,
  limit: number,
  delayMs: number,
  batchSize: number,
  account?: string,
) {
  const session = createMtprotoSession({ account });
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);

  const { inputChannel } = await resolveChannel(call, targetUsername);
  const rows = parseCsv(readFileSync(csvPath, "utf-8"))
    .filter((r) => !r.is_bot)
    .slice(0, limit);

  const selfId = String(
    (
      await call<AnyRecord>("users.getFullUser", {
        id: { _: "inputUserSelf" },
      })
    ).users?.[0]?.id,
  );

  const toInvite = rows.filter((r) => String(r.user_id) !== selfId);
  console.log(
    `Invite up to ${toInvite.length} users → @${targetUsername} (batch ${batchSize})`,
  );

  for (let i = 0; i < toInvite.length; i += batchSize) {
    const batch = toInvite.slice(i, i + batchSize);
    const inputUsers = batch.map((r) => ({
      _: "inputUser",
      user_id: r.user_id,
      access_hash: BigInt(String(r.access_hash)),
    }));

    try {
      const result = (await call("channels.inviteToChannel", {
        channel: inputChannel,
        users: inputUsers,
      })) as AnyRecord;
      const missing = (result.missing_invitees as AnyRecord[]) ?? [];
      console.log(
        `  batch ${i / batchSize + 1}: ok, missing_invitees=${missing.length}`,
      );
      if (missing.length) {
        for (const m of missing) {
          console.log(
            `    skip user_id=${m.user_id} premium_would_allow=${!!m.premium_would_allow_invite}`,
          );
        }
      }
    } catch (e) {
      const err = e as { error_message?: string };
      const msg = err.error_message ?? String(e);
      console.error(`  batch FAILED: ${msg}`);
      if (/PEER_FLOOD|FLOOD_WAIT/i.test(msg)) {
        console.error("Stopping — account rate limited.");
        break;
      }
    }

    if (i + batchSize < toInvite.length) await sleep(delayMs);
  }
}

async function main() {
  const { account, rest } = parseAccountCliArgs(process.argv.slice(2));
  const [mode, a, b] = rest;
  if (mode === "dump" && a && b) {
    await dumpMembers(parseUsername(a), b, account);
    return;
  }
  if (mode === "invite" && a && b) {
    await inviteFromCsv(
      parseUsername(a),
      b,
      flag("--limit", 10),
      flag("--delay-ms", 2000),
      flag("--batch", 5),
      account,
    );
    return;
  }
  usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
