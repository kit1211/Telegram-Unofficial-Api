/**
 * IndexedDB / Cache Storage names from Telegram Web K DevTools (Application tab).
 */
export const INDEXED_DB_DATABASES = [
  "tt-data",
  "tweb-common",
  "tweb-account-1",
  "tweb-account-2",
  "tweb-account-3",
  "tweb-account-4",
] as const;

export type IndexedDbDatabaseName = (typeof INDEXED_DB_DATABASES)[number];

export const CACHE_STORAGE_BUCKETS = [
  "tt-media",
  "tt-media-avatars",
  "tt-media-progressive",
  "tt-lang-packs-v51",
  "tt-assets",
  "cachedFiles",
  "cachedStreamChunks",
  "cachedHlsQualityFiles",
  "cachedHlsStreamChunks",
  "cachedBackgrounds",
  "cachedAssets",
] as const;

export type CacheStorageBucket = (typeof CACHE_STORAGE_BUCKETS)[number];

export function twebAccountDatabase(accountNumber: number): string {
  return `tweb-account-${accountNumber}`;
}
