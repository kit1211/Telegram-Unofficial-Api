import { createMtprotoSession } from "../../mtproto/client/create-session";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { withAccountLock } from "../../queue/account-lock";
import { setJobMeta } from "../../queue/job-meta";
import type { GroupSmokePayload } from "../types";
import { parseUsername } from "../mtproto-utils";

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

export async function runGroupSmoke(payload: GroupSmokePayload): Promise<void> {
  const jobId = payload.jobId;
  const username = parseUsername(payload.username);
  const logs: string[] = [];

  await setJobMeta(jobId, { type: "group.smoke", status: "active" });

  const session = createMtprotoSession({ account: payload.accountId });
  const call = <T>(method: string, params: AnyRecord = {}) =>
    withAccountLock(session.accountId, () =>
      callWithDcMigrate<T>(session, method, params),
    );

  const resolved = await call<AnyRecord>("contacts.resolveUsername", {
    username,
  });
  const chat = (resolved.chats as AnyRecord[])?.[0];
  if (!chat) throw new Error(`No chat for @${username}`);
  logs.push(`resolved: ${chat.title}`);

  const inputPeer =
    chat._ === "channel"
      ? {
          _: "inputPeerChannel",
          channel_id: chat.id,
          access_hash: chat.access_hash,
        }
      : { _: "inputPeerChat", chat_id: chat.id };

  if (chat._ === "channel") {
    try {
      await call("channels.joinChannel", {
        channel: {
          _: "inputChannel",
          channel_id: chat.id,
          access_hash: chat.access_hash,
        },
      });
      logs.push("joinChannel: ok");
    } catch (e) {
      const msg = String(e);
      if (/USER_ALREADY_PARTICIPANT|INVITE_REQUEST_SENT/i.test(msg)) {
        logs.push(`joinChannel: skip (${msg})`);
      } else {
        logs.push(`joinChannel: ${msg}`);
      }
    }

    const full = (await call("channels.getFullChannel", {
      channel: {
        _: "inputChannel",
        channel_id: chat.id,
        access_hash: chat.access_hash,
      },
    })) as AnyRecord;
    const fullChat = full.full_chat as AnyRecord | undefined;
    logs.push(`participants: ${fullChat?.participants_count}`);
  }

  try {
    const sent = await call<AnyRecord>("messages.sendMessage", {
      peer: inputPeer,
      message: `[telegram-reverse smoke] ${new Date().toISOString()}`,
      random_id: randomId(),
    });
    logs.push(`sendMessage: ${sent._}`);
  } catch (e) {
    logs.push(`sendMessage failed: ${String(e)}`);
  }

  await setJobMeta(jobId, {
    type: "group.smoke",
    status: "completed",
    result: { logs },
  });
}
