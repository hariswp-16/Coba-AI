import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "studio_session";

/**
 * Edge middleware only checks that a session cookie is present. Signature
 * verification happens server-side (node runtime) in lib/auth.ts, because the
 * HMAC secret must never be evaluated at the edge.
 */
export function middleware(req: NextRequest) {
  // Auth is opt-in via APP_PASSWORD; without it the app is fully open.
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/preview") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png";

  if (isPublic) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
