/**
 * Query / hash params parsed in `index-BUtITCqw.js` on load (`Cn` / `wn`).
 */
export interface TgWebAuthHashParams {
  tgWebAuthToken?: string;
  tgWebAuthDcId?: string;
  tgWebAuthUserId?: string;
  /** `1` enables test DC set */
  tgWebAuthTest?: string;
  tgaddr?: string;
}

export function parseTelegramWebHash(
  hash: string,
): TgWebAuthHashParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const query = raw.includes("?") ? raw.split("?").pop() ?? "" : raw;
  const params: Record<string, string> = {};
  if (!query) return params;

  for (const part of query.split("&")) {
    const [key, value = ""] = part.split("=");
    if (key) params[key] = decodeURIComponent(value);
  }
  return params as TgWebAuthHashParams;
}

/** Normalized import payload pushed to `authStateSignImport`. */
export interface AuthStateSignImportData {
  token: string;
  dcId: number;
  userId: number;
  isTest: boolean;
  tgAddr?: string;
}

export function buildSignImportFromHash(
  params: TgWebAuthHashParams,
  _isTestMode: boolean,
): AuthStateSignImportData | undefined {
  if (!params.tgWebAuthToken) return undefined;
  return {
    token: params.tgWebAuthToken,
    dcId: Number(params.tgWebAuthDcId),
    userId: Number(params.tgWebAuthUserId),
    isTest: params.tgWebAuthTest !== undefined && !!Number(params.tgWebAuthTest),
    tgAddr: params.tgaddr,
  };
}
