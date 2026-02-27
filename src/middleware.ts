import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple middleware that checks for session token cookie
// Full auth validation happens in the API routes/pages themselves
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes - always accessible
  if (
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Check for NextAuth session cookie
  const sessionToken =
    req.cookies.get("__Secure-authjs.session-token")?.value ||
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("next-auth.session-token")?.value ||
    req.cookies.get("__Secure-next-auth.session-token")?.value;

  // API routes that need auth
  if (pathname.startsWith("/api/")) {
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // All other routes require authentication
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|papaya-logo\\.png).*)"],
};
