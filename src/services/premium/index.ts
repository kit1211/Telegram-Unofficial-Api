import { RPC_METHODS, type PremiumRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `premium` — 10 RPC symbols from worker bundle. */
export const namespace = "premium" as const;

export function isPremiumMethod(value: string): value is PremiumRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
