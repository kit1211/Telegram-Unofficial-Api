/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "users.getFullUser",
  "users.getRequirementsToContact",
  "users.getSavedMusic",
  "users.getSavedMusicByID",
  "users.getUsers",
  "users.savedMusic",
  "users.savedMusicNotModified",
  "users.setSecureValueErrors",
  "users.suggestBirthday",
  "users.userFull",
  "users.users",
  "users.usersSlice",
] as const

export type UsersRpcMethod = (typeof RPC_METHODS)[number];
