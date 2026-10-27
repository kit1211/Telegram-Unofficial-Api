import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { UnrecoverableError } from "bullmq";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { getAccountSession } from "../../mtproto/client/session-pool";
import { withAccountLock } from "../../queue/account-lock";
import { pickAccount } from "../../queue/account-pool";
import {
  allUsers,
  countUsers,
  getFilterCounters,
  incrFiltersDone,
  isFilterDone,
  getFilterCursor,
  setFilterCursor,
  loadChannelMeta,
  markFilterDone,
  mergeUser,
  patchJobProgress,
  setFiltersTotal,
  setJobMeta,
  storeChannelMeta,
} from "../../queue/job-meta";
import type {
  MemberDumpFilterPayload,
  MemberDumpFinalizePayload,
  MemberDumpPayload,
} from "../types";
import {
  asError,
  callRetry,
  formatRpcError,
  PAGE,
  PAGE_DELAY_MS,
  parseUsername,
  resolveChannel,
  searchQueries,
  sleep,
  csvEscape,
} from "../mtproto-utils";
import { childJobId } from "../../queue/job-id";
import { addJobOnce } from "../../queue/queue-add";
import { getRedis } from "../../queue/connection";

type AnyRecord = Record<string, unknown>;

const FINALIZE_RETRY_MAX = 120;

function jobCsvPath(jobId: string): string {
  return resolve(process.cwd(), "data/jobs", `${jobId}.members.csv`);
}

function buildFilterList(): { label: string; filter: AnyRecord }[] {
  const filters: { label: string; filter: AnyRecord }[] = [
    { label: "recent", filter: { _: "channelParticipantsRecent" } },
  ];
  for (const q of searchQueries()) {
    filters.push({
      label: q === "" ? "search:empty" : `search:${q}`,
      filter: { _: "channelParticipantsSearch", q },
    });
  }
  return filters;
}

function peerKey(jobId: string, accountId: string): string {
  return `job:${jobId}:peer:${accountId}`;
}

function makeCall(accountId: string) {
  const session = getAccountSession(accountId);
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);
  return { call };
}

async function lockedCall<T>(
  accountId: string,
  fn: (
    call: (method: string, params: AnyRecord) => Promise<unknown>,
  ) => Promise<T>,
  pageDelayMs = 0,
): Promise<T> {
  const { call } = makeCall(accountId);
  return withAccountLock(accountId, async () => {
    const result = await fn(call);
    if (pageDelayMs > 0) await sleep(pageDelayMs);
    return result;
  });
}

async function paginateFilter(
  accountId: string,
  inputChannel: AnyRecord,
  filter: AnyRecord,
  label: string,
  parentJobId: string,
  pageLimit: number,
  pageDelayMs: number,
) {
  let offset = await getFilterCursor(parentJobId, label);
  let total = 0;
  if (offset > 0) {
    console.log(
      `[dump] resume filter=${label} from offset=${offset} account=${accountId}`,
    );
  }
  while (true) {
    const part = await withAccountLock(accountId, async () => {
      const { call } = makeCall(accountId);
      const page = (await callRetry(call, "channels.getParticipants", {
        channel: inputChannel,
        filter,
        offset,
        limit: pageLimit,
        hash: BigInt(0),
      })) as AnyRecord;
      const pageUsers = (page.users as AnyRecord[]) ?? [];
      const pageTotal = typeof page.count === "number" ? page.count : total;
      const nextOffset = offset + pageUsers.length;
      const done =
        pageUsers.length === 0 ||
        pageUsers.length < pageLimit ||
        (pageTotal > 0 && nextOffset >= pageTotal);
      if (!done) await sleep(pageDelayMs);
      return page;
    });
    const users = (part.users as AnyRecord[]) ?? [];
    if (typeof part.count === "number") total = part.count;
    if (users.length === 0) break;

    for (const u of users) {
      await mergeUser(parentJobId, String(u.id), u);
    }
    offset += users.length;
    await setFilterCursor(parentJobId, label, offset);
    const uniqueCount = await countUsers(parentJobId);
    console.log(
      `[dump] account=${accountId} filter=${label} got=${users.length} limit=${pageLimit} offset=${offset}${total ? `/${total}` : ""} unique=${uniqueCount}`,
    );
    await patchJobProgress(parentJobId, {
      uniqueCount,
      message: `${label} +${users.length} (offset ${offset}${total ? `/${total}` : ""})`,
      lastFetchCount: users.length,
      lastFetchOffset: offset,
      pageLimit,
      pageDelayMs,
      activeFilter: label,
      activeAccount: accountId,
    });
    void flushCsv(parentJobId).catch((error) => {
      console.error(`[dump] csv ${parentJobId}`, formatRpcError(error));
    });
    if (users.length < pageLimit || (total > 0 && offset >= total)) break;
  }
}

