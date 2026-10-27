import { RPC_METHODS, type HelpRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `help` — 56 RPC symbols from worker bundle. */
export const namespace = "help" as const;

export function isHelpMethod(value: string): value is HelpRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
