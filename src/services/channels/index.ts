import { RPC_METHODS, type ChannelsRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `channels` — 66 RPC symbols from worker bundle. */
export const namespace = "channels" as const;

export function isChannelsMethod(value: string): value is ChannelsRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
