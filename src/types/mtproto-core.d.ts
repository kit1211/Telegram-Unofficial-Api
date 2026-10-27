declare module "@mtproto/core/envs/node" {
  export default class MTProto {
    constructor(opts: {
      api_id: number;
      api_hash: string;
      storageOptions?: { instance?: unknown; path?: string };
    });
    call<T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      options?: { syncAuth?: boolean; dcId?: number },
    ): Promise<T>;
    setDefaultDc(dcId: number): Promise<void>;
    syncAuth(dcId: number): Promise<unknown[]>;
  }
}
