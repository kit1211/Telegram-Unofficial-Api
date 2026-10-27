/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "aicompose.createTone",
  "aicompose.deleteTone",
  "aicompose.getTone",
  "aicompose.getToneExample",
  "aicompose.getTones",
  "aicompose.saveTone",
  "aicompose.tones",
  "aicompose.tonesNotModified",
  "aicompose.updateTone",
] as const

export type AicomposeRpcMethod = (typeof RPC_METHODS)[number];
