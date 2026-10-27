/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "smsjobs.eligibleToJoin",
  "smsjobs.finishJob",
  "smsjobs.getSmsJob",
  "smsjobs.getStatus",
  "smsjobs.isEligibleToJoin",
  "smsjobs.join",
  "smsjobs.leave",
  "smsjobs.status",
  "smsjobs.updateSettings",
] as const

export type SmsjobsRpcMethod = (typeof RPC_METHODS)[number];
