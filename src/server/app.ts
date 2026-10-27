import { Elysia } from "elysia";
import { WEBK_APP_CONFIG } from "../config/webk";
import { buildMtprotoWebsocketUrl } from "../mtproto/transport/websocket-url";
import { PRODUCTION_DC_OPTIONS } from "../mtproto/transport/dc-options";
import { MtprotoClient } from "../mtproto/client/mtproto-client";
import { buildWebSyncUrl } from "../http/telegram-me/websync";
import { REVERSE_EVIDENCE } from "../reverse/evidence";
import catalog from "../generated/rpc-catalog.json";
import { jobsRoutes } from "./routes/jobs";
import { accountsRoutes } from "./routes/accounts";
import { healthRoutes } from "./routes/health";
import { ensureTelegramDataLayout } from "../storage/sqlite";

const client = new MtprotoClient(WEBK_APP_CONFIG.baseDcId);

export function buildApp() {
  ensureTelegramDataLayout();

  return new Elysia()
    .get("/", () => ({
      name: "telegram-reverse",
      target: REVERSE_EVIDENCE.target,
      build: WEBK_APP_CONFIG.build,
      baseDcId: WEBK_APP_CONFIG.baseDcId,
      api: "/v1/jobs",
    }))
    .get("/reverse/evidence", () => REVERSE_EVIDENCE)
    .get("/config/webk", () => WEBK_APP_CONFIG)
    .get("/mtproto/dc-options", () => PRODUCTION_DC_OPTIONS)
    .get("/mtproto/wss/:dcId", ({ params }) => ({
      dcId: Number(params.dcId),
      url: buildMtprotoWebsocketUrl({ dcId: Number(params.dcId) }),
    }))
    .get("/http/websync-url", ({ query }) => ({
      telegramMe: buildWebSyncUrl("https://telegram.me", {
        authed: query.authed === "1",
      }),
      tMe: buildWebSyncUrl("https://t.me", {
        authed: query.authed === "1",
      }),
    }))
    .get("/rpc/namespaces", () =>
      Object.keys(catalog.namespaces).map((name) => ({
        name,
        count: catalog.namespaces[name as keyof typeof catalog.namespaces]
          .length,
      })),
    )
    .get("/rpc/:namespace", ({ params }) => {
      const methods =
        catalog.namespaces[
          params.namespace as keyof typeof catalog.namespaces
        ];
      if (!methods) return new Response("unknown namespace", { status: 404 });
      return { namespace: params.namespace, methods };
    })
    .get("/rpc", () => ({
      total: client.listMethods().length,
      namespaces: Object.keys(catalog.namespaces).length,
    }))
    .use(healthRoutes)
    .use(jobsRoutes)
    .use(accountsRoutes);
}
