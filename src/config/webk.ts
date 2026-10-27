/**
 * Static app fingerprint from `app-BPRTGJ9c.js` (Burp: GET /k/app-BPRTGJ9c.js).
 * Production host uses alternate api_id / push key when `isMainDomain`.
 */
export const WEBK_DOMAINS = ["web.telegram.org", "webk.telegram.org"] as const;

export type WebkDomain = (typeof WEBK_DOMAINS)[number];

export interface WebkAppConfig {
  id: number;
  hash: string;
  pushServerKey: string;
  version: string;
  versionFull: string;
  build: number;
  langPackVersion: number;
  langPack: "webk";
  langPackCode: string;
  domains: readonly WebkDomain[];
  baseDcId: number;
  isMainDomain: boolean;
  suffix: "K";
  threads: number;
  lottieWorkers: number;
  cryptoWorkers: number;
  interclientBroadcastChannel: "tgweb";
}

/** Values for web.telegram.org / webk.telegram.org (isMainDomain = true). */
export const WEBK_APP_CONFIG: WebkAppConfig = {
  id: 2496,
  hash: "8da85b0d5bfe62527e5b244c209159c3",
  pushServerKey:
    "BHEbKOXt-GD8MCTTYiAYT3I5R4MB0epIE7Tbbymj1uR0xJRE_7m27eXTVAC_P19TeZnO9413lRz-0oZ87JRPKPM",
  version: "2.2",
  versionFull: "2.2 (681)",
  build: 681,
  langPackVersion: 361204,
  langPack: "webk",
  langPackCode: "en",
  domains: WEBK_DOMAINS,
  baseDcId: 2,
  isMainDomain: true,
  suffix: "K",
  threads: 4,
  lottieWorkers: 4,
  cryptoWorkers: 4,
  interclientBroadcastChannel: "tgweb",
};
