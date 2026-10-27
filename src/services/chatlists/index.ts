import { RPC_METHODS, type ChatlistsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `chatlists` — 16 RPC symbols from worker bundle. */
export const namespace = "chatlists" as const;

export function isChatlistsMethod(value: string): value is ChatlistsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
