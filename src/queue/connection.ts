import IORedis from "ioredis";

let shared: IORedis | undefined;

export function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

/** BullMQ + job meta (duplicate client recommended for subscribers). */
export function getRedis(): IORedis {
  if (!shared) {
    shared = new IORedis(redisUrl(), {
      maxRetriesPerRequest: null,
    });
  }
  return shared;
}

export function createRedisDuplicate(): IORedis {
  return new IORedis(redisUrl(), {
    maxRetriesPerRequest: null,
  });
}
