export type JobType =
  | "member.dump"
  | "member.dump.filter"
  | "member.dump.finalize"
  | "member.invite"
  | "auth.phone"
  | "auth.qr"
  | "profile.self"
  | "group.smoke"
  | "group.sendMedia"
  | "group.manage"
  | "account.reset";

export type JobStatus =
  | "queued"
  | "active"
  | "waiting_input"
  | "completed"
  | "failed";

export type JobInputNeeds = "otp" | "password" | "scan" | "signup";

export interface JobProgress {
  filtersDone?: number;
  filtersTotal?: number;
  uniqueCount?: number;
  reportedCount?: number;
  invited?: number;
  failed?: number;
  /** คนที่ยังไม่เชิญจาก CSV */
  remaining?: number;
  /** เชิญสำเร็จติดกันก่อนโดน PEER_FLOOD ในรอบนี้ */
  burstInvited?: number;
  rateLimit?: string;
  message?: string;
  filtersFailed?: number;
  /** สมาชิกที่ได้จาก RPC ล่าสุด (สูงสุด pageLimit) */
  lastFetchCount?: number;
  lastFetchOffset?: number;
  pageLimit?: number;
  pageDelayMs?: number;
  activeFilter?: string;
  activeAccount?: string;
}

export interface JobResult {
  downloadPath?: string;
  profile?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  logs?: string[];
  stoppedReason?: string;
  data?: Record<string, unknown>;
}

export type JobPayload =
  | MemberDumpPayload
  | MemberDumpFilterPayload
  | MemberDumpFinalizePayload
  | MemberInvitePayload
  | AuthPhonePayload
  | AuthQrPayload
  | ProfileSelfPayload
  | GroupSmokePayload
  | GroupSendMediaPayload
  | GroupManagePayload
  | AccountResetPayload;

export interface MemberDumpPayload {
  type: "member.dump";
  jobId: string;
  username: string;
  accounts: string[];
  pageLimit: number;
  pageDelayMs: number;
}

export interface MemberDumpFilterPayload {
  type: "member.dump.filter";
  parentJobId: string;
  label: string;
  filter: Record<string, unknown>;
  accountId: string;
  username: string;
  inputChannel: Record<string, unknown>;
  reportedCount: number;
  pageLimit: number;
  pageDelayMs: number;
}

export interface MemberDumpFinalizePayload {
  type: "member.dump.finalize";
  parentJobId: string;
  username: string;
}

export interface MemberInvitePayload {
  type: "member.invite";
  jobId: string;
  targetUsername: string;
  sourceJobId?: string;
  csvPath?: string;
  limit: number;
  delayMs: number;
  batch: number;
  /** Skip first N CSV rows (e.g. after another job used the head). */
  offset?: number;
  accountId?: string;
}

export interface AuthPhonePayload {
  type: "auth.phone";
  jobId: string;
  phone: string;
  accountId: string;
}

export interface AuthQrPayload {
  type: "auth.qr";
  jobId: string;
  accountId: string;
}

export interface ProfileSelfPayload {
  type: "profile.self";
  jobId: string;
  accountId?: string;
}

export interface GroupSmokePayload {
  type: "group.smoke";
  jobId: string;
  username: string;
  accountId?: string;
}

export interface GroupSendMediaPayload {
  type: "group.sendMedia";
  jobId: string;
  username: string;
  videoPath?: string;
  stickerShortName?: string;
  accountId?: string;
}

export type GroupManageAction =
  | "title"
  | "about"
  | "forum"
  | "topic.create"
  | "topic.list"
  | "topic.edit"
  | "topic.pin"
  | "topic.copy";

export interface GroupManagePayload {
  type: "group.manage";
  jobId: string;
  username: string;
  accountId?: string;
  action: GroupManageAction;
  title?: string;
  about?: string;
  enabled?: boolean;
  topicId?: number;
  iconColor?: number;
  iconEmojiId?: string;
  closed?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  limit?: number;
  q?: string;
  sourceChannelId?: string;
  replaceFrom?: string;
  replaceTo?: string;
}

export interface AccountResetPayload {
  type: "account.reset";
  jobId: string;
  accountId: string;
}

export function isJobPayload(data: unknown): data is JobPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string"
  );
}
