/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "storage.fileGif",
  "storage.fileJpeg",
  "storage.fileMov",
  "storage.fileMp3",
  "storage.fileMp4",
  "storage.filePartial",
  "storage.filePdf",
  "storage.filePng",
  "storage.fileUnknown",
  "storage.fileWebp",
] as const

export type StorageRpcMethod = (typeof RPC_METHODS)[number];
