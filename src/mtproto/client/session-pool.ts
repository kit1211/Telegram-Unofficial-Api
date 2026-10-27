import { createMtprotoSession } from "./create-session";
import type { MtprotoCoreSession } from "./mtproto-core-session";

const sessions = new Map<string, MtprotoCoreSession>();

/**
 * หนึ่งบัญชีต่อหนึ่ง TCP session ใน process
 * สอง client พร้อมกันบน auth key เดียวกันทำให้ RPC เพี้ยน
 */
export function getAccountSession(accountId: string): MtprotoCoreSession {
  let session = sessions.get(accountId);
  if (!session) {
    session = createMtprotoSession({ account: accountId });
    sessions.set(accountId, session);
  }
  return session;
}
