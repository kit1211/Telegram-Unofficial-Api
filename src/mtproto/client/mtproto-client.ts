import catalog from "../../generated/rpc-catalog.json";
import type { AuthStateName } from "../../services/auth/auth-states";

export type RpcNamespace = keyof typeof catalog.namespaces;

export type RpcMethod = (typeof catalog.namespaces)[RpcNamespace][number];

export interface MtprotoInvokeOptions {
  dcId?: number;
  /** Skip layer serialization (debug only). */
  dryRun?: boolean;
}

/**
 * Thin typed wrapper — real MTProto lives in the Web Worker (`index.worker-*.js`).
 * Implement transport + crypto before calling production APIs.
 */
export class MtprotoClient {
  constructor(private readonly dcId: number) {}

  get authState(): AuthStateName | undefined {
    return undefined;
  }

  async invoke<T = unknown>(
    method: RpcMethod,
    _params: Record<string, unknown> = {},
    _options: MtprotoInvokeOptions = {},
  ): Promise<T> {
    throw new Error(
      `MtprotoClient.invoke(${method}) is not wired — connect worker transport first (dc ${this.dcId}).`,
    );
  }

  listMethods(namespace?: RpcNamespace): readonly string[] {
    if (namespace) return catalog.namespaces[namespace];
    return Object.values(catalog.namespaces).flat();
  }
}
