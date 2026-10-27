import { RPC_METHODS, type SettingsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `settings` — 1 RPC symbols from worker bundle. */
export const namespace = "settings" as const;

export function isSettingsMethod(value: string): value is SettingsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
