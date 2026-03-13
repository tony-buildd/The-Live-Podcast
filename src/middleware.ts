import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const protectedPages = ["/library", "/watch"];
const protectedApiRoutes = [
  { path: "/api/chat", method: "POST" },
  { path: "/api/chat/end", method: "POST" },
  { path: "/api/episodes", method: "POST" },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow all /api/auth/* routes without auth
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Protect API routes (POST only)
  for (const route of protectedApiRoutes) {
    if (pathname.startsWith(route.path) && request.method === route.method) {
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.next();
    }
  }

  // Protect page routes
  const isProtectedPage = protectedPages.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );

  if (isProtectedPage && !token) {
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/library/:path*",
    "/watch/:path*",
    "/api/chat/:path*",
    "/api/episodes/:path*",
  ],
};
