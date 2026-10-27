import { createMtprotoSession } from "../../mtproto/client/create-session";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { uploadLocalFile } from "../../mtproto/upload/file-upload";
import { withAccountLock } from "../../queue/account-lock";
import { setJobMeta } from "../../queue/job-meta";
import type { GroupSendMediaPayload } from "../types";
import { parseUsername } from "../mtproto-utils";

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

export async function runGroupSendMedia(
  payload: GroupSendMediaPayload,
): Promise<void> {
  const jobId = payload.jobId;
  const username = parseUsername(payload.username);
  const videoPath = payload.videoPath;
  const logs: string[] = [];

  await setJobMeta(jobId, { type: "group.sendMedia", status: "active" });

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

  const inputPeer =
    chat._ === "channel"
      ? {
          _: "inputPeerChannel",
          channel_id: chat.id,
          access_hash: chat.access_hash,
        }
      : { _: "inputPeerChat", chat_id: chat.id };

  if (videoPath) {
    const invoke = (method: string, params: Record<string, unknown>) =>
      withAccountLock(session.accountId, () => session.call(method, params));
    const inputFile = await uploadLocalFile(invoke, videoPath);
    await call("messages.sendMedia", {
      peer: inputPeer,
      random_id: randomId(),
      message: "(telegram-reverse API smoke)",
      media: {
        _: "inputMediaUploadedDocument",
        file: inputFile,
        mime_type: "video/mp4",
        attributes: [
          {
            _: "documentAttributeVideo",
            w: 0,
            h: 0,
            duration: 0,
          },
        ],
      },
    });
    logs.push(`sent video: ${videoPath}`);
  }

  const stickerShort = payload.stickerShortName?.replace(/^.*addstickers\//, "");
  if (stickerShort) {
    await call("messages.installStickerSet", {
      stickerset: { _: "inputStickerSetShortName", short_name: stickerShort },
      archived: false,
    });
    logs.push(`installed sticker set: ${stickerShort}`);
  }

  await setJobMeta(jobId, {
    type: "group.sendMedia",
    status: "completed",
    result: { logs },
  });
}
