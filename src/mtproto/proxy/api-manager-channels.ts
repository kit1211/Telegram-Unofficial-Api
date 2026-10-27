/**
 * Main-thread ↔ MTProto worker message names from `apiManagerProxy-BQdxJWr5.js`.
 * These are not TL RPC methods; they are internal bridge commands.
 */
export const API_MANAGER_PROXY_CHANNELS = [
  "clearInterval",
  "createProxyWorkerURLs",
  "disableCacheStoragesByNames",
  "enableCacheStoragesByNames",
  "environment",
  "hello",
  "manager",
  "mirrorAll",
  "notificationsClear",
  "pushPing",
  "resetOpenCacheStoragesByNames",
  "serviceWorkerOnline",
  "serviceWorkerPort",
  "setInterval",
  "setLogBufferEnabled",
  "shownNotification",
  "singleManager",
  "state",
  "tabAccount",
  "tabState",
  "terminate",
  "threadedPort",
  "toggleStorages",
  "toggleUsingPasscode",
] as const;

export type ApiManagerProxyChannel =
  (typeof API_MANAGER_PROXY_CHANNELS)[number];
