import { WEBK_APP_CONFIG } from "../../config/webk";
import { WEBSOCKET_SSL_SUBDOMAINS } from "./dc-options";

export type MtprotoTransportKind = "client" | "upload" | "download";

export interface BuildWebsocketUrlParams {
  dcId: number;
  transport?: MtprotoTransportKind;
  /** Worker suffix letter, e.g. `K` for WebK. */
  suffix?: string;
  /** Path segment after host (worker-specific). */
  pathToken?: string;
  /** Subdomain index; defaults to dcId mapping in client. */
  subdomainIndex?: number;
}

/**
 * Template recovered from worker:
 * `wss://${suffix.toLowerCase()}ws${subdomain}${dcId}.web.telegram.org/${path}`
 */
export function buildMtprotoWebsocketUrl({
  dcId,
  transport = "client",
  suffix = WEBK_APP_CONFIG.suffix,
  pathToken = "",
  subdomainIndex,
}: BuildWebsocketUrlParams): string {
  const idx =
    subdomainIndex ??
    Math.abs(dcId) % WEBSOCKET_SSL_SUBDOMAINS.length;
  const sub = WEBSOCKET_SSL_SUBDOMAINS[idx];
  const prefix = `${suffix.toLowerCase()}ws${sub}${dcId}`;
  const host = `${prefix}.web.telegram.org`;
  const path = pathToken ? `/${pathToken}` : "/";
  void transport; // upload/download alter port selection in worker, not host template
  return `wss://${host}${path}`;
}
