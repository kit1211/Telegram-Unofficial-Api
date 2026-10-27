import type { JobStatus, JobType, JobProgress, JobResult, JobInputNeeds } from "../jobs/types";
import { getRedis } from "./connection";

export interface JobMetaRecord {
  id: string;
  type: JobType;
  status: JobStatus;
  params: Record<string, unknown>;
  accounts?: string[];
  progress?: JobProgress;
  result?: JobResult;
  error?: string;
  input?: { needs: JobInputNeeds; deepLink?: string; qrUtf8?: string };
  createdAt: string;
  updatedAt: string;
}

function metaKey(id: string): string {
  return `job:${id}:meta`;
}

export async function setJobMeta(
  id: string,
  patch: Partial<Omit<JobMetaRecord, "id">> & Pick<JobMetaRecord, "type" | "status">,
): Promise<void> {
  const redis = getRedis();
  const existing = await getJobMeta(id);
  const now = new Date().toISOString();
  const clearError =
    patch.status === "active" ||
    patch.status === "completed" ||
    patch.status === "queued" ||
    patch.status === "waiting_input";
  const next: JobMetaRecord = {
    id,
    type: patch.type ?? existing?.type ?? "profile.self",
    status: patch.status,
    params: patch.params ?? existing?.params ?? {},
    accounts: patch.accounts ?? existing?.accounts,
    progress: patch.progress ?? existing?.progress,
    result: patch.result ?? existing?.result,
    error: clearError
      ? patch.error
      : (patch.error ?? existing?.error),
    input: patch.input ?? existing?.input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (clearError && patch.error === undefined) {
    delete next.error;
  }
  await redis.set(metaKey(id), JSON.stringify(next));
}

export async function getJobMeta(id: string): Promise<JobMetaRecord | null> {
  const raw = await getRedis().get(metaKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as JobMetaRecord;
}

export async function patchJobProgress(
  id: string,
  progress: Partial<JobProgress>,
): Promise<void> {
  const meta = await getJobMeta(id);
  if (!meta) return;
  await setJobMeta(id, {
    type: meta.type,
    status: meta.status,
    progress: { ...meta.progress, ...progress },
  });
}

export function usersKey(jobId: string): string {
  return `job:${jobId}:users`;
}

export function filterDoneKey(jobId: string, label: string): string {
  return `job:${jobId}:done:${label}`;
}

export function channelMetaKey(jobId: string): string {
  return `job:${jobId}:channel`;
}

export async function storeChannelMeta(
  jobId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await getRedis().set(channelMetaKey(jobId), JSON.stringify(data));
}

export async function loadChannelMeta(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const raw = await getRedis().get(channelMetaKey(jobId));
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function mergeUser(
  jobId: string,
  userId: string,
  user: Record<string, unknown>,
): Promise<void> {
  await getRedis().hset(
    usersKey(jobId),
    userId,
    JSON.stringify(user, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

export async function countUsers(jobId: string): Promise<number> {
  return getRedis().hlen(usersKey(jobId));
}

export async function allUsers(
  jobId: string,
): Promise<Map<string, Record<string, unknown>>> {
  const raw = await getRedis().hgetall(usersKey(jobId));
  const out = new Map<string, Record<string, unknown>>();
  for (const [id, json] of Object.entries(raw)) {
    out.set(id, JSON.parse(json) as Record<string, unknown>);
  }
  return out;
}

export async function markFilterDone(
  jobId: string,
  label: string,
): Promise<boolean> {
  const key = filterDoneKey(jobId, label);
  const ok = await getRedis().set(key, "1", "EX", 86400 * 7, "NX");
  return ok === "OK";
}

export async function isFilterDone(
  jobId: string,
  label: string,
): Promise<boolean> {
  return (await getRedis().get(filterDoneKey(jobId, label))) === "1";
}

export async function incrFiltersDone(jobId: string): Promise<number> {
  return getRedis().hincrby(`job:${jobId}:counters`, "filtersDone", 1);
}

export async function setFiltersTotal(
  jobId: string,
  total: number,
): Promise<void> {
  await getRedis().hset(`job:${jobId}:counters`, "filtersTotal", String(total));
}

export async function markFilterFailed(
  jobId: string,
  label: string,
): Promise<boolean> {
  const ok = await getRedis().set(
    `job:${jobId}:failed:${label}`,
    "1",
    "EX",
    86400 * 7,
    "NX",
  );
  if (ok !== "OK") return false;
  await getRedis().hincrby(`job:${jobId}:counters`, "filtersFailed", 1);
  return true;
}

export async function getFilterCursor(
  jobId: string,
  label: string,
): Promise<number> {
  const raw = await getRedis().get(`job:${jobId}:cursor:${label}`);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function setFilterCursor(
  jobId: string,
  label: string,
  offset: number,
): Promise<void> {
  await getRedis().set(
    `job:${jobId}:cursor:${label}`,
    String(offset),
    "EX",
    86400 * 7,
  );
}

export async function clearFilterFailures(jobId: string): Promise<void> {
  const redis = getRedis();
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      `job:${jobId}:failed:*`,
      "COUNT",
      100,
    );
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
  await redis.hdel(`job:${jobId}:counters`, "filtersFailed");
}

export async function getFilterCounters(jobId: string): Promise<{
  filtersDone: number;
  filtersTotal: number;
  filtersFailed: number;
}> {
  const raw = await getRedis().hgetall(`job:${jobId}:counters`);
  return {
    filtersDone: Number(raw.filtersDone ?? 0),
    filtersTotal: Number(raw.filtersTotal ?? 0),
    filtersFailed: Number(raw.filtersFailed ?? 0),
  };
}

const INPUT_PREFIX = "job:";

export async function setJobInput(
  jobId: string,
  field: string,
  value: string,
): Promise<void> {
  await getRedis().set(`${INPUT_PREFIX}${jobId}:input:${field}`, value, "EX", 3600);
}

export async function getJobInput(
  jobId: string,
  field: string,
): Promise<string | null> {
  return getRedis().get(`${INPUT_PREFIX}${jobId}:input:${field}`);
}
