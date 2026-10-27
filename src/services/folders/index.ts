import { RPC_METHODS, type FoldersRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `folders` — 1 RPC symbols from worker bundle. */
export const namespace = "folders" as const;

export function isFoldersMethod(value: string): value is FoldersRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
