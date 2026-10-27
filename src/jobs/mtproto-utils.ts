type AnyRecord = Record<string, unknown>;

export const PAGE = 200;
/** พักหลังได้ผลหนึ่งหน้า — กัน FLOOD_WAIT ต่อบัญชี */
export const PAGE_DELAY_MS = 1000;

export function formatRpcError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const rec = error as {
      error_message?: string;
      error_code?: number;
      message?: string;
    };
    if (rec.error_message) {
      return rec.error_code
        ? `${rec.error_message} (${rec.error_code})`
        : rec.error_message;
    }
    if (rec.message) return rec.message;
  }
  if (typeof error === "string" && error) return error;
  return "unknown error";
}

export function asError(error: unknown): Error {
  if (error instanceof Error && error.message) return error;
  const wrapped = new Error(formatRpcError(error));
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

/** Invite link hash from `https://t.me/+AbCd` or `+AbCd`. */
export function parseInviteHash(raw: string): string | undefined {
  const part = raw
    .trim()
    .replace(/^@/, "")
    .replace(/^https:\/\/t\.me\//, "")
    .split(/[/?#]/)[0];
  if (part.startsWith("+")) return part.slice(1);
  return undefined;
}

export function parseUsername(raw: string): string {
  const invite = parseInviteHash(raw);
  if (invite) return `+${invite}`;
  return raw.replace(/^@/, "").replace(/^https:\/\/t\.me\//, "").split("/")[0];
}

function channelFromInviteCheck(check: AnyRecord): AnyRecord | undefined {
  if (check._ === "chatInviteAlready") {
    return check.chat as AnyRecord | undefined;
  }
  if (check._ === "chatInvite" || check._ === "chatInvitePeek") {
    return check.chat as AnyRecord | undefined;
  }
  return undefined;
}

function channelFromUpdates(updates: AnyRecord): AnyRecord | undefined {
  const chats = (updates.chats as AnyRecord[] | undefined) ?? [];
  return chats.find((c) => c._ === "channel");
}

async function resolveChannelViaInvite(
  call: (m: string, p: AnyRecord) => Promise<unknown>,
  hash: string,
) {
  let check = (await call("messages.checkChatInvite", { hash })) as AnyRecord;
  let chat = channelFromInviteCheck(check);
  if (!chat) {
    const imported = (await call("messages.importChatInvite", {
      hash,
    })) as AnyRecord;
    chat = channelFromUpdates(imported);
  }
  if (!chat || chat._ !== "channel") {
    throw new Error(`invite ${hash} is not a channel/supergroup`);
  }
  return {
    chat,
    inputChannel: {
      _: "inputChannel",
      channel_id: chat.id,
      access_hash: chat.access_hash,
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function floodWaitSeconds(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const rec = error as { error_message?: string; message?: string };
  const msg = rec.error_message ?? rec.message;
  if (!msg) return undefined;
  const m = msg.match(/FLOOD_WAIT_(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export async function callRetry<T>(
  call: (method: string, params: AnyRecord) => Promise<T>,
  method: string,
  params: AnyRecord,
): Promise<T> {
  for (;;) {
    try {
      return await call(method, params);
    } catch (error) {
      const wait = floodWaitSeconds(error);
      if (wait === undefined) throw asError(error);
      await sleep((wait + 1) * 1000);
    }
  }
}

export function searchQueries(): string[] {
  const chars =
    "abcdefghijklmnopqrstuvwxyz0123456789_" +
    "กขคฆงจฉชซญดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
  return ["", ...chars.split("")];
}

export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function resolveChannel(
  call: (m: string, p: AnyRecord) => Promise<unknown>,
  username: string,
) {
  const inviteHash = parseInviteHash(username);
  if (inviteHash) {
    return resolveChannelViaInvite(call, inviteHash);
  }
  const resolved = (await call("contacts.resolveUsername", {
    username,
  })) as AnyRecord;
  const chat = (resolved.chats as AnyRecord[])?.[0];
  if (!chat || chat._ !== "channel") {
    throw new Error(`@${username} is not a channel/supergroup`);
  }
  return {
    chat,
    inputChannel: {
      _: "inputChannel",
      channel_id: chat.id,
      access_hash: chat.access_hash,
    },
  };
}
