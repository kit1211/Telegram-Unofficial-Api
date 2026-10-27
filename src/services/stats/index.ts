import { RPC_METHODS, type StatsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `stats` — 14 RPC symbols from worker bundle. */
export const namespace = "stats" as const;

export function isStatsMethod(value: string): value is StatsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
