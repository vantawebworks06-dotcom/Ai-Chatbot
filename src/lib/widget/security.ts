import { createHash, randomBytes } from "node:crypto";

// Pure helpers for widget authentication. Unit tested in
// tests/unit/widget-security.test.ts.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** A random secret held only by the visitor's browser. */
export function generateVisitorToken(): string {
  return `vt_${randomBytes(32).toString("base64url")}`;
}

/** Only the hash is stored, so a database leak doesn't expose live tokens. */
export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedToken(token: unknown): token is string {
  return typeof token === "string" && /^vt_[A-Za-z0-9_-]{43}$/.test(token);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** Normalizes "https://www.Shop.com/path" or "shop.com" to "shop.com". */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "").split("/")[0].split(":")[0];
  return value.replace(/^www\./, "");
}

/**
 * Checks the browser Origin against the business's allowed domains. An empty
 * list allows every site (useful while testing). Subdomains are allowed.
 */
export function isOriginAllowed(origin: string | null, allowedDomains: string[]): boolean {
  if (!allowedDomains.length) return true;
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return allowedDomains
    .map(normalizeDomain)
    .filter(Boolean)
    .some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function sanitizeMessage(input: unknown, maxLength = 2000): string | null {
  if (typeof input !== "string") return null;
  // Drop control characters except newlines and tabs.
  const clean = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!clean) return null;
  return clean.slice(0, maxLength);
}
