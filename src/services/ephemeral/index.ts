import { RPC_METHODS, type EphemeralRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `ephemeral` — 10 RPC symbols from worker bundle. */
export const namespace = "ephemeral" as const;

export function isEphemeralMethod(value: string): value is EphemeralRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
