import { RPC_METHODS, type FragmentRpcMethod } from "./rpc/methods";

export * from "./rpc/methods";

/** Service namespace `fragment` — 2 RPC symbols from worker bundle. */
export const namespace = "fragment" as const;

export function isFragmentMethod(value: string): value is FragmentRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
