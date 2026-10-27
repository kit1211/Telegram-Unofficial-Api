import { Queue } from "bullmq";
import { uuidv7 } from "uuidv7";
import { sanitizeBullJobId } from "./job-id";
import { createRedisDuplicate } from "./connection";
import { TELEGRAM_QUEUE } from "./names";
import { setJobMeta, getJobMeta, countUsers, getFilterCounters, clearFilterFailures } from "./job-meta";
import { addJobOnce } from "./queue-add";
import { resolveAccountPool } from "./account-pool";
import type { GroupManageAction, JobType, JobPayload } from "../jobs/types";

let queue: Queue | undefined;

export function getTelegramQueue(): Queue {
  if (!queue) {
    queue = new Queue(TELEGRAM_QUEUE, {
      connection: createRedisDuplicate(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
        attempts: 3,
        backoff: { type: "exponential", delay: 3000 },
      },
    });
  }
  return queue;
}

export interface CreateJobInput {
  type: JobType;
  params: Record<string, unknown>;
  accounts?: string[];
}

const GROUP_MANAGE_ACTIONS = [
  "title",
  "about",
  "forum",
  "topic.create",
  "topic.list",
  "topic.edit",
  "topic.pin",
  "topic.copy",
] as const;

function parseGroupManageAction(value: unknown): GroupManageAction {
  const action = String(value ?? "");
  if ((GROUP_MANAGE_ACTIONS as readonly string[]).includes(action)) {
    return action as GroupManageAction;
  }
  throw new Error(
    `group.manage action must be one of ${GROUP_MANAGE_ACTIONS.join(", ")}`,
  );
}

function buildPayload(
  id: string,
  input: CreateJobInput,
  accountPool: string[],
): { name: string; data: JobPayload } {
  const p = input.params;
  switch (input.type) {
    case "member.dump":
      return {
        name: "member.dump",
        data: {
          type: "member.dump",
          jobId: id,
          username: String(p.username),
          accounts: accountPool,
          pageLimit: Number(p.pageLimit ?? 200),
          pageDelayMs: Number(p.pageDelayMs ?? 1000),
        },
      };
    case "member.invite":
      return {
        name: "member.invite",
        data: {
          type: "member.invite",
          jobId: id,
          targetUsername: String(p.targetUsername),
          sourceJobId: p.sourceJobId as string | undefined,
          csvPath: p.csvPath as string | undefined,
          limit: Number(p.limit ?? 10),
          delayMs: Number(p.delayMs ?? 2000),
          batch: Number(p.batch ?? 5),
          offset: Number(p.offset ?? 0),
          accountId: (p.account as string | undefined) ?? accountPool[0],
        },
      };
    case "auth.phone": {
      const phone = String(p.phone);
      return {
        name: "auth.phone",
        data: {
          type: "auth.phone",
          jobId: id,
          phone,
          accountId: String(p.account ?? ""),
        },
      };
    }
    case "auth.qr":
      return {
        name: "auth.qr",
        data: {
          type: "auth.qr",
          jobId: id,
          accountId: String(p.account ?? accountPool[0] ?? "default"),
        },
      };
    case "profile.self":
      return {
        name: "profile.self",
        data: {
          type: "profile.self",
          jobId: id,
          accountId: p.account as string | undefined,
        },
      };
    case "group.smoke":
      return {
        name: "group.smoke",
        data: {
          type: "group.smoke",
          jobId: id,
          username: String(p.username),
          accountId: p.account as string | undefined,
        },
      };
    case "group.sendMedia":
      return {
        name: "group.sendMedia",
        data: {
          type: "group.sendMedia",
          jobId: id,
          username: String(p.username),
          videoPath: p.videoPath as string | undefined,
          stickerShortName: p.stickerShortName as string | undefined,
          accountId: p.account as string | undefined,
        },
      };
    case "group.manage":
      return {
        name: "group.manage",
        data: {
          type: "group.manage",
          jobId: id,
          username: String(p.username ?? ""),
          accountId: (p.account as string | undefined) ?? accountPool[0],
          action: parseGroupManageAction(p.action),
          title: p.title as string | undefined,
          about: p.about as string | undefined,
          enabled: typeof p.enabled === "boolean" ? p.enabled : undefined,
          topicId: p.topicId == null ? undefined : Number(p.topicId),
          iconColor: p.iconColor == null ? undefined : Number(p.iconColor),
          iconEmojiId: p.iconEmojiId == null ? undefined : String(p.iconEmojiId),
          closed: typeof p.closed === "boolean" ? p.closed : undefined,
          hidden: typeof p.hidden === "boolean" ? p.hidden : undefined,
          pinned: typeof p.pinned === "boolean" ? p.pinned : undefined,
          limit: p.limit == null ? undefined : Number(p.limit),
          q: p.q as string | undefined,
          sourceChannelId:
            p.sourceChannelId == null ? undefined : String(p.sourceChannelId),
          replaceFrom: p.replaceFrom == null ? undefined : String(p.replaceFrom),
          replaceTo: p.replaceTo == null ? undefined : String(p.replaceTo),
        },
      };
    case "account.reset":
      return {
        name: "account.reset",
        data: {
          type: "account.reset",
          jobId: id,
          accountId: String(p.account ?? p.accountId),
        },
      };
    default:
      throw new Error(`Unsupported job type: ${input.type}`);
  }
}

