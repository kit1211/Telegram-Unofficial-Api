import { RPC_METHODS, type AccountRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `account` — 168 RPC symbols from worker bundle. */
export const namespace = "account" as const;

export function isAccountMethod(value: string): value is AccountRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
