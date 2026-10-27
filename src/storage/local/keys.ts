/** localStorage keys referenced in Web K bundles. */
export const LOCAL_STORAGE_KEYS = {
  tgmeSync: "tgme_sync",
  kzVersion: "kz_version",
  memoryWatch: "memory_watch",
  memoryWatchLog: "memory_watch_log",
  memoryWatchEvents: "memory_watch_events",
} as const;

export interface TgMeSyncRecord {
  canRedirect: boolean;
  ts: number;
}