export async function flushCsv(jobId: string): Promise<string> {
  const seen = await allUsers(jobId);
  const outPath = jobCsvPath(jobId);
  const header = "user_id,access_hash,username,first_name,last_name,is_bot\n";
  const lines = [...seen.values()].map((u) => {
    const row = [
      String(u.id),
      String(u.access_hash ?? ""),
      String(u.username ?? ""),
      String(u.first_name ?? ""),
      String(u.last_name ?? ""),
      u.bot ? "1" : "0",
    ].map((c) => csvEscape(String(c)));
    return row.join(",");
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, header + lines.join("\n") + "\n", "utf-8");
  return outPath;
}

export async function runMemberDumpOrchestrator(
  payload: MemberDumpPayload,
): Promise<void> {
  const jobId = payload.jobId;
  const username = parseUsername(payload.username);
  const filters = buildFilterList();

  const pageLimit = payload.pageLimit || PAGE;
  const pageDelayMs = payload.pageDelayMs || PAGE_DELAY_MS;

  await setJobMeta(jobId, {
    type: "member.dump",
    status: "active",
  });
  const savedUsers = await countUsers(jobId);
  await patchJobProgress(jobId, {
    message:
      savedUsers > 0
        ? `resuming (${savedUsers} already saved)`
        : "resolving channel",
    filtersTotal: filters.length,
    pageLimit,
    pageDelayMs,
    uniqueCount: savedUsers,
  });

  let inputChannel: AnyRecord;
  let reportedCount: number;

  const cached = await loadChannelMeta(jobId);
  if (cached?.inputChannel) {
    inputChannel = cached.inputChannel as AnyRecord;
    reportedCount = Number(cached.reportedCount ?? 0);
  } else {
    const accountId = pickAccount(payload.accounts, 0);
    const resolved = await lockedCall(accountId, async (call) => {
      const channel = await resolveChannel(call, username);
      const full = (await callRetry(call, "channels.getFullChannel", {
        channel: channel.inputChannel,
      })) as AnyRecord;
      return { channel, full };
    });
    const { chat, inputChannel: ch } = resolved.channel;
    const full = resolved.full;
    const fullChat = full.full_chat as AnyRecord | undefined;
    const canView = fullChat?.can_view_participants !== false;
    if (!canView) {
      throw new Error(
        "can_view_participants is false — cannot dump member list via API",
      );
    }

    reportedCount = Number(fullChat?.participants_count ?? 0);
    inputChannel = ch;
    await storeChannelMeta(jobId, {
      inputChannel,
      username,
      title: chat.title,
      reportedCount,
    });
  }

  const counters = await getFilterCounters(jobId);
  if (counters.filtersTotal === 0) {
    await setFiltersTotal(jobId, filters.length);
  }

  let i = 0;
  let skipped = 0;
  for (const { label, filter } of filters) {
    if (await isFilterDone(jobId, label)) {
      skipped++;
      i++;
      continue;
    }
    const childAccount = pickAccount(payload.accounts, i++);
    const childId = childJobId(jobId, `filter-${label}`);
    await addJobOnce(
      "member.dump.filter",
      {
        type: "member.dump.filter",
        parentJobId: jobId,
        label,
        filter,
        accountId: childAccount,
        username,
        inputChannel,
        reportedCount,
        pageLimit,
        pageDelayMs,
      } satisfies MemberDumpFilterPayload,
      {
        jobId: childId,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
        attempts: 8,
        backoff: { type: "exponential", delay: 5000 },
      },
    );
  }

  console.log(
    `[dump] job=${jobId} @${username} accounts=${payload.accounts.join(",")} filters=${filters.length} skipped=${skipped} saved=${savedUsers} limit=${pageLimit} delayMs=${pageDelayMs}`,
  );

  await addJobOnce(
    "member.dump.finalize",
    {
      type: "member.dump.finalize",
      parentJobId: jobId,
      username,
    } satisfies MemberDumpFinalizePayload,
    {
      jobId: childJobId(jobId, "finalize"),
      delay: 2000,
      removeOnComplete: { count: 200 },
      attempts: 3,
    },
  );

  const latest = await getFilterCounters(jobId);
  const uniqueCount = await countUsers(jobId);
  await patchJobProgress(jobId, {
    reportedCount,
    filtersTotal: filters.length,
    filtersDone: latest.filtersDone,
    filtersFailed: latest.filtersFailed,
    uniqueCount,
    pageLimit,
    pageDelayMs,
    ...(uniqueCount === 0 ? { message: "filters queued" } : {}),
  });
}

async function peerForAccount(
  payload: MemberDumpFilterPayload,
): Promise<AnyRecord> {
  const key = peerKey(payload.parentJobId, payload.accountId);
  const cached = await getRedis().get(key);
  if (cached) return JSON.parse(cached) as AnyRecord;

  const meta = await loadChannelMeta(payload.parentJobId);
  const username =
    payload.username || (meta?.username ? String(meta.username) : "");
  if (!username) {
    throw new UnrecoverableError("filter job is missing username");
  }

  const inputChannel = await lockedCall(payload.accountId, async (call) => {
    const resolved = await resolveChannel(call, username);
    return resolved.inputChannel;
  });
  await getRedis().set(
    key,
    JSON.stringify(inputChannel, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    "EX",
    86400 * 7,
  );
  return inputChannel;
}

export async function runMemberDumpFilter(
  payload: MemberDumpFilterPayload,
): Promise<void> {
  const { parentJobId, label } = payload;
  if (await isFilterDone(parentJobId, label)) {
    return;
  }

  await patchJobProgress(parentJobId, {
    message: label,
    activeFilter: label,
    activeAccount: payload.accountId,
    pageLimit: payload.pageLimit,
    pageDelayMs: payload.pageDelayMs,
  });

  const inputChannel = await peerForAccount(payload);
  try {
    await paginateFilter(
      payload.accountId,
      inputChannel,
      payload.filter,
      label,
      parentJobId,
      payload.pageLimit,
      payload.pageDelayMs,
    );
  } catch (error) {
    const message = formatRpcError(error);
    if (/USER_NOT_PARTICIPANT|CHANNEL_PRIVATE/.test(message)) {
      await lockedCall(payload.accountId, (call) =>
        callRetry(call, "channels.joinChannel", { channel: inputChannel }),
      );
      await getRedis().del(peerKey(parentJobId, payload.accountId));
      const joined = await peerForAccount(payload);
      await paginateFilter(
        payload.accountId,
        joined,
        payload.filter,
        label,
        parentJobId,
        payload.pageLimit,
        payload.pageDelayMs,
      );
    } else if (/CHANNEL_INVALID/.test(message)) {
      await getRedis().del(peerKey(parentJobId, payload.accountId));
      try {
        const refreshed = await peerForAccount(payload);
        await paginateFilter(
          payload.accountId,
          refreshed,
          payload.filter,
          label,
          parentJobId,
          payload.pageLimit,
          payload.pageDelayMs,
        );
      } catch (again) {
        throw new UnrecoverableError(formatRpcError(again));
      }
    } else if (
      /CHAT_ADMIN_REQUIRED|USER_BANNED_IN_CHANNEL|CHANNEL_PUBLIC_GROUP_NA/.test(
        message,
      )
    ) {
      throw new UnrecoverableError(message);
    } else {
      throw asError(error);
    }
  }

  await markFilterDone(parentJobId, label);
  const done = await incrFiltersDone(parentJobId);
  const counters = await getFilterCounters(parentJobId);
  const uniqueCount = await countUsers(parentJobId);
  await patchJobProgress(parentJobId, {
    filtersDone: done,
    filtersTotal: counters.filtersTotal,
    uniqueCount,
    message: `done ${label}`,
  });
}

async function incrFinalizeWait(parentJobId: string): Promise<number> {
  return getRedis().incr(`job:${parentJobId}:finalize-waits`);
}

export async function runMemberDumpFinalize(
  payload: MemberDumpFinalizePayload,
): Promise<void> {
  const { parentJobId } = payload;
  const counters = await getFilterCounters(parentJobId);
  const meta = await loadChannelMeta(parentJobId);
  const reportedCount = Number(meta?.reportedCount ?? 0);

  const finished = counters.filtersDone + counters.filtersFailed;
  if (counters.filtersTotal > 0 && finished < counters.filtersTotal) {
    const waits = await incrFinalizeWait(parentJobId);
    if (waits <= FINALIZE_RETRY_MAX) {
      await addJobOnce(
        "member.dump.finalize",
        payload,
        {
          jobId: childJobId(parentJobId, `finalize-wait-${waits}`),
          delay: 15_000,
          removeOnComplete: { count: 200 },
        },
      );
    }
    return;
  }

  const path = await flushCsv(parentJobId);
  const uniqueCount = await countUsers(parentJobId);
  if (uniqueCount === 0 && counters.filtersFailed > 0) {
    await setJobMeta(parentJobId, {
      type: "member.dump",
      status: "failed",
      error: "every filter failed — see worker log for the RPC error",
      progress: {
        filtersDone: counters.filtersDone,
        filtersFailed: counters.filtersFailed,
        filtersTotal: counters.filtersTotal,
        uniqueCount,
        reportedCount,
      },
    });
    return;
  }
  await setJobMeta(parentJobId, {
    type: "member.dump",
    status: "completed",
    progress: {
      filtersDone: counters.filtersDone,
      filtersFailed: counters.filtersFailed,
      filtersTotal: counters.filtersTotal,
      uniqueCount,
      reportedCount,
    },
    result: { downloadPath: path },
  });
}
