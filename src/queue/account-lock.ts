import { getRedis } from "./connection";

/** ครอบ FLOOD_WAIT ที่ยาว — process ตายแล้วล็อกหลุดเองเมื่อครบเวลา */
const LOCK_TTL_MS = 300_000;

function lockHolderAlive(token: string | null): boolean {
  if (!token) return false;
  const pid = Number(token.split("-")[0]);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function withAccountLock<T>(
  accountId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  const key = `lock:mtproto:${accountId}`;
  const token = `${process.pid}-${Date.now()}`;
  for (;;) {
    const ok = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    if (ok === "OK") break;
    const holder = await redis.get(key);
    if (!lockHolderAlive(holder)) {
      await redis.del(key);
      continue;
    }
    await Bun.sleep(250);
  }
  try {
    return await fn();
  } finally {
    const cur = await redis.get(key);
    if (cur === token) await redis.del(key);
  }
}
