import { RPC_METHODS, type UploadRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `upload` — 13 RPC symbols from worker bundle. */
export const namespace = "upload" as const;

export function isUploadMethod(value: string): value is UploadRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
