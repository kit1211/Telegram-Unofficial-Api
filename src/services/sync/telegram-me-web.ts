import { WEBK_APP_CONFIG } from "../../config/webk";
import { LOCAL_STORAGE_KEYS, type TgMeSyncRecord } from "../../storage/local/keys";

/** Logic from `telegramMeWebManager-CrwN35_I.js`. */
export class TelegramMeWebManager {
  readonly disabled: boolean;

  constructor(
    isTest: boolean,
    hostname: string = globalThis.location?.hostname ?? "web.telegram.org",
  ) {
    this.disabled =
      isTest || !WEBK_APP_CONFIG.domains.includes(hostname as never);
  }

  async setAuthorized(
    authed: boolean,
    storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  ): Promise<void> {
    if (this.disabled) return;

    const now = Math.floor(Date.now() / 1000);
    const cached = storage.getItem(LOCAL_STORAGE_KEYS.tgmeSync);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as TgMeSyncRecord;
        if (parsed.canRedirect === authed && parsed.ts + 86_400 > now) {
          return;
        }
      } catch {
        /* ignore corrupt cache */
      }
    }

    storage.setItem(
      LOCAL_STORAGE_KEYS.tgmeSync,
      JSON.stringify({ canRedirect: authed, ts: now } satisfies TgMeSyncRecord),
    );

    const version = encodeURIComponent(
      `${WEBK_APP_CONFIG.version} ${WEBK_APP_CONFIG.suffix}`,
    );
    const path = `_websync_?authed=${authed ? "1" : "0"}&version=${version}`;
    await Promise.all(
      [`//telegram.me/${path}`, `//t.me/${path}`].map((src) =>
        injectScript(src),
      ),
    );
  }
}

function injectScript(src: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = el.onerror = () => {
      el.remove();
      resolve();
    };
    document.body.appendChild(el);
  });
}
