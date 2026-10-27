/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "chatlists.chatlistInvite",
  "chatlists.chatlistInviteAlready",
  "chatlists.chatlistUpdates",
  "chatlists.checkChatlistInvite",
  "chatlists.deleteExportedInvite",
  "chatlists.editExportedInvite",
  "chatlists.exportChatlistInvite",
  "chatlists.exportedChatlistInvite",
  "chatlists.exportedInvites",
  "chatlists.getChatlistUpdates",
  "chatlists.getExportedInvites",
  "chatlists.getLeaveChatlistSuggestions",
  "chatlists.hideChatlistUpdates",
  "chatlists.joinChatlistInvite",
  "chatlists.joinChatlistUpdates",
  "chatlists.leaveChatlist",
] as const

export type ChatlistsRpcMethod = (typeof RPC_METHODS)[number];
