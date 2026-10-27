/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "stickers.addStickerToSet",
  "stickers.changeSticker",
  "stickers.changeStickerPosition",
  "stickers.checkShortName",
  "stickers.createStickerSet",
  "stickers.deleteStickerSet",
  "stickers.removeStickerFromSet",
  "stickers.renameStickerSet",
  "stickers.replaceSticker",
  "stickers.setStickerSetThumb",
  "stickers.suggestShortName",
  "stickers.suggestedShortName",
] as const

export type StickersRpcMethod = (typeof RPC_METHODS)[number];
