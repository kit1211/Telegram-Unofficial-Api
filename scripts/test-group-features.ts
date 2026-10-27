/**
 * Live smoke test: join @username group/channel and exercise RPCs from WebK reverse map.
 * Usage: bun run scripts/test-group-features.ts [username]
 */
import { createMtprotoSession } from "../src/mtproto/client/create-session";
import type { MtprotoCoreSession } from "../src/mtproto/client/mtproto-core-session";
import { callWithDcMigrate } from "../src/mtproto/dc-migrate";

const USERNAME = (process.argv[2] ?? "telegram").replace(/^@/, "");

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

async function call<T>(
  session: MtprotoCoreSession,
  method: string,
  params: AnyRecord = {},
): Promise<T> {
  return callWithDcMigrate(session, method, params) as Promise<T>;
}

function peerFromResolved(resolved: AnyRecord): AnyRecord | null {
  const peers = resolved as {
    peer?: AnyRecord;
    chats?: AnyRecord[];
    users?: AnyRecord[];
  };
  if (peers.peer) return peers.peer;
  const chat = peers.chats?.[0];
  if (chat) {
    if (chat._ === "channel") {
      return { _: "peerChannel", channel_id: chat.id };
    }
    if (chat._ === "chat") {
      return { _: "peerChat", chat_id: chat.id };
    }
  }
  return null;
}

function inputPeerFromResolved(resolved: AnyRecord): AnyRecord | null {
  const chat = resolved.chats?.[0] as AnyRecord | undefined;
  if (!chat) return null;
  if (chat._ === "channel") {
    return {
      _: "inputPeerChannel",
      channel_id: chat.id,
      access_hash: chat.access_hash,
    };
  }
  if (chat._ === "chat") {
    return { _: "inputPeerChat", chat_id: chat.id };
  }
  return null;
}

async function main() {
  const session = createMtprotoSession();
  const results: AnyRecord = { username: USERNAME, steps: [] as AnyRecord[] };

  const log = (name: string, ok: boolean, detail?: unknown) => {
    results.steps.push({ name, ok, detail });
    const mark = ok ? "OK" : "FAIL";
    console.log(`[${mark}] ${name}`, detail !== undefined ? detail : "");
  };

  console.log(`Resolve @${USERNAME}…`);
  let resolved: AnyRecord;
  try {
    resolved = await call(session, "contacts.resolveUsername", {
      username: USERNAME,
    });
    log("contacts.resolveUsername", true, {
      peer: peerFromResolved(resolved),
      chatType: (resolved.chats as AnyRecord[])?.[0]?._,
      title: (resolved.chats as AnyRecord[])?.[0]?.title,
    });
  } catch (e) {
    log("contacts.resolveUsername", false, String(e));
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  const chat = (resolved.chats as AnyRecord[])?.[0];
  const inputPeer = inputPeerFromResolved(resolved);
  if (!inputPeer || !chat) {
    log("inputPeer", false, "no chat in resolve result");
    process.exit(1);
  }

  if (chat._ === "channel") {
    try {
      const updates = await call(session, "channels.joinChannel", {
        channel: {
          _: "inputChannel",
          channel_id: chat.id,
          access_hash: chat.access_hash,
        },
      });
      log("channels.joinChannel", true, { _: updates._ });
    } catch (e) {
      const msg = String(e);
      const already =
        /USER_ALREADY_PARTICIPANT|CHANNELS_TOO_MUCH|INVITE_REQUEST_SENT/i.test(
          msg,
        );
      log("channels.joinChannel", already, already ? msg : msg);
      if (!already) {
        /* continue if join not required (public view) */
      }
    }
  }

  const scheduleIn = Math.floor(Date.now() / 1000) + 120;
  let sentMsgId: number | undefined;

  try {
    const sent = await call<AnyRecord>(session, "messages.sendMessage", {
      peer: inputPeer,
      message: `[telegram-reverse smoke] hello @${new Date().toISOString()}`,
      random_id: randomId(),
    });
    const msg = extractFirstMessageId(sent);
    sentMsgId = msg;
    log("messages.sendMessage", true, { msg_id: msg });
  } catch (e) {
    log("messages.sendMessage", false, String(e));
  }

  if (sentMsgId) {
    try {
      const reactions = await call<AnyRecord>(
        session,
        "messages.getAvailableReactions",
        { hash: 0 },
      );
      const list =
        reactions._ === "messages.availableReactions"
          ? (reactions.reactions as AnyRecord[])
          : [];
      const emoji =
        (list[0]?.reaction as AnyRecord)?.emoticon ??
        (list.find((r) => (r.reaction as AnyRecord)?.emoticon === "👍")
          ?.reaction as AnyRecord)?.emoticon ??
        "👍";
      await call(session, "messages.sendReaction", {
        peer: inputPeer,
        msg_id: sentMsgId,
        reaction: [{ _: "reactionEmoji", emoticon: emoji }],
      });
      log("messages.sendReaction", true, { emoji, msg_id: sentMsgId });
    } catch (e) {
      log("messages.sendReaction", false, String(e));
    }
  }

  try {
    const scheduled = await call<AnyRecord>(session, "messages.sendMessage", {
      peer: inputPeer,
      message: `[telegram-reverse] scheduled +2min ${new Date().toISOString()}`,
      random_id: randomId(),
      schedule_date: scheduleIn,
    });
    log("messages.sendMessage (schedule_date)", true, {
      schedule_date: scheduleIn,
      update: scheduled._,
    });
  } catch (e) {
    log("messages.sendMessage (schedule_date)", false, String(e));
  }

  try {
    const sched = await call(session, "messages.getScheduledHistory", {
      peer: inputPeer,
      hash: 0,
    });
    log("messages.getScheduledHistory", true, { _: (sched as AnyRecord)._ });
  } catch (e) {
    log("messages.getScheduledHistory", false, String(e));
  }

  try {
    const stickers = await call(session, "messages.getAllStickers", {
      hash: BigInt(0),
    });
    log("messages.getAllStickers", true, { _: (stickers as AnyRecord)._ });
  } catch (e) {
    log("messages.getAllStickers", false, String(e));
  }

  try {
    await call(session, "messages.getPeerStories", {
      peer: inputPeer,
    });
    log("stories.getPeerStories (via messages.getPeerStories)", true, {});
  } catch (e) {
    try {
      await call(session, "stories.getPeerStories", {
        peer: inputPeer,
      });
      log("stories.getPeerStories", true, {});
    } catch (e2) {
      log("stories.getPeerStories", false, String(e2));
    }
  }

  console.log("\n--- summary ---");
  console.log(JSON.stringify(results, null, 2));
}

function extractFirstMessageId(updates: AnyRecord): number | undefined {
  const upd = updates.updates as AnyRecord[] | undefined;
  if (!upd) return undefined;
  for (const u of upd) {
    if (u._ === "updateNewMessage" || u._ === "updateNewChannelMessage") {
      const msg = u.message as AnyRecord;
      return msg?.id as number | undefined;
    }
  }
  const msg = updates.message as AnyRecord | undefined;
  return msg?.id as number | undefined;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
