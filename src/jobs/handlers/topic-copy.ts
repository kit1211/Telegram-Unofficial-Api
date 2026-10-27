import { UnrecoverableError } from "bullmq";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { getAccountSession } from "../../mtproto/client/session-pool";
import { withAccountLock } from "../../queue/account-lock";
import { patchJobProgress } from "../../queue/job-meta";
import {
  defaultSessionDbPath,
  listSessionAccounts,
  openMtprotoSessionDatabase,
} from "../../storage/sqlite";
import {
  floodWaitSeconds,
  formatRpcError,
  resolveChannel,
  sleep,
} from "../mtproto-utils";

type AnyRecord = Record<string, unknown>;

type Call = <T>(method: string, params?: AnyRecord) => Promise<T>;

export interface TopicCopyRequest {
  jobId: string;
  targetUsername: string;
  sourceChannelId?: string;
  replaceFrom?: string;
  replaceTo?: string;
}

function accountIds(): string[] {
  const db = openMtprotoSessionDatabase(defaultSessionDbPath());
  try {
    return listSessionAccounts(db).map((row) => row.account_id);
  } finally {
    db.close();
  }
}

function caller(accountId: string): {
  call: Call;
  locked: <T>(fn: () => Promise<T>) => Promise<T>;
} {
  const session = getAccountSession(accountId);
  const call: Call = (method, params = {}) =>
    callWithDcMigrate(session, method, params);
  const locked = <T>(fn: () => Promise<T>) => withAccountLock(accountId, fn);
  return { call, locked };
}

function renameTitle(title: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(escaped, "gi"), to).slice(0, 128);
}

function messageDate(messages: AnyRecord[], id: unknown): number {
  const found = messages.find((message) => String(message.id) === String(id));
  return Number(found?.date ?? 0);
}

function inputPeerFromDialog(
  dialog: AnyRecord,
  chats: AnyRecord[],
  users: AnyRecord[],
): AnyRecord {
  const peer = dialog.peer as AnyRecord | undefined;
  if (peer?._ === "peerChannel") {
    const chat = chats.find((item) => String(item.id) === String(peer.channel_id));
    return {
      _: "inputPeerChannel",
      channel_id: peer.channel_id,
      access_hash: chat?.access_hash,
    };
  }
  if (peer?._ === "peerUser") {
    const user = users.find((item) => String(item.id) === String(peer.user_id));
    return {
      _: "inputPeerUser",
      user_id: peer.user_id,
      access_hash: user?.access_hash,
    };
  }
  if (peer?._ === "peerChat") return { _: "inputPeerChat", chat_id: peer.chat_id };
  return { _: "inputPeerEmpty" };
}

async function findChannel(
  call: Call,
  locked: <T>(fn: () => Promise<T>) => Promise<T>,
  channelId: string,
): Promise<AnyRecord | null> {
  for (const folderId of [undefined, 1]) {
    let offsetDate = 0;
    let offsetId = 0;
    let offsetPeer: AnyRecord = { _: "inputPeerEmpty" };
    const seen = new Set<string>();
    for (let page = 0; page < 40; page++) {
      const params: AnyRecord = {
        offset_date: offsetDate,
        offset_id: offsetId,
        offset_peer: offsetPeer,
        limit: 100,
        hash: 0,
      };
      if (folderId != null) params.folder_id = folderId;
      const result = await locked(() => call<AnyRecord>("messages.getDialogs", params));
      const chats = (result.chats as AnyRecord[] | undefined) ?? [];
      const hit = chats.find((chat) => String(chat.id) === channelId);
      if (hit?.access_hash != null) return hit;
      const dialogs = (result.dialogs as AnyRecord[] | undefined) ?? [];
      if (dialogs.length === 0) break;
      const last = dialogs[dialogs.length - 1]!;
      const peerKey = JSON.stringify(last.peer);
      if (seen.has(peerKey)) break;
      seen.add(peerKey);
      offsetId = Number(last.top_message ?? 0);
      offsetDate = messageDate((result.messages as AnyRecord[] | undefined) ?? [], last.top_message);
      offsetPeer = inputPeerFromDialog(
        last,
        chats,
        (result.users as AnyRecord[] | undefined) ?? [],
      );
      if (dialogs.length < 100) break;
    }
  }
  return null;
}

