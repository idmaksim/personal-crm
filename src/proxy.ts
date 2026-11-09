import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Fast guest guard: redirects to /login on cookie absence alone, no database
// call. This is not the real access check — every page and server action
// calls requireUser() (src/lib/session.ts), which validates the session
// against the database. A hidden button is not protection; this proxy is
// just a quicker redirect for a guest who reaches an internal page.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Public: /login and its responses, the Better Auth route, /health (hit by
  // the deploy smoke test), and Next's own static/image assets.
  matcher: [
    "/((?!login|api/auth|health|_next/static|_next/image|favicon.ico).*)",
  ],
};
