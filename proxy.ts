import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_EXACT_PATHS = new Set([
  "/", "/campana", "/recursos", "/robots.txt", "/sitemap.xml", "/icon.png",
  "/apple-icon.png", "/opengraph-image", "/campana/opengraph-image",
]);
const PUBLIC_PREFIXES = ["/recursos/", "/_next/", "/brand/", "/marketing/", "/partners/", "/providers/"];
const LEGACY_INTERNAL_PREFIXES = ["/blueprint-launch", "/lab", "/preview", "/api/blueprint-launch", "/api/labs"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isProductionPublication() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isLegacyInternalPath(pathname: string) {
  return LEGACY_INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function notFoundResponse() {
  return new NextResponse("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

function expectedOrigin(request: NextRequest) {
  const configured = process.env.APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  return isProductionPublication() ? null : request.nextUrl.origin;
}

function validateMutationOrigin(request: NextRequest) {
  if (SAFE_METHODS.has(request.method) || !request.nextUrl.pathname.startsWith("/api/")) return null;
  if (request.nextUrl.pathname.startsWith("/api/internal/")) return null;
  // Dedicated machine callback authenticates the provider signature instead of browser origin.
  if (request.nextUrl.pathname === "/api/payments/mercado-pago/webhook") return null;
  const allowedOrigin = expectedOrigin(request);
  if (!allowedOrigin) return NextResponse.json({ error: "APP_ORIGIN no esta configurado." }, { status: 503 });

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== allowedOrigin || (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite))) {
    return NextResponse.json({ error: "Origen de solicitud no autorizado." }, { status: 403 });
  }
  return null;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (process.env.IMX_RUNTIME_ROLE === "frontend" && (pathname.startsWith("/api/internal/") || pathname.startsWith("/api/health/"))) return notFoundResponse();
  if (isProductionPublication() && isLegacyInternalPath(pathname)) return notFoundResponse();
  const csrfFailure = validateMutationOrigin(request);
  if (csrfFailure) return csrfFailure;
  return NextResponse.next();
}

// Do not clone/buffer large PDF bodies in Next proxy (default truncation is 10 MB).
// This exact route enforces Origin + single-use session-bound capability itself.
export const config = { matcher: "/((?!api/transfers/upload$).*)" };