async function listTopics(
  call: Call,
  locked: <T>(fn: () => Promise<T>) => Promise<T>,
  inputChannel: AnyRecord,
): Promise<AnyRecord[]> {
  const all: AnyRecord[] = [];
  const seen = new Set<string>();
  let offsetDate = 0;
  let offsetId = 0;
  let offsetTopic = 0;
  for (let page = 0; page < 30; page++) {
    const result = await locked(() =>
      call<AnyRecord>("channels.getForumTopics", {
        channel: inputChannel,
        offset_date: offsetDate,
        offset_id: offsetId,
        offset_topic: offsetTopic,
        limit: 100,
      }),
    );
    const topics = (result.topics as AnyRecord[] | undefined) ?? [];
    if (topics.length === 0) break;
    let added = 0;
    for (const topic of topics) {
      const id = String(topic.id);
      if (seen.has(id)) continue;
      seen.add(id);
      all.push(topic);
      added++;
    }
    if (added === 0 || topics.length < 100) break;
    const last = topics[topics.length - 1]!;
    offsetDate = Number(last.date ?? 0);
    offsetId = Number(last.top_message ?? 0);
    offsetTopic = Number(last.id);
  }
  return all;
}

async function withFloodRetry<T>(
  locked: <R>(fn: () => Promise<R>) => Promise<R>,
  fn: () => Promise<T>,
): Promise<T> {
  for (;;) {
    try {
      return await locked(fn);
    } catch (error) {
      const wait = floodWaitSeconds(error);
      if (wait === undefined) throw error;
      console.log(`[topic.copy] FLOOD_WAIT_${wait} — sleep ${wait + 1}s`);
      await sleep((wait + 1) * 1000);
    }
  }
}

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

function topicIdFromUpdates(updates: AnyRecord): number | undefined {
  const list = (updates.updates as AnyRecord[] | undefined) ?? [];
  for (const update of list) {
    const message = update.message as AnyRecord | undefined;
    if (message?.id != null) return Number(message.id);
  }
  return undefined;
}

interface ManagedAccount {
  accountId: string;
  username?: string;
  role: string;
  inputChannel: AnyRecord;
  call: Call;
  locked: <T>(fn: () => Promise<T>) => Promise<T>;
}

async function pickManager(targetUsername: string): Promise<{
  manager?: ManagedAccount;
  checked: { accountId: string; role: string; error?: string }[];
}> {
  const checked: { accountId: string; role: string; error?: string }[] = [];
  let manager: ManagedAccount | undefined;
  for (const accountId of accountIds()) {
    const { call, locked } = caller(accountId);
    try {
      const { inputChannel } = await locked(() => resolveChannel(call, targetUsername));
      const self = await locked(() =>
        call<AnyRecord>("users.getFullUser", { id: { _: "inputUserSelf" } }),
      );
      const me = ((self.users as AnyRecord[] | undefined) ?? [])[0];
      const part = await locked(() =>
        call<AnyRecord>("channels.getParticipant", {
          channel: inputChannel,
          participant: { _: "inputPeerSelf" },
        }),
      );
      const participant = part.participant as AnyRecord | undefined;
      const role = String(participant?._ ?? "unknown");
      const rights = participant?.admin_rights as AnyRecord | undefined;
      const can =
        role === "channelParticipantCreator" || rights?.manage_topics === true;
      checked.push({ accountId, role });
      if (can && !manager) {
        manager = {
          accountId,
          username: me?.username ? String(me.username) : undefined,
          role,
          inputChannel,
          call,
          locked,
        };
      }
    } catch (error) {
      checked.push({ accountId, role: "error", error: formatRpcError(error) });
    }
  }
  return { manager, checked };
}

