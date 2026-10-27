import { Elysia, t } from "elysia";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { enqueueJob, resumeMemberDump, resumeMemberInvite } from "../../queue/enqueue";
import { getJobMeta, setJobInput, getJobInput } from "../../queue/job-meta";
import type { JobType } from "../../jobs/types";

const jobTypes = [
  "member.dump",
  "member.invite",
  "auth.phone",
  "auth.qr",
  "profile.self",
  "group.smoke",
  "group.sendMedia",
  "group.manage",
  "account.reset",
] as const;

function jobCsvPath(jobId: string): string {
  return resolve(process.cwd(), "data/jobs", `${jobId}.members.csv`);
}

export const jobsRoutes = new Elysia({ prefix: "/v1/jobs" })
  .post(
    "/",
    async ({ body }) => {
      return enqueueJob({
        type: body.type as JobType,
        params: body.params,
        accounts: body.accounts,
      });
    },
    {
      body: t.Object({
        type: t.Union(jobTypes.map((x) => t.Literal(x))),
        params: t.Record(t.String(), t.Unknown()),
        accounts: t.Optional(t.Array(t.String())),
      }),
    },
  )
  .get("/:id", async ({ params, set }) => {
    const meta = await getJobMeta(params.id);
    if (!meta) {
      set.status = 404;
      return { error: "job not found" };
    }
    return meta;
  })
  .post("/:id/resume", async ({ params, set }) => {
    try {
      const meta = await getJobMeta(params.id);
      if (!meta) {
        set.status = 404;
        return { error: "job not found" };
      }
      if (meta.type === "member.invite") return await resumeMemberInvite(params.id);
      if (meta.type === "member.dump") return await resumeMemberDump(params.id);
      set.status = 400;
      return { error: "job cannot be resumed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set.status = message === "job already completed" ? 409 : 404;
      return { error: message };
    }
  })
  .post(
    "/:id/input",
    async ({ params, body, set }) => {
      const meta = await getJobMeta(params.id);
      if (!meta) {
        set.status = 404;
        return { error: "job not found" };
      }
      if (body.code) await setJobInput(params.id, "code", body.code);
      if (body.password) await setJobInput(params.id, "password", body.password);
      if (body.firstName) await setJobInput(params.id, "firstName", body.firstName);
      if (body.lastName) await setJobInput(params.id, "lastName", body.lastName);
      return { ok: true, pending: await summarizePendingInput(params.id) };
    },
    {
      body: t.Object({
        code: t.Optional(t.String()),
        password: t.Optional(t.String()),
        firstName: t.Optional(t.String()),
        lastName: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id/members.csv", async ({ params, set }) => {
    const path = jobCsvPath(params.id);
    if (!existsSync(path)) {
      set.status = 404;
      return "CSV not ready";
    }
    set.headers["content-type"] = "text/csv; charset=utf-8";
    return readFileSync(path, "utf-8");
  });

async function summarizePendingInput(jobId: string) {
  const keys = ["code", "password", "firstName", "lastName"] as const;
  const out: Record<string, boolean> = {};
  for (const k of keys) {
    out[k] = !!(await getJobInput(jobId, k));
  }
  return out;
}
