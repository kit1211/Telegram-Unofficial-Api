import { RPC_METHODS, type BotsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `bots` — 44 RPC symbols from worker bundle. */
export const namespace = "bots" as const;

export function isBotsMethod(value: string): value is BotsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
