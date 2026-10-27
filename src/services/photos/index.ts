import { RPC_METHODS, type PhotosRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `photos` — 8 RPC symbols from worker bundle. */
export const namespace = "photos" as const;

export function isPhotosMethod(value: string): value is PhotosRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
