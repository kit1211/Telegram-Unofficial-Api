import type { MtprotoCoreSession } from "./client/mtproto-core-session";

export function parseMigrateDcId(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const message = (error as { error_message?: string }).error_message;
  if (!message) return undefined;
  const match = message.match(/^(?:PHONE|FILE|NETWORK|USER)_MIGRATE_(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

export async function callWithDcMigrate<T>(
  session: MtprotoCoreSession,
  method: string,
  params: Record<string, unknown> = {},
  options: { syncAuth?: boolean } = {},
): Promise<T> {
  try {
    return await session.call<T>(method, params, options);
  } catch (error) {
    const dcId = parseMigrateDcId(error);
    if (dcId === undefined) throw error;
    await session.setDefaultDc(dcId);
    return session.call<T>(method, params, { ...options, dcId });
  }
}
