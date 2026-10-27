/**
 * Send a video with caption + install sticker set and send stickers from it.
 * Usage: bun run scripts/send-video-and-stickers.ts [username] [videoPath] [stickerShortName]
 */
import { createMtprotoSession } from "../src/mtproto/client/create-session";
import type { MtprotoCoreSession } from "../src/mtproto/client/mtproto-core-session";
import { callWithDcMigrate } from "../src/mtproto/dc-migrate";
import { uploadLocalFile } from "../src/mtproto/upload/file-upload";

const USERNAME = (process.argv[2] ?? "telegram").replace(/^@/, "");
const VIDEO_PATH =
  process.argv[3] ??
  "/home/zhang/Documents/My/telegram-reverse/Yukina_-_u_look_nervous_6BuKUh.mp4";
const STICKER_SHORT = (process.argv[4] ?? "BabyYoda").replace(/^.*addstickers\//, "");

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

function inputDocumentFrom(doc: AnyRecord): AnyRecord {
  return {
    _: "inputDocument",
    id: doc.id,
    access_hash: doc.access_hash,
    file_reference: doc.file_reference,
  };
}

async function resolveChannelPeer(session: MtprotoCoreSession) {
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);
  const resolved = await call<AnyRecord>("contacts.resolveUsername", {
    username: USERNAME,
  });
  const chat = (resolved.chats as AnyRecord[])?.[0];
  if (!chat) throw new Error(`No chat for @${USERNAME}`);
  const inputPeer =
    chat._ === "channel"
      ? {
          _: "inputPeerChannel",
          channel_id: chat.id,
          access_hash: chat.access_hash,
        }
      : { _: "inputPeerChat", chat_id: chat.id };
  return { call, chat, inputPeer };
}

async function main() {
  const session = createMtprotoSession();
  const { call, chat, inputPeer } = await resolveChannelPeer(session);

  console.log(`Target: ${chat.title} (@${USERNAME})`);

  const caption =
    "u look nervous 👀 — Baby Yoda มาให้กำลังใจแล้ว\n" +
    "(telegram-reverse smoke test)";

  console.log("\n--- video + caption ---");
  const videoFile = await uploadLocalFile((m, p) => call(m, p), VIDEO_PATH);
  const videoName = VIDEO_PATH.split("/").pop() ?? "video.mp4";
  await call("messages.sendMedia", {
    peer: inputPeer,
    message: caption,
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
        { _: "documentAttributeFilename", file_name: videoName },
      ],
    },
  });
  console.log("OK video sent");

  console.log(`\n--- sticker set: ${STICKER_SHORT} ---`);
  const setResult = await call<AnyRecord>("messages.getStickerSet", {
    stickerset: {
      _: "inputStickerSetShortName",
      short_name: STICKER_SHORT,
    },
    hash: 0,
  });
  const set = setResult.set as AnyRecord;
  const documents = (setResult.documents as AnyRecord[]) ?? [];
  console.log(`Set: ${set.title} (${documents.length} stickers)`);

  try {
    await call("messages.installStickerSet", {
      stickerset: {
        _: "inputStickerSetShortName",
        short_name: STICKER_SHORT,
      },
      archived: false,
    });
    console.log("installed sticker set on account");
  } catch (e) {
    const msg = String(e);
    if (/STICKERSET_ALREADY|already/i.test(msg)) {
      console.log("sticker set already installed");
    } else {
      console.warn("installStickerSet:", msg);
    }
  }

  const toSend = documents.slice(0, 5);
  console.log(`\n--- sending ${toSend.length} stickers ---`);
  for (let i = 0; i < toSend.length; i++) {
    const doc = toSend[i];
    await call("messages.sendMedia", {
      peer: inputPeer,
      message: i === 0 ? "Baby Yoda squad 🍼" : "",
      random_id: randomId(),
      media: {
        _: "inputMediaDocument",
        id: inputDocumentFrom(doc),
      },
    });
    console.log(`  sticker ${i + 1}/${toSend.length} ok`);
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
