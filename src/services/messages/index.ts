import { RPC_METHODS, type MessagesRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `messages` — 355 RPC symbols from worker bundle. */
export const namespace = "messages" as const;

export function isMessagesMethod(value: string): value is MessagesRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
