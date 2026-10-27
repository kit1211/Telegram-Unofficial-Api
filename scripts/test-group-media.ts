/**
 * Send photo/video to @username channel/group and list participants.
 * Usage: bun run scripts/test-group-media.ts [username] [photoPath] [videoPath]
 */
import { createMtprotoSession } from "../src/mtproto/client/create-session";
import { callWithDcMigrate } from "../src/mtproto/dc-migrate";
import { uploadLocalFile } from "../src/mtproto/upload/file-upload";

const USERNAME = (process.argv[2] ?? "telegram").replace(/^@/, "");
const PHOTO_PATH =
  process.argv[3] ?? "/home/zhang/Documents/My/telegram-reverse/logo_plain.png";
const VIDEO_PATH =
  process.argv[4] ??
  "/home/zhang/Documents/My/telegram-reverse/HeartyFatherlySturgeon.mp4";

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

async function main() {
  const session = createMtprotoSession();
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);

  const resolved = await call<AnyRecord>("contacts.resolveUsername", {
    username: USERNAME,
  });
  const chat = (resolved.chats as AnyRecord[])?.[0];
  if (!chat || chat._ !== "channel") {
    console.error("Expected a channel/supergroup for @", USERNAME, chat?._);
    process.exit(1);
  }

  const inputChannel = {
    _: "inputChannel",
    channel_id: chat.id,
    access_hash: chat.access_hash,
  };
  const inputPeer = {
    _: "inputPeerChannel",
    channel_id: chat.id,
    access_hash: chat.access_hash,
  };

  console.log(`Channel: ${chat.title} (@${USERNAME})`);

  console.log("\n--- members (channels.getParticipants) ---");
  try {
    const part = await call<AnyRecord>("channels.getParticipants", {
      channel: inputChannel,
      filter: { _: "channelParticipantsRecent" },
      offset: 0,
      limit: 200,
      hash: BigInt(0),
    });
    const users = (part.users as AnyRecord[]) ?? [];
    const count = part.count ?? users.length;
    console.log(`count (reported): ${count}, users in page: ${users.length}`);
    for (const u of users) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      console.log(
        `  - id=${u.id} @${u.username ?? "—"} ${name}${u.bot ? " [bot]" : ""}`,
      );
    }
  } catch (e) {
    console.error("getParticipants failed:", e);
  }

  console.log("\n--- upload photo ---");
  const photoFile = await uploadLocalFile(
    (m, p) => call(m, p),
    PHOTO_PATH,
  );
  const photoSent = await call<AnyRecord>("messages.sendMedia", {
    peer: inputPeer,
    message: `[telegram-reverse] photo ${PHOTO_PATH.split("/").pop()}`,
    random_id: randomId(),
    media: {
      _: "inputMediaUploadedPhoto",
      file: photoFile,
    },
  });
  console.log("photo send:", photoSent._);

  console.log("\n--- upload video ---");
  const videoFile = await uploadLocalFile(
    (m, p) => call(m, p),
    VIDEO_PATH,
  );
  const videoSent = await call<AnyRecord>("messages.sendMedia", {
    peer: inputPeer,
    message: `[telegram-reverse] video ${VIDEO_PATH.split("/").pop()}`,
    random_id: randomId(),
    media: {
      _: "inputMediaUploadedDocument",
      file: videoFile,
      mime_type: "video/mp4",
      attributes: [
        {
          _: "documentAttributeVideo",
          duration: 0,
          w: 0,
          h: 0,
          supports_streaming: true,
        },
        {
          _: "documentAttributeFilename",
          file_name: VIDEO_PATH.split("/").pop() ?? "video.mp4",
        },
      ],
    },
  });
  console.log("video send:", videoSent._);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
