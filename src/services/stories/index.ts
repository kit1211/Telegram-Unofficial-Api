import { RPC_METHODS, type StoriesRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `stories` — 44 RPC symbols from worker bundle. */
export const namespace = "stories" as const;

export function isStoriesMethod(value: string): value is StoriesRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
