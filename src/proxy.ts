import { NextResponse, type NextRequest } from "next/server";

// Content-Security-Policy mit Nonce je Anfrage: nur eigene Skripte von Next.js laufen, eingeschleuste nicht.
// Inline-Styles bleiben erlaubt (Diagramme und React setzen style-Attribute, die keinen Nonce tragen können).
function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  // Lokal über http://localhost (COOKIE_SECURE=false) nicht auf https umleiten
  const https = !dev && process.env.COOKIE_SECURE !== "false";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const open = pathname === "/login" || pathname === "/robots.txt" || pathname.startsWith("/api/cron");
  // Optimistische Prüfung: ohne Session-Cookie direkt zum Login. Die eigentliche Prüfung passiert serverseitig.
  if (!open && !request.cookies.has("divdash_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", policy);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
