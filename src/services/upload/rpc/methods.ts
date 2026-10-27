/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "upload.cdnFile",
  "upload.cdnFileReuploadNeeded",
  "upload.file",
  "upload.fileCdnRedirect",
  "upload.getCdnFile",
  "upload.getCdnFileHashes",
  "upload.getFile",
  "upload.getFileHashes",
  "upload.getWebFile",
  "upload.reuploadCdnFile",
  "upload.saveBigFilePart",
  "upload.saveFilePart",
  "upload.webFile",
] as const

export type UploadRpcMethod = (typeof RPC_METHODS)[number];
