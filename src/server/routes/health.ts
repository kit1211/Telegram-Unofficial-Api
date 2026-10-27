import { Elysia } from "elysia";
import { getRedis } from "../../queue/connection";

export const healthRoutes = new Elysia({ prefix: "/v1" }).get(
  "/health",
  async ({ set }) => {
    try {
      const pong = await getRedis().ping();
      return { ok: pong === "PONG", redis: pong };
    } catch (error) {
      set.status = 503;
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);
