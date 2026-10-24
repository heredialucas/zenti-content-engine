import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "zenti_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function authIsConfigured(): boolean {
  return Boolean((process.env.APP_PASSWORD?.length ?? 0) >= 12 && (process.env.SESSION_SECRET?.length ?? 0) >= 32);
}

function signature(expiresAt: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Private access is not configured.");
  return createHmac("sha256", secret).update(`zenti:${expiresAt}`).digest("hex");
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected.length < 12) return false;
  const suppliedHash = createHmac("sha256", "zenti-password-check").update(password).digest();
  const expectedHash = createHmac("sha256", "zenti-password-check").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

export function createSessionToken(): { token: string; expires: Date } {
  const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
  const expiresAt = String(Math.floor(expires.getTime() / 1000));
  return { token: `${expiresAt}.${signature(expiresAt)}`, expires };
}

export function isValidSessionToken(token?: string): boolean {
  if (!token) return false;
  const [expiresAt, suppliedSignature, extra] = token.split(".");
  if (!expiresAt || !suppliedSignature || extra || !/^\d{10}$/.test(expiresAt)) return false;
  if (Number(expiresAt) * 1000 < Date.now()) return false;
  try {
    const expected = Buffer.from(signature(expiresAt), "hex");
    const supplied = Buffer.from(suppliedSignature, "hex");
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  } catch {
    return false;
  }
}

export async function hasSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isValidSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
