import { RPC_METHODS, type SmsjobsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `smsjobs` — 9 RPC symbols from worker bundle. */
export const namespace = "smsjobs" as const;

export function isSmsjobsMethod(value: string): value is SmsjobsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
