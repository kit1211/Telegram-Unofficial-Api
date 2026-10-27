export interface MtprotoInvoker {
  invoke<T = unknown>(
    method: "users.getFullUser",
    params: Record<string, unknown>,
  ): Promise<T>;
}

/** TL: `inputUserSelf` — current authorized user. */
export const INPUT_USER_SELF = { _: "inputUserSelf" } as const;

export interface InputUserPeer {
  _: "inputUser";
  user_id: number;
  access_hash: bigint | string;
}

export type ProfileUserId = typeof INPUT_USER_SELF | InputUserPeer;

/** Minimal shape of `users.UserFull` (subset used by clients). */
export interface UserFullResult {
  full_user?: {
    id?: number;
    about?: string;
    common_chats_count?: number;
  };
  users?: Array<{
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    phone?: string;
  }>;
  [key: string]: unknown;
}

export async function getFullUser(
  client: MtprotoInvoker,
  id: ProfileUserId = INPUT_USER_SELF,
): Promise<UserFullResult> {
  return client.invoke<UserFullResult>("users.getFullUser", { id });
}
