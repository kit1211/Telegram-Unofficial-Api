/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "updates.channelDifference",
  "updates.channelDifferenceEmpty",
  "updates.channelDifferenceTooLong",
  "updates.difference",
  "updates.differenceEmpty",
  "updates.differenceSlice",
  "updates.differenceTooLong",
  "updates.getChannelDifference",
  "updates.getDifference",
  "updates.getState",
  "updates.state",
] as const

export type UpdatesRpcMethod = (typeof RPC_METHODS)[number];