export async function copyForumTopics(
  request: TopicCopyRequest,
): Promise<Record<string, unknown>> {
  const sourceChannelId = request.sourceChannelId?.replace(/\D/g, "") ?? "";
  if (!sourceChannelId) throw new UnrecoverableError("sourceChannelId is required");
  const replaceFrom = request.replaceFrom?.trim() || "Fiwfan";
  const replaceTo = request.replaceTo ?? "FiwFriend";

  const { manager, checked } = await pickManager(request.targetUsername);
  if (!manager) {
    throw new UnrecoverableError(
      `no account can manage topics in @${request.targetUsername}: ${JSON.stringify(checked)}`,
    );
  }

  let sourceChat: AnyRecord | null = null;
  let sourceAccount = manager.accountId;
  let sourceCall = manager.call;
  let sourceLocked = manager.locked;
  for (const accountId of accountIds()) {
    const client = accountId === manager.accountId ? manager : caller(accountId);
    const chat = await findChannel(client.call, client.locked, sourceChannelId);
    if (chat) {
      sourceChat = chat;
      sourceAccount = accountId;
      sourceCall = client.call;
      sourceLocked = client.locked;
      break;
    }
  }
  if (!sourceChat) {
    throw new UnrecoverableError(
      `channel ${sourceChannelId} is not in any local account dialogs`,
    );
  }

  const sourceChannel = {
    _: "inputChannel",
    channel_id: sourceChat.id,
    access_hash: sourceChat.access_hash,
  };
  const sourceTopics = await listTopics(sourceCall, sourceLocked, sourceChannel);
  console.log(
    `[topic.copy] source=${sourceChat.title} topics=${sourceTopics.length} via=${sourceAccount} manager=${manager.accountId}`,
  );
  await patchJobProgress(request.jobId, {
    message: `found ${sourceTopics.length} topics, creating in @${request.targetUsername}`,
    activeAccount: manager.accountId,
  });

  await withFloodRetry(manager.locked, () =>
    manager.call("channels.toggleForum", {
      channel: manager.inputChannel,
      enabled: true,
    }),
  );

  const existing = await listTopics(manager.call, manager.locked, manager.inputChannel);
  const existingTitles = new Set(
    existing.map((topic) => String(topic.title ?? "")),
  );
  const general = sourceTopics.find((topic) => Number(topic.id) === 1);
  let renamedGeneral: string | undefined;
  if (general) {
    const title = renameTitle(String(general.title ?? ""), replaceFrom, replaceTo);
    const targetGeneral = existing.find((topic) => Number(topic.id) === 1);
    if (targetGeneral && String(targetGeneral.title ?? "") !== title) {
      await withFloodRetry(manager.locked, () =>
        manager.call("channels.editForumTopic", {
          channel: manager.inputChannel,
          topic_id: 1,
          title,
        }),
      );
      renamedGeneral = title;
      existingTitles.add(title);
    }
  }

  const rest = sourceTopics
    .filter((topic) => Number(topic.id) !== 1)
    .sort((a, b) => Number(a.date ?? 0) - Number(b.date ?? 0));

  const created: { sourceId: unknown; title: string; topicId?: number; pinned: boolean }[] = [];
  const skipped: { sourceId: unknown; title: string; reason: string }[] = [];

  for (const topic of rest) {
    const title = renameTitle(String(topic.title ?? ""), replaceFrom, replaceTo);
    if (!title) {
      skipped.push({ sourceId: topic.id, title, reason: "empty title" });
      continue;
    }
    if (existingTitles.has(title)) {
      skipped.push({ sourceId: topic.id, title, reason: "already exists" });
      continue;
    }
    const params: AnyRecord = {
      channel: manager.inputChannel,
      title,
      random_id: randomId(),
    };
    if (topic.icon_color != null) params.icon_color = topic.icon_color;
    if (topic.icon_emoji_id != null && String(topic.icon_emoji_id) !== "0") {
      params.icon_emoji_id = topic.icon_emoji_id;
    }
    const updates = await withFloodRetry(manager.locked, () =>
      manager.call<AnyRecord>("channels.createForumTopic", params),
    );
    const topicId = topicIdFromUpdates(updates);
    existingTitles.add(title);
    if (topic.closed === true && topicId) {
      await withFloodRetry(manager.locked, () =>
        manager.call("channels.editForumTopic", {
          channel: manager.inputChannel,
          topic_id: topicId,
          closed: true,
        }),
      );
    }
    if (topic.pinned === true && topicId) {
      await withFloodRetry(manager.locked, () =>
        manager.call("channels.updatePinnedForumTopic", {
          channel: manager.inputChannel,
          topic_id: topicId,
          pinned: true,
        }),
      );
    }
    created.push({ sourceId: topic.id, title, topicId, pinned: topic.pinned === true });
    console.log(`[topic.copy] created ${title} id=${topicId} (${created.length}/${rest.length})`);
    await patchJobProgress(request.jobId, {
      message: `created ${created.length}/${rest.length}: ${title}`,
      activeAccount: manager.accountId,
    });
    await sleep(400);
  }

  return {
    action: "topic.copy",
    manager: manager.accountId,
    managerUsername: manager.username,
    managerRole: manager.role,
    sourceAccount,
    sourceTitle: sourceChat.title,
    sourceTopics: sourceTopics.length,
    forumEnabled: true,
    renamedGeneral,
    created,
    skipped,
    checked,
  };
}
