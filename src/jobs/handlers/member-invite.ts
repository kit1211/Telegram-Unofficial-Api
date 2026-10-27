import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { UnrecoverableError } from "bullmq";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { getAccountSession } from "../../mtproto/client/session-pool";
import { withAccountLock } from "../../queue/account-lock";
import { getRedis } from "../../queue/connection";
import { childJobId } from "../../queue/job-id";
import { patchJobProgress, setJobMeta } from "../../queue/job-meta";
import { addJobOnce } from "../../queue/queue-add";
import type { MemberInvitePayload } from "../types";
import {
  floodWaitSeconds,
  formatRpcError,
  parseUsername,
  resolveChannel,
  sleep,
} from "../mtproto-utils";

type AnyRecord = Record<string, unknown>;

const PEER_FLOOD_RETRY_MS = 60 * 60 * 1000;
const PEER_FLOOD_EMPTY_RETRY_MS = 6 * 60 * 60 * 1000;

function jobCsvPath(jobId: string): string {
  return resolve(process.cwd(), "data/jobs", `${jobId}.members.csv`);
}

function invitedKey(jobId: string): string {
  return `job:${jobId}:invited-ids`;
}

function skipKey(jobId: string): string {
  return `job:${jobId}:invite-skip`;
}

function burstMaxKey(jobId: string): string {
  return `job:${jobId}:invite-max-burst`;
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

async function loadIdSet(key: string): Promise<Set<string>> {
  const ids = await getRedis().smembers(key);
  return new Set(ids);
}

export async function runMemberInvite(payload: MemberInvitePayload): Promise<void> {
  const jobId = payload.jobId;
  const accountId = payload.accountId || "default";
  await setJobMeta(jobId, { type: "member.invite", status: "active" });

  const csvPath =
    payload.csvPath ??
    (payload.sourceJobId ? jobCsvPath(payload.sourceJobId) : undefined);
  if (!csvPath) {
    throw new Error("member.invite requires csvPath or sourceJobId");
  }

  const session = getAccountSession(accountId);
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);
  const locked = <T>(fn: () => Promise<T>) => withAccountLock(accountId, fn);

  const targetUsername = parseUsername(payload.targetUsername);
  const { inputChannel } = await locked(() => resolveChannel(call, targetUsername));
  try {
    await locked(() =>
      call("channels.joinChannel", { channel: inputChannel }),
    );
  } catch (error) {
    const message = formatRpcError(error);
    if (!/USER_ALREADY_PARTICIPANT|INVITE_REQUEST_SENT/.test(message)) {
      console.log(`[invite] join @${targetUsername}: ${message}`);
    }
  }

  const rows = parseCsv(readFileSync(csvPath, "utf-8")).filter((r) => !r.is_bot);
  const cap = payload.limit > 0 ? payload.limit : rows.length;

  const selfFull = await locked(() =>
    call<AnyRecord>("users.getFullUser", { id: { _: "inputUserSelf" } }),
  );
  const selfId = String((selfFull.users as AnyRecord[] | undefined)?.[0]?.id ?? "");

  const invitedIds = await loadIdSet(invitedKey(jobId));
  const skippedIds = await loadIdSet(skipKey(jobId));
  const pending = rows.filter((r) => {
    const id = String(r.user_id);
    return id !== selfId && !invitedIds.has(id) && !skippedIds.has(id);
  });
  const unnamed = pending.filter((r) => !String(r.username ?? "").trim());
  if (unnamed.length > 0) {
    const redis = getRedis();
    for (const row of unnamed) {
      await redis.sadd(skipKey(jobId), String(row.user_id));
    }
    console.log(
      `[invite] skip ${unnamed.length} users with no username — access_hash in the CSV is not valid for ${accountId}`,
    );
  }
  const queue = pending.filter((r) => String(r.username ?? "").trim());
  const todo = queue.slice(0, Math.max(0, cap - invitedIds.size));

  let invited = invitedIds.size;
  let failed = skippedIds.size + unnamed.length;
  let burst = 0;
  const batchSize = Math.max(1, payload.batch || 1);

  console.log(
    `[invite] job=${jobId} account=${accountId} @${targetUsername} todo=${todo.length} already=${invited} skipped=${failed} batch=${batchSize} delayMs=${payload.delayMs}`,
  );

  const publish = async (message: string, rateLimit?: string) => {
    await patchJobProgress(jobId, {
      invited,
      failed,
      remaining: Math.max(0, queue.length - burst),
      burstInvited: burst,
      rateLimit,
      message,
    });
  };

  const accessForInvite = async (row: AnyRecord): Promise<string | null> => {
    const id = String(row.user_id);
    const cacheKey = `job:${jobId}:invite-hash:${accountId}`;
    const cached = await getRedis().hget(cacheKey, id);
    if (cached) return cached;
    const username = String(row.username ?? "").replace(/^@/, "");
    if (!username) return null;
    try {
      const resolved = await locked(() =>
        call<AnyRecord>("contacts.resolveUsername", { username }),
      );
      const users = (resolved.users as AnyRecord[] | undefined) ?? [];
      const user = users.find((u) => String(u.id) === id) ?? users[0];
      const hash = user?.access_hash ? String(user.access_hash) : "";
      if (!hash) return null;
      await getRedis().hset(cacheKey, id, hash);
      await getRedis().expire(cacheKey, 86400 * 7);
      return hash;
    } catch (error) {
      const wait = floodWaitSeconds(error);
      if (wait !== undefined) {
        console.log(`[invite] FLOOD_WAIT_${wait} on resolve — sleep ${wait + 1}s`);
        await sleep((wait + 1) * 1000);
        return accessForInvite(row);
      }
      console.log(`[invite] resolve @${username}: ${formatRpcError(error)}`);
      return null;
    }
  };

  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    const inputUsers: { _: string; user_id: unknown; access_hash: string }[] = [];
    for (const row of batch) {
      const resolved = await accessForInvite(row);
      if (!resolved) {
        await getRedis().sadd(skipKey(jobId), String(row.user_id));
        failed++;
        console.log(`[invite] no hash for this account user=${row.user_id}`);
        continue;
      }
      inputUsers.push({
        _: "inputUser",
        user_id: row.user_id,
        access_hash: resolved,
      });
    }
    if (inputUsers.length === 0) {
      await publish("no access_hash for this account");
      continue;
    }

    let result: AnyRecord;
    try {
      result = await locked(() =>
        call<AnyRecord>("channels.inviteToChannel", {
          channel: inputChannel,
          users: inputUsers,
        }),
      );
    } catch (error) {
      const message = formatRpcError(error);
      const wait = floodWaitSeconds(error);
      if (wait !== undefined) {
        console.log(`[invite] FLOOD_WAIT_${wait} — sleep ${wait + 1}s then retry`);
        await publish(`FLOOD_WAIT_${wait}`, `FLOOD_WAIT_${wait}`);
        await sleep((wait + 1) * 1000);
        i -= batchSize;
        continue;
      }
      if (/PEER_FLOOD/i.test(message)) {
        const redis = getRedis();
        const prevMax = Number((await redis.get(burstMaxKey(jobId))) ?? 0);
        const maxBurst = Math.max(prevMax, burst);
        await redis.set(burstMaxKey(jobId), String(maxBurst), "EX", 86400 * 7);
        const retryMs = burst === 0 ? PEER_FLOOD_EMPTY_RETRY_MS : PEER_FLOOD_RETRY_MS;
        const waits = await redis.incr(`job:${jobId}:invite-waits`);
        await addJobOnce(
          "member.invite",
          payload,
          {
            jobId: childJobId(jobId, `invite-wait-${waits}`),
            delay: retryMs,
          },
        );
        const resumeAt = new Date(Date.now() + retryMs).toISOString();
        console.log(
          `[invite] PEER_FLOOD burst=${burst} cumulative=${invited} maxBurst=${maxBurst} retryAt=${resumeAt}`,
        );
        await setJobMeta(jobId, {
          type: "member.invite",
          status: "queued",
          progress: {
            invited,
            failed,
            remaining: queue.length - burst,
            burstInvited: burst,
            rateLimit: "PEER_FLOOD",
            message: `PEER_FLOOD after ${burst} invites this round (max burst ${maxBurst}) — retry at ${resumeAt}`,
          },
          result: { stoppedReason: "PEER_FLOOD" },
        });
        return;
      }
      if (/CHAT_ADMIN_REQUIRED|CHAT_WRITE_FORBIDDEN|CHANNEL_PRIVATE/.test(message)) {
        throw new UnrecoverableError(message);
      }
    for (const row of inputUsers) {
      await getRedis().sadd(skipKey(jobId), String(row.user_id));
    }
    failed += inputUsers.length;
      console.log(`[invite] skip ${batch.length} ${message} failed=${failed}`);
      await publish(message);
      await sleep(payload.delayMs);
      continue;
    }

    const missing = new Set(
      ((result.missing_invitees as AnyRecord[] | undefined) ?? []).map((m) =>
        String(m.user_id),
      ),
    );
    for (const row of inputUsers) {
      const id = String(row.user_id);
      if (missing.has(id)) {
        await getRedis().sadd(skipKey(jobId), id);
        failed++;
        console.log(`[invite] missing_invitee user=${id}`);
      } else {
        await getRedis().sadd(invitedKey(jobId), id);
        invited++;
        burst++;
        console.log(
          `[invite] ok user=${id} burst=${burst} cumulative=${invited}`,
        );
      }
    }
    await publish(`invited ${invited}`);
    if (i + batchSize < todo.length) await sleep(payload.delayMs);
  }

  const redis = getRedis();
  const prevMax = Number((await redis.get(burstMaxKey(jobId))) ?? 0);
  await redis.set(burstMaxKey(jobId), String(Math.max(prevMax, burst)), "EX", 86400 * 7);
  await setJobMeta(jobId, {
    type: "member.invite",
    status: "completed",
    progress: {
      invited,
      failed,
      remaining: 0,
      burstInvited: burst,
      message: "invite list finished",
    },
  });
  console.log(`[invite] done cumulative=${invited} skipped=${failed} burst=${burst}`);
}
