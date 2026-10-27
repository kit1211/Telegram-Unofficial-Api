import { RPC_METHODS, type AuthRpcMethod } from "./rpc/methods";

export * from "./auth-states";
export * from "./rpc/methods";

/** Service namespace `auth` — 59 RPC symbols from worker bundle. */
export const namespace = "auth" as const;

export function isAuthMethod(value: string): value is AuthRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
