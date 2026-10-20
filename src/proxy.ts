import { NextResponse, type NextRequest } from "next/server";

// Optimistische Prüfung: ohne Session-Cookie direkt zum Login. Die eigentliche Prüfung passiert serverseitig.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("divdash_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
