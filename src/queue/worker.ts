import { UnrecoverableError, Worker, type Job } from "bullmq";
import { createRedisDuplicate } from "./connection";
import { TELEGRAM_QUEUE } from "./names";
import { markFilterFailed, patchJobProgress, setJobMeta } from "./job-meta";
import { formatRpcError, asError } from "../jobs/mtproto-utils";
import { isJobPayload, type JobPayload, type JobType } from "../jobs/types";
import {
  runMemberDumpFilter,
  runMemberDumpFinalize,
  runMemberDumpOrchestrator,
} from "../jobs/handlers/member-dump";
import { runMemberInvite } from "../jobs/handlers/member-invite";
import { runAuthPhone } from "../jobs/handlers/auth-phone";
import { runAuthQr } from "../jobs/handlers/auth-qr";
import { runProfileSelf } from "../jobs/handlers/profile";
import { runGroupSmoke } from "../jobs/handlers/group-smoke";
import { runGroupSendMedia } from "../jobs/handlers/send-media";
import { runGroupManage } from "../jobs/handlers/group-manage";
import { runAccountReset } from "../jobs/handlers/account-reset";

function pollMetaId(data: JobPayload, fallback: string): string {
  if ("parentJobId" in data && data.type === "member.dump.finalize") {
    return data.parentJobId;
  }
  if ("parentJobId" in data) return data.parentJobId;
  if ("jobId" in data) return data.jobId;
  return fallback;
}

function shouldMarkParentFailed(data: JobPayload | undefined): boolean {
  if (!data) return true;
  if (data.type === "member.dump.filter") return false;
  if (data.type === "member.dump.finalize") return false;
  return true;
}

async function processJob(job: Job<JobPayload>): Promise<void> {
  const data = job.data;
  if (!isJobPayload(data)) {
    throw new Error("Invalid job payload");
  }

  const metaId = pollMetaId(data, String(job.id));

  if (
    data.type !== "member.dump.filter" &&
    data.type !== "member.dump.finalize"
  ) {
    await setJobMeta(metaId, {
      type: data.type as JobType,
      status: "active",
    });
  }

  switch (data.type) {
    case "member.dump":
      await runMemberDumpOrchestrator(data);
      break;
    case "member.dump.filter":
      await runMemberDumpFilter(data);
      break;
    case "member.dump.finalize":
      await runMemberDumpFinalize(data);
      break;
    case "member.invite":
      await runMemberInvite(data);
      break;
    case "auth.phone":
      await runAuthPhone(data);
      break;
    case "auth.qr":
      await runAuthQr(data);
      break;
    case "profile.self":
      await runProfileSelf(data);
      break;
    case "group.smoke":
      await runGroupSmoke(data);
      break;
    case "group.sendMedia":
      await runGroupSendMedia(data);
      break;
    case "group.manage":
      await runGroupManage(data);
      break;
    case "account.reset":
      await runAccountReset(data);
      break;
    default:
      throw new Error("Unknown job type");
  }
}

export function startWorkers(): Worker {
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);
  const worker = new Worker<JobPayload>(
    TELEGRAM_QUEUE,
    async (job) => {
      try {
        await processJob(job);
      } catch (error) {
        const message = formatRpcError(error);
        const data = job.data;
        const metaId = data ? pollMetaId(data, String(job.id)) : String(job.id);
        if (shouldMarkParentFailed(data)) {
          await setJobMeta(metaId, {
            type: (data?.type ?? "profile.self") as JobType,
            status: "failed",
            error: message,
          });
        }
        if (error instanceof UnrecoverableError) throw error;
        throw asError(error);
      }
    },
    {
      connection: createRedisDuplicate(),
      concurrency,
      lockDuration: 600_000,
      stalledInterval: 60_000,
      maxStalledCount: 2,
    },
  );

  worker.on("failed", (job, err) => {
    const message = formatRpcError(err);
    console.error(`Job ${job?.id} failed:`, message);
    const data = job?.data;
    if (!job || !data || data.type !== "member.dump.filter") return;
    const attempts = job.opts.attempts ?? 1;
    const permanent =
      err instanceof UnrecoverableError ||
      err?.name === "UnrecoverableError" ||
      job.attemptsMade >= attempts;
    if (!permanent) return;
    void markFilterFailed(data.parentJobId, data.label)
      .then(() =>
        patchJobProgress(data.parentJobId, {
          message: `${data.label} failed: ${message}`,
        }),
      )
      .catch((markError) => {
        console.error("markFilterFailed", formatRpcError(markError));
      });
  });

  console.log(
    `Worker listening on ${TELEGRAM_QUEUE} (concurrency=${concurrency})`,
  );
  return worker;
}
