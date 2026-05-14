import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/campana",
  "/recursos",
  "/robots.txt",
  "/sitemap.xml",
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image",
  "/campana/opengraph-image",
]);

const PUBLIC_PREFIXES = [
  "/recursos/",
  "/_next/",
  "/brand/",
  "/marketing/",
  "/partners/",
  "/providers/",
];

const INTERNAL_PREFIXES = [
  "/api/",
  "/blueprint-launch",
  "/lab",
  "/preview",
  "/projects",
  "/workspace",
];

function isProductionPublication() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isPublicMarketingPath(pathname: string) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isInternalPath(pathname: string) {
  return INTERNAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function notFoundResponse() {
  return new NextResponse("Not found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  });
}

export function proxy(request: NextRequest) {
  if (!isProductionPublication()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (isPublicMarketingPath(pathname)) {
    return NextResponse.next();
  }

  if (isInternalPath(pathname)) {
    return notFoundResponse();
  }

  return notFoundResponse();
}

export const config = {
  matcher: "/:path*",
};