export async function enqueueJob(input: CreateJobInput): Promise<{
  id: string;
  type: JobType;
  status: "queued";
  createdAt: string;
}> {
  const id = sanitizeBullJobId(uuidv7());
  const accountPool = resolveAccountPool(
    input.accounts ??
      (input.type === "group.manage" && typeof input.params.account === "string"
        ? [input.params.account]
        : undefined),
  );
  const { name, data } = buildPayload(id, input, accountPool);
  const createdAt = new Date().toISOString();

  await setJobMeta(id, {
    type: input.type,
    status: "queued",
    params: input.params,
    accounts: accountPool,
  });

  await getTelegramQueue().add(name, data, {
    jobId: id,
  });

  return { id, type: input.type, status: "queued", createdAt };
}

/** Re-queue an unfinished member.dump. Saved users and per-filter offsets stay. */
export async function resumeMemberDump(id: string): Promise<{
  id: string;
  status: "queued";
  uniqueCount: number;
  filtersDone: number;
  filtersTotal: number;
}> {
  const meta = await getJobMeta(id);
  if (!meta || meta.type !== "member.dump") {
    throw new Error("member.dump job not found");
  }
  const counters = await getFilterCounters(id);
  const uniqueCount = await countUsers(id);
  const finished =
    meta.status === "completed" &&
    counters.filtersFailed === 0 &&
    counters.filtersTotal > 0 &&
    counters.filtersDone >= counters.filtersTotal;
  if (finished) {
    throw new Error("job already completed");
  }

  await clearFilterFailures(id);
  await removeDumpQueueJobs(id);
  const accounts = meta.accounts?.length
    ? meta.accounts
    : resolveAccountPool();
  await setJobMeta(id, {
    type: "member.dump",
    status: "queued",
    progress: {
      ...meta.progress,
      uniqueCount,
      filtersDone: counters.filtersDone,
      filtersTotal: counters.filtersTotal,
      filtersFailed: 0,
      message: `resume queued (${uniqueCount} saved)`,
    },
  });
  await addJobOnce(
    "member.dump",
    {
      type: "member.dump",
      jobId: id,
      username: String(meta.params.username ?? ""),
      accounts,
      pageLimit: Number(meta.params.pageLimit ?? 200),
      pageDelayMs: Number(meta.params.pageDelayMs ?? 1000),
    },
    { jobId: id },
  );
  return {
    id,
    status: "queued",
    uniqueCount,
    filtersDone: counters.filtersDone,
    filtersTotal: counters.filtersTotal,
  };
}

/** Continue an invite that stopped on PEER_FLOOD or a dead worker. */
export async function resumeMemberInvite(id: string): Promise<{
  id: string;
  status: "queued";
  invited: number;
}> {
  const meta = await getJobMeta(id);
  if (!meta || meta.type !== "member.invite") {
    throw new Error("member.invite job not found");
  }
  if (meta.status === "completed") {
    throw new Error("job already completed");
  }
  await removeDumpQueueJobs(id);
  const p = meta.params;
  const accountId =
    meta.accounts?.[0] ??
    (typeof p.account === "string" ? p.account : undefined) ??
    "default";
  await setJobMeta(id, {
    type: "member.invite",
    status: "queued",
    progress: {
      ...meta.progress,
      message: `resume invite (${meta.progress?.invited ?? 0} already invited)`,
    },
  });
  await addJobOnce(
    "member.invite",
    {
      type: "member.invite",
      jobId: id,
      targetUsername: String(p.targetUsername ?? ""),
      sourceJobId: p.sourceJobId as string | undefined,
      csvPath: p.csvPath as string | undefined,
      limit: Number(p.limit ?? 0),
      delayMs: Number(p.delayMs ?? 3000),
      batch: Number(p.batch ?? 1),
      offset: Number(p.offset ?? 0),
      accountId,
    },
    { jobId: id },
  );
  return { id, status: "queued", invited: meta.progress?.invited ?? 0 };
}

async function removeDumpQueueJobs(parentId: string): Promise<void> {
  const queue = getTelegramQueue();
  const redis = (await import("./connection")).getRedis();
  const jobs = await queue.getJobs(
    ["active", "waiting", "delayed", "failed", "completed"],
    0,
    3000,
  );
  for (const job of jobs) {
    const jid = String(job.id ?? "");
    if (jid !== parentId && !jid.startsWith(`${parentId}__`)) continue;
    await redis.del(`bull:${TELEGRAM_QUEUE}:${jid}:lock`);
    try {
      const removed = await queue.remove(jid);
      if (removed === 0) await job.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[dump] resume remove ${jid}: ${message}`);
    }
  }
}
