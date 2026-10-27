import { createMtprotoSession } from "../../mtproto/client/create-session";
import { getFullUser } from "../../services/users/profile";
import { setJobMeta } from "../../queue/job-meta";
import type { ProfileSelfPayload } from "../types";

export async function runProfileSelf(payload: ProfileSelfPayload): Promise<void> {
  const jobId = payload.jobId;
  await setJobMeta(jobId, { type: "profile.self", status: "active" });

  const session = createMtprotoSession({ account: payload.accountId });
  const adapter = {
    invoke<T>(method: string, params: Record<string, unknown>) {
      return session.call<T>(method, params);
    },
  };

  const full = await getFullUser(adapter as never);
  const user = full.users?.[0];
  const profile = {
    account: session.accountId,
    id: user?.id,
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
    about: full.full_user?.about,
  };

  await setJobMeta(jobId, {
    type: "profile.self",
    status: "completed",
    result: { profile },
  });
}
