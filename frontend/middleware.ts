import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Never intercept or redirect API routes (handled by backend and Next.js rewrites)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Verify presence of session cookie (sr_session from backend or sr_auth indicator)
  const sessionToken = request.cookies.get("sr_session")?.value;
  const authCookie = request.cookies.get("sr_auth")?.value;
  const isAuthenticated = Boolean(sessionToken || authCookie);

  const isLoginPage = pathname === "/login";

  // If user is accessing /login
  if (isLoginPage) {
    if (isAuthenticated) {
      // Already authenticated -> redirect to dashboard
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    // Allow unauthenticated access to login
    return NextResponse.next();
  }

  // All other routes are strictly protected (no sign-up, only sign-in)
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/" && pathname !== "/dashboard") {
      loginUrl.searchParams.set("callbackUrl", pathname + search);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user landing on root "/" -> redirect to "/dashboard"
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (/api/*)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (*.png, *.jpg, *.svg, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
