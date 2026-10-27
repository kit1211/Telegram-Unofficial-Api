/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "ephemeral.deleteAllWelcomeMessages",
  "ephemeral.deleteMessage",
  "ephemeral.deleteWelcomeMessage",
  "ephemeral.editMessage",
  "ephemeral.getCallbackAnswer",
  "ephemeral.getWelcomeMessages",
  "ephemeral.reportMessage",
  "ephemeral.sendMessage",
  "ephemeral.welcomeMessages",
  "ephemeral.welcomeMessagesNotModified",
] as const

export type EphemeralRpcMethod = (typeof RPC_METHODS)[number];
