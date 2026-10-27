/** Auto-extracted from Telegram Web K worker (MTProto TL). */
export const RPC_METHODS = [
  "premium.applyBoost",
  "premium.boostsList",
  "premium.boostsStatus",
  "premium.getBoostsList",
  "premium.getBoostsStatus",
  "premium.getMyBoosts",
  "premium.getUserBoosts",
  "premium.myBoosts",
  "premium.promo_screen_accept",
  "premium.promo_screen_show",
] as const

export type PremiumRpcMethod = (typeof RPC_METHODS)[number];
