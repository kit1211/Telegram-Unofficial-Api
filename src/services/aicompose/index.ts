import { RPC_METHODS, type AicomposeRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `aicompose` — 9 RPC symbols from worker bundle. */
export const namespace = "aicompose" as const;

export function isAicomposeMethod(value: string): value is AicomposeRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
