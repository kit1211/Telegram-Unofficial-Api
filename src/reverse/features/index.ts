import map from "./webk-feature-map.json";

export type WebkFeatureKey =
  | "reactions"
  | "scheduled"
  | "chatlists"
  | "stories"
  | "stickers"
  | "communities"
  | "e2e";

export interface WebkFeatureEntry {
  webk_managers: string[];
  architecture: { worker: string; main_thread: string };
  ui_chunks: string[];
  catalog_rpc: string[];
  worker_tl_literals: string[];
  worker_invokeApi: string[];
  notes: string[];
}

export const WEBK_FEATURE_MAP = map as Record<WebkFeatureKey, WebkFeatureEntry>;

export const WEBK_FEATURE_KEYS = Object.keys(WEBK_FEATURE_MAP) as WebkFeatureKey[];

/** RPC names WebK worker calls directly (invokeApi template literals). */
export function webkDirectInvokeMethods(feature: WebkFeatureKey): string[] {
  return WEBK_FEATURE_MAP[feature].worker_invokeApi;
}

/** Full catalog + TL literals union for planning client wrappers. */
export function featureRpcSurface(feature: WebkFeatureKey): string[] {
  const e = WEBK_FEATURE_MAP[feature];
  return [...new Set([...e.catalog_rpc, ...e.worker_tl_literals])].sort();
}
