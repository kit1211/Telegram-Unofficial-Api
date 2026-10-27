/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "fragment.collectibleInfo",
  "fragment.getCollectibleInfo",
] as const

export type FragmentRpcMethod = (typeof RPC_METHODS)[number];
