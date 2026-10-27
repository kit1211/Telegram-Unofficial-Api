/** DC endpoints from `index.worker-Ccu9tVP2.js` (production / non-test). */
export interface DcOption {
  id: number;
  host: string;
  port: number;
}

export const PRODUCTION_DC_OPTIONS: readonly DcOption[] = [
  { id: 1, host: "149.154.175.50", port: 80 },
  { id: 2, host: "149.154.167.50", port: 80 },
  { id: 3, host: "149.154.175.100", port: 80 },
  { id: 4, host: "149.154.167.91", port: 80 },
  { id: 5, host: "149.154.171.5", port: 80 },
] as const;

export const TEST_DC_OPTIONS: readonly DcOption[] = [
  { id: 1, host: "149.154.175.10", port: 80 },
  { id: 2, host: "149.154.167.40", port: 80 },
  { id: 3, host: "149.154.175.117", port: 80 },
] as const;

/** WebSocket path prefixes used for DC routing (worker: sslSubdomains). */
export const WEBSOCKET_SSL_SUBDOMAINS = [
  "pluto",
  "venus",
  "aurora",
  "vesta",
  "flora",
] as const;
