import { RPC_METHODS, type PaymentsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `payments` — 102 RPC symbols from worker bundle. */
export const namespace = "payments" as const;

export function isPaymentsMethod(value: string): value is PaymentsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
