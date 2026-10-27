/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "langpack.getDifference",
  "langpack.getLangPack",
  "langpack.getLanguage",
  "langpack.getLanguages",
  "langpack.getStrings",
] as const

export type LangpackRpcMethod = (typeof RPC_METHODS)[number];
