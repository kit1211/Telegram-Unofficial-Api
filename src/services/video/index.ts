import { RPC_METHODS, type VideoRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `video` — 1 RPC symbols from worker bundle. */
export const namespace = "video" as const;

export function isVideoMethod(value: string): value is VideoRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
