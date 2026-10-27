/**
 * Forward channel posts (albums = one batch). Optional caption via editMessage.
 *
 * bun run scripts/forward-channel-range.ts \
 *   --account default --from source_channel --to target_channel \
 *   --date-from 2026-10-01 --date-to 2026-10-27 \
 *   --caption-file caption.txt
 */
import { readFileSync } from "node:fs";
import { createMtprotoSession } from "../src/mtproto/client/create-session";
import { callWithDcMigrate } from "../src/mtproto/dc-migrate";
import { resolveChannel } from "../src/jobs/mtproto-utils";

type AnyRecord = Record<string, unknown>;

type MsgRow = { id: number; date: number; grouped_id?: string };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(minSec: number, maxSec: number): number {
  const lo = Math.min(minSec, maxSec);
  const hi = Math.max(minSec, maxSec);
  return (lo + Math.random() * (hi - lo)) * 1000;
}

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

function floodWaitSeconds(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const msg = (error as { error_message?: string }).error_message;
  const m = msg?.match(/FLOOD_WAIT_(\d+)/);
  return m ? Number(m[1]) : undefined;
}

function formatErr(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as { error_message?: string; message?: string };
    return e.error_message ?? e.message ?? String(error);
  }
  return String(error);
}

async function callRetry<T>(
  call: (m: string, p: AnyRecord) => Promise<T>,
  method: string,
  params: AnyRecord,
): Promise<T> {
  for (;;) {
    try {
      return await call(method, params);
    } catch (error) {
      const wait = floodWaitSeconds(error);
      if (wait === undefined) throw error;
      console.log(`[forward] ${method} FLOOD_WAIT_${wait}`);
      await sleep((wait + 1) * 1000);
    }
  }
}

function dayBounds(dateYmd: string, tzOffsetHours: number): { start: number; end: number } {
  const sign = tzOffsetHours >= 0 ? "+" : "-";
  const abs = String(Math.abs(tzOffsetHours)).padStart(2, "0");
  const start = Math.floor(
    new Date(`${dateYmd}T00:00:00${sign}${abs}:00`).getTime() / 1000,
  );
  const end = start + 86400;
  return { start, end };
}

function buildAlbumBatches(rows: MsgRow[]): number[][] {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const byGroup = new Map<string, number[]>();
  const singles: number[][] = [];

  for (const row of sorted) {
    const gid = row.grouped_id;
    if (gid) {
      const list = byGroup.get(gid) ?? [];
      list.push(row.id);
      byGroup.set(gid, list);
    } else {
      singles.push([row.id]);
    }
  }

  const batches: { minId: number; ids: number[] }[] = [];
  for (const ids of byGroup.values()) {
    ids.sort((a, b) => a - b);
    batches.push({ minId: ids[0], ids });
  }
  for (const ids of singles) {
    batches.push({ minId: ids[0], ids });
  }
  batches.sort((a, b) => a.minId - b.minId);
  return batches.map((b) => b.ids);
}

function channelMsgIdsFromUpdates(updates: AnyRecord): number[] {
  const ids: number[] = [];
  for (const u of (updates.updates as AnyRecord[]) ?? []) {
    if (u._ === "updateNewChannelMessage") {
      const mid = Number((u.message as AnyRecord)?.id);
      if (mid) ids.push(mid);
    }
  }
  return ids.sort((a, b) => a - b);
}

function loadCaption(): string {
  if (hasArg("--caption-file")) {
    return readFileSync(arg("--caption-file", ""), "utf-8").trim();
  }
  if (hasArg("--caption")) {
    return arg("--caption", "").replace(/\\n/g, "\n").trim();
  }
  return "";
}

