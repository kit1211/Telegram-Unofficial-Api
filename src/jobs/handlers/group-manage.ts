import { UnrecoverableError } from "bullmq";
import { callWithDcMigrate } from "../../mtproto/dc-migrate";
import { getAccountSession } from "../../mtproto/client/session-pool";
import { withAccountLock } from "../../queue/account-lock";
import { setJobMeta } from "../../queue/job-meta";
import type { GroupManagePayload } from "../types";
import { asError, formatRpcError, parseUsername, resolveChannel } from "../mtproto-utils";
import { copyForumTopics } from "./topic-copy";

type AnyRecord = Record<string, unknown>;

function randomId(): bigint {
  return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
}

function jsonSafe(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Record<string, unknown>;
}

function requireText(value: string | undefined, name: string): string {
  const text = value?.trim() ?? "";
  if (!text) throw new UnrecoverableError(`${name} is required`);
  return text;
}

function requireTopicId(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    throw new UnrecoverableError("topicId is required");
  }
  return value;
}

function summarizeTopics(result: AnyRecord): AnyRecord[] {
  const topics = (result.topics as AnyRecord[] | undefined) ?? [];
  return topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    iconColor: topic.icon_color,
    iconEmojiId: topic.icon_emoji_id,
    closed: Boolean(topic.closed),
    pinned: Boolean(topic.pinned),
    hidden: Boolean(topic.hidden),
    topMessage: topic.top_message,
  }));
}

function topicIdFromUpdates(updates: AnyRecord): number | undefined {
  const list = (updates.updates as AnyRecord[] | undefined) ?? [];
  for (const update of list) {
    const message = update.message as AnyRecord | undefined;
    if (message?.id != null) return Number(message.id);
  }
  return undefined;
}

export async function runGroupManage(payload: GroupManagePayload): Promise<void> {
  const jobId = payload.jobId;
  const accountId = payload.accountId || "default";
  const username = parseUsername(payload.username);
  const session = getAccountSession(accountId);
  const call = <T>(method: string, params: AnyRecord = {}) =>
    callWithDcMigrate<T>(session, method, params);
  const locked = <T>(fn: () => Promise<T>) => withAccountLock(accountId, fn);

  let data: Record<string, unknown>;
  try {
    data = await runAction();
  } catch (error) {
    if (error instanceof UnrecoverableError) throw error;
    const message = formatRpcError(error);
    if (/FLOOD_WAIT/.test(message)) throw asError(error);
    throw new UnrecoverableError(message);
  }

  await setJobMeta(jobId, {
    type: "group.manage",
    status: "completed",
    result: { data: jsonSafe(data) },
  });

  async function runAction(): Promise<Record<string, unknown>> {
    const { inputChannel } = await locked(() => resolveChannel(call, username));
    const inputPeer = {
      _: "inputPeerChannel",
      channel_id: inputChannel.channel_id,
      access_hash: inputChannel.access_hash,
    };

    switch (payload.action) {
      case "title": {
        const title = requireText(payload.title, "title");
        const updates = await locked(() =>
          call<AnyRecord>("channels.editTitle", { channel: inputChannel, title }),
        );
        return { action: payload.action, title, updates: updates._ };
      }
      case "about": {
        const about = payload.about ?? "";
        await locked(() =>
          call("messages.editChatAbout", { peer: inputPeer, about }),
        );
        return { action: payload.action, about };
      }
      case "forum": {
        if (typeof payload.enabled !== "boolean") {
          throw new UnrecoverableError("enabled is required");
        }
        const updates = await locked(() =>
          call<AnyRecord>("channels.toggleForum", {
            channel: inputChannel,
            enabled: payload.enabled,
          }),
        );
        return { action: payload.action, enabled: payload.enabled, updates: updates._ };
      }
      case "topic.create": {
        const title = requireText(payload.title, "title");
        const params: AnyRecord = {
          channel: inputChannel,
          title,
          random_id: randomId(),
        };
        if (payload.iconColor != null) params.icon_color = payload.iconColor;
        if (payload.iconEmojiId) params.icon_emoji_id = payload.iconEmojiId;
        const updates = await locked(() =>
          call<AnyRecord>("channels.createForumTopic", params),
        );
        return {
          action: payload.action,
          title,
          topicId: topicIdFromUpdates(updates),
          updates: updates._,
        };
      }
      case "topic.list": {
        const limit = Math.min(100, Math.max(1, payload.limit || 20));
        const params: AnyRecord = {
          channel: inputChannel,
          offset_date: 0,
          offset_id: 0,
          offset_topic: 0,
          limit,
        };
        if (payload.q) params.q = payload.q;
        const result = await locked(() =>
          call<AnyRecord>("channels.getForumTopics", params),
        );
        return {
          action: payload.action,
          count: result.count,
          topics: summarizeTopics(result),
        };
      }
      case "topic.edit": {
        const topicId = requireTopicId(payload.topicId);
        if (
          payload.title == null &&
          payload.closed == null &&
          payload.hidden == null &&
          !payload.iconEmojiId
        ) {
          throw new UnrecoverableError("title, closed, hidden, or iconEmojiId is required");
        }
        const params: AnyRecord = { channel: inputChannel, topic_id: topicId };
        if (payload.title != null) params.title = payload.title;
        if (payload.iconEmojiId) params.icon_emoji_id = payload.iconEmojiId;
        if (payload.closed != null) params.closed = payload.closed;
        if (payload.hidden != null) params.hidden = payload.hidden;
        const updates = await locked(() =>
          call<AnyRecord>("channels.editForumTopic", params),
        );
        return { action: payload.action, topicId, updates: updates._ };
      }
      case "topic.copy":
        return copyForumTopics({
          jobId,
          targetUsername: username,
          sourceChannelId: payload.sourceChannelId,
          replaceFrom: payload.replaceFrom,
          replaceTo: payload.replaceTo,
        });
      case "topic.pin": {
        const topicId = requireTopicId(payload.topicId);
        if (typeof payload.pinned !== "boolean") {
          throw new UnrecoverableError("pinned is required");
        }
        const updates = await locked(() =>
          call<AnyRecord>("channels.updatePinnedForumTopic", {
            channel: inputChannel,
            topic_id: topicId,
            pinned: payload.pinned,
          }),
        );
        return {
          action: payload.action,
          topicId,
          pinned: payload.pinned,
          updates: updates._,
        };
      }
      default:
        throw new UnrecoverableError(`unknown action: ${payload.action}`);
    }
  }
}
