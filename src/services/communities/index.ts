import { RPC_METHODS, type CommunitiesRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `communities` — 11 RPC symbols from worker bundle. */
export const namespace = "communities" as const;

export function isCommunitiesMethod(value: string): value is CommunitiesRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
