import { WEBK_APP_CONFIG } from "../../config/webk";
import { formatCookieHeader } from "../../core/cookies/telegram-org";

export interface WebSyncParams {
  authed: boolean;
  version?: string;
}

export interface WebSyncResult {
  ok: boolean;
  /** Raw body (Burp sample: `true`). */
  body: string;
  setCookie?: string[];
}

const WEBSYNC_HOSTS = ["https://telegram.me", "https://t.me"] as const;

/**
 * Mirrors `TelegramMeWebManager.setAuthorized` — loads `//telegram.me/_websync_`
 * and `//t.me/_websync_` with authed flag + client version.
 */
export function buildWebSyncUrl(
  host: (typeof WEBSYNC_HOSTS)[number],
  params: WebSyncParams,
): string {
  const version =
    params.version ??
    `${WEBK_APP_CONFIG.versionFull.split(" ")[0]} ${WEBK_APP_CONFIG.suffix}`;
  const q = new URLSearchParams({
    authed: params.authed ? "1" : "0",
    version,
  });
  return `${host}/_websync_?${q.toString()}`;
}

export async function fetchWebSync(
  params: WebSyncParams,
  cookies: { stel_acid?: string } = {},
): Promise<WebSyncResult[]> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    "User-Agent": "telegram-reverse/1.0",
  };
  if (cookies.stel_acid) {
    headers.Cookie = formatCookieHeader({ stel_acid: cookies.stel_acid });
  }

  return Promise.all(
    WEBSYNC_HOSTS.map(async (host) => {
      const url = buildWebSyncUrl(host, params);
      const res = await fetch(url, { headers, redirect: "manual" });
      const body = await res.text();
      const setCookie = res.headers.getSetCookie?.() ?? [];
      return {
        ok: res.ok,
        body,
        setCookie,
      };
    }),
  );
}
