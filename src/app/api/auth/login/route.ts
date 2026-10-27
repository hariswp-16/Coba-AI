import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, createToken, authEnabled, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { jsonOk, jsonError, parseBody } from "@/lib/api";

const schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  if (!authEnabled()) return jsonOk({ authenticated: true, authEnabled: false });
  const parsed = await parseBody(req, schema);
  if ("error" in parsed) return parsed.error;
  if (!checkPassword(parsed.data.password)) {
    return jsonError("Kata sandi salah", 401);
  }
  const res = NextResponse.json({ ok: true, data: { authenticated: true } });
  res.cookies.set(SESSION_COOKIE, createToken(), sessionCookieOptions());
  return res;
}

export async function GET() {
  return jsonOk({ authEnabled: authEnabled() });
}
