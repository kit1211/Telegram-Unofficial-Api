/** Cookie observed on `.telegram.org` for Web sessions (DevTools export). */
export interface StelAcidCookie {
  name: "stel_acid";
  domain: ".telegram.org";
  httpOnly: true;
  secure: true;
  sameSite: "no_restriction";
  path: "/";
}

/** Set by `GET //telegram.me/_websync_` (Burp-verified). */
export interface StelWebAuthCookie {
  name: "stel_web_auth";
  httpOnly: true;
  secure: true;
  sameSite: "None";
  /** URL-encoded redirect target, e.g. https://web.telegram.org/k/ */
  value: string;
}

export function formatCookieHeader(
  cookies: Record<string, string>,
): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
