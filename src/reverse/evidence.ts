/**
 * Traceability for artifacts recovered via Burp MCP + REA MCP (2026-10-27).
 */
export const REVERSE_EVIDENCE = {
  target: "https://web.telegram.org/k/",
  bundles: {
    appConfig: "app-BPRTGJ9c.js",
    apiManagerProxy: "apiManagerProxy-BQdxJWr5.js",
    mtprotoWorker: "index.worker-Ccu9tVP2.js",
    authUi: "mountAuthFlow-CwBepKVw.js",
    meSync: "telegramMeWebManager-CrwN35_I.js",
  },
  burp: {
    /** On this host, Docker binds :8080; Burp listener is typically 127.0.0.1:39607 (MITM). */
    proxyListener: "127.0.0.1:39607",
    websync: {
      request:
        "GET /_websync_?authed=1&version=2.2%20K HTTP/1.1 (Host: telegram.me)",
      responseBodySample: "true",
      setsCookie: "stel_web_auth",
    },
  },
  rea: {
    analyzeJavascriptApplication: {
      inputPath: "/tmp/tg-web-k",
      evidenceId: "ev_0ad83043d79ed69b6cf78aba0db08fffe84d45c122ae4f046ee9709920b2aa4b",
      rpcMethodsExtracted: 1141,
      namespaces: 28,
    },
    webkWorkerFeatures: {
      inputPath: "reverse/webk",
      evidenceId: "ev_6669d6afc0d0bcd6303cd7ccf9cd55e504d18a55a3721ff9f0b51cebad27342d",
      featureMap: "src/reverse/features/webk-feature-map.json",
    },
  },
} as const;
