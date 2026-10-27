import { RPC_METHODS, type UsersRpcMethod } from "./rpc/methods";

export * from "./profile";
export * from "./rpc/methods";

/** Service namespace `users` — 12 RPC symbols from worker bundle. */
export const namespace = "users" as const;

export function isUsersMethod(value: string): value is UsersRpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
