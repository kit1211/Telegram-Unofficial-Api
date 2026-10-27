/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "photos.deletePhotos",
  "photos.getUserPhotos",
  "photos.photo",
  "photos.photos",
  "photos.photosSlice",
  "photos.updateProfilePhoto",
  "photos.uploadContactProfilePhoto",
  "photos.uploadProfilePhoto",
] as const

export type PhotosRpcMethod = (typeof RPC_METHODS)[number];
