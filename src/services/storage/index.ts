import { RPC_METHODS, type StorageRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `storage` — 10 RPC symbols from worker bundle. */
export const namespace = "storage" as const;

export function isStorageMethod(value: string): value is StorageRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
