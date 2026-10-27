import { RPC_METHODS, type ContactsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `contacts` — 41 RPC symbols from worker bundle. */
export const namespace = "contacts" as const;

export function isContactsMethod(value: string): value is ContactsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
