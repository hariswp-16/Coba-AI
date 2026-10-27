import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "studio_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function authEnabled(): boolean {
  return Boolean(env.appPassword);
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function createToken(now = Date.now()): string {
  const payload = now.toString(36);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  const issuedAt = parseInt(payload, 36);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < MAX_AGE_SECONDS * 1000;
}

export function checkPassword(candidate: string): boolean {
  if (!authEnabled()) return true;
  const expected = Buffer.from(env.appPassword);
  const given = Buffer.from(candidate ?? "");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!authEnabled()) return true;
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireApiAuth(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ ok: false, error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
}

/** Guard alias used by API routes. */
export async function guard(): Promise<Response | null> {
  return requireApiAuth();
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}
