import { RPC_METHODS, type LangpackRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `langpack` — 5 RPC symbols from worker bundle. */
export const namespace = "langpack" as const;

export function isLangpackMethod(value: string): value is LangpackRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
