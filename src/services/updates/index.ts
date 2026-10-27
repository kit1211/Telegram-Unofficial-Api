import { RPC_METHODS, type UpdatesRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `updates` — 11 RPC symbols from worker bundle. */
export const namespace = "updates" as const;

export function isUpdatesMethod(value: string): value is UpdatesRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
