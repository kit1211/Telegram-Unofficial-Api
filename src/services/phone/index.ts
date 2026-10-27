import { RPC_METHODS, type PhoneRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `phone` — 51 RPC symbols from worker bundle. */
export const namespace = "phone" as const;

export function isPhoneMethod(value: string): value is PhoneRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
