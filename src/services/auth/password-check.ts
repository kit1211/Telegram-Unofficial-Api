import bigInt from "big-integer";
import { Api } from "telegram";
import { computeCheck } from "telegram/Password";

function toBuffer(value: Uint8Array | Buffer | number[] | undefined): Buffer {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(value);
}

/** `account.getPassword` result from @mtproto/core (snake_case fields). */
export interface AccountPasswordPayload {
  _: "account.password";
  current_algo?: {
    _: string;
    salt1?: Uint8Array;
    salt2?: Uint8Array;
    g?: number;
    p?: Uint8Array;
  };
  srp_B?: Uint8Array;
  srp_id?: bigint | number | string;
}

export async function buildInputCheckPasswordSrp(
  accountPassword: AccountPasswordPayload,
  password: string,
): Promise<Record<string, unknown>> {
  const algo = accountPassword.current_algo;
  if (
    !algo ||
    algo._ !==
      "passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256modPow"
  ) {
    throw new Error(
      `Unsupported 2FA KDF algorithm: ${algo?._ ?? "missing current_algo"}`,
    );
  }
  if (!accountPassword.srp_B || accountPassword.srp_id === undefined) {
    throw new Error("account.getPassword did not return SRP parameters");
  }

  const request = new Api.account.Password({
    currentAlgo:
      new Api.PasswordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow({
        salt1: toBuffer(algo.salt1),
        salt2: toBuffer(algo.salt2),
        g: algo.g ?? 3,
        p: toBuffer(algo.p),
      }),
    srp_B: toBuffer(accountPassword.srp_B),
    srpId: bigInt(String(accountPassword.srp_id)),
  } as ConstructorParameters<typeof Api.account.Password>[0]);

  const check = await computeCheck(request, password);
  return {
    _: "inputCheckPasswordSRP",
    srp_id: check.srpId,
    A: check.A,
    M1: check.M1,
  };
}