async function main() {
  const accountId = arg("--account", "default");
  const fromUser = arg("--from", "");
  const toUser = arg("--to", "");
  if (!fromUser || !toUser) {
    console.error("Usage: --from <source> --to <target> [--account default] [--date-from YYYY-MM-DD] [--date-to YYYY-MM-DD] [--dry-run]");
    process.exit(1);
  }
  const dateYmd = hasArg("--date") ? arg("--date", "") : "";
  const fromMsg = hasArg("--from-msg") ? Number(arg("--from-msg", "0")) : 0;
  const delayMin = Number(arg("--delay-min", "15"));
  const delayMax = Number(arg("--delay-max", "30"));
  const dryRun = process.argv.includes("--dry-run");
  const caption = loadCaption();

  let rangeStart = 0;
  let rangeEnd = Number.MAX_SAFE_INTEGER;
  if (dateYmd) {
    const d = dayBounds(dateYmd, 7);
    rangeStart = d.start;
    rangeEnd = d.end;
  }
  if (hasArg("--date-from")) {
    rangeStart = dayBounds(arg("--date-from", ""), 7).start;
  }
  if (hasArg("--date-to")) {
    rangeEnd = dayBounds(arg("--date-to", ""), 7).end;
  }

  const session = createMtprotoSession({ account: accountId });
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);

  const source = await resolveChannel(call, fromUser);
  const target = await resolveChannel(call, toUser);

  try {
    await callRetry(call, "channels.joinChannel", { channel: source.inputChannel });
  } catch {
    /* already in */
  }
  try {
    await callRetry(call, "channels.joinChannel", { channel: target.inputChannel });
  } catch {
    /* already in */
  }

  const fromPeer = {
    _: "inputPeerChannel",
    channel_id: source.chat.id,
    access_hash: source.chat.access_hash,
  };
  const toPeer = {
    _: "inputPeerChannel",
    channel_id: target.chat.id,
    access_hash: target.chat.access_hash,
  };

  const rows: MsgRow[] = [];
  let offsetId = 0;

  for (;;) {
    const page = (await callRetry(call, "messages.getHistory", {
      peer: fromPeer,
      offset_id: offsetId,
      offset_date: 0,
      add_offset: 0,
      limit: 100,
      max_id: 0,
      min_id: fromMsg > 0 ? fromMsg - 1 : 0,
      hash: 0,
    })) as AnyRecord;

    const messages = (page.messages as AnyRecord[]) ?? [];
    if (messages.length === 0) break;

    for (const msg of messages) {
      if (msg._ !== "message") continue;
      const id = Number(msg.id);
      const date = Number(msg.date ?? 0);
      if (fromMsg > 0 && id < fromMsg) continue;
      if (date < rangeStart || date >= rangeEnd) continue;
      const gid = msg.grouped_id != null ? String(msg.grouped_id) : undefined;
      rows.push({ id, date, grouped_id: gid });
    }

    const oldest = messages[messages.length - 1];
    const oldestId = Number(oldest?.id ?? 0);
    const oldestDate = Number(oldest?.date ?? 0);

    if (oldestDate < rangeStart) break;
    if (fromMsg > 0 && oldestId <= fromMsg) break;
    if (messages.length < 100) break;
    offsetId = oldestId;
  }

  const batches = buildAlbumBatches(rows);
  const mediaCount = rows.length;
  const label =
    hasArg("--date-from") || hasArg("--date-to")
      ? `${arg("--date-from", "?")}..${arg("--date-to", "?")} (+7)`
      : dateYmd
        ? `date=${dateYmd} (+7)`
        : fromMsg > 0
          ? `msg>=${fromMsg}`
          : "all";
  console.log(
    `[forward] @${fromUser} ${label} → @${toUser} account=${accountId} messages=${mediaCount} batches=${batches.length} caption=${caption ? "yes" : "no"} dryRun=${dryRun}`,
  );

  if (dryRun) {
    for (const ids of batches) {
      console.log(`  batch ids=${ids.join(",")}`);
    }
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < batches.length; i++) {
    const ids = batches[i];
    try {
      const updates = (await callRetry(call, "messages.forwardMessages", {
        from_peer: fromPeer,
        to_peer: toPeer,
        id: ids,
        random_id: ids.map(() => randomId()),
        drop_author: true,
        drop_media_captions: true,
      })) as AnyRecord;
      if (caption) {
        const newIds = channelMsgIdsFromUpdates(updates);
        if (newIds.length > 0) {
          await callRetry(call, "messages.editMessage", {
            peer: toPeer,
            id: newIds[0],
            message: caption,
          });
        }
      }
      ok++;
      console.log(
        `[forward] ok ${i + 1}/${batches.length} ids=[${ids.join(",")}] (ok=${ok} fail=${fail})`,
      );
    } catch (error) {
      fail++;
      console.log(`[forward] skip ids=[${ids.join(",")}]: ${formatErr(error)}`);
    }
    if (i + 1 < batches.length) {
      const ms = randomDelay(delayMin, delayMax);
      console.log(`[forward] wait ${(ms / 1000).toFixed(1)}s`);
      await sleep(ms);
    }
  }
  console.log(`[forward] done batches ok=${ok} fail=${fail} media=${mediaCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
