/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "stats.broadcastStats",
  "stats.getBroadcastStats",
  "stats.getMegagroupStats",
  "stats.getMessagePublicForwards",
  "stats.getMessageStats",
  "stats.getPollStats",
  "stats.getStoryPublicForwards",
  "stats.getStoryStats",
  "stats.loadAsyncGraph",
  "stats.megagroupStats",
  "stats.messageStats",
  "stats.pollStats",
  "stats.publicForwards",
  "stats.storyStats",
] as const

export type StatsRpcMethod = (typeof RPC_METHODS)[number];
