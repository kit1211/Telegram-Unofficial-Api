import type { JobsOptions } from "bullmq";
import { getTelegramQueue } from "./enqueue";
import { sanitizeBullJobId } from "./job-id";

/** Idempotent add — BullMQ job ids must not contain `:`. */
export async function addJobOnce<T>(
  name: string,
  data: T,
  opts: JobsOptions & { jobId: string },
): Promise<void> {
  const jobId = sanitizeBullJobId(opts.jobId);
  const queue = getTelegramQueue();
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove();
    } else {
      return;
    }
  }
  await queue.add(name, data, { ...opts, jobId });
}
