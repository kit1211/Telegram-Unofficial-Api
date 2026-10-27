import { RPC_METHODS, type StickersRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `stickers` — 12 RPC symbols from worker bundle. */
export const namespace = "stickers" as const;

export function isStickersMethod(value: string): value is StickersRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
