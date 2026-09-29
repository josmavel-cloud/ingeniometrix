import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { finishGoogleLogin, OIDC_COOKIE } from "@/server/auth/google-oidc";
import { createSession } from "@/server/auth/session";
import { rateLimit, requestAddress, securityAudit } from "@/server/auth/security-events";

export async function GET(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) return new NextResponse("Acceso temporalmente no disponible", { status: 503 });
  const jar = await cookies();
  const browserToken = jar.get(OIDC_COOKIE)?.value || "";
  jar.set(OIDC_COOKIE, "", { path: "/api/auth/google", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 0 });
  try {
    await rateLimit("oidc-callback", requestAddress(request), 60);
    // APP_ORIGIN is canonical; reverse proxy host headers do not select redirect URI.
    const callback = new URL(`/api/auth/google/callback${new URL(request.url).search}`, origin);
    const userId = await finishGoogleLogin(callback, browserToken);
    await createSession({ userId, userAgent: request.headers.get("user-agent") });
    return NextResponse.redirect(new URL("/projects", origin), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
  } catch (error) {
    const category = error instanceof Error && error.message === "ACCOUNT_LINK_REQUIRED" ? "account_link_required" : "authentication_failed";
    await securityAudit("LOGIN_FAILURE", null, { category });
    return NextResponse.redirect(new URL(`/workspace?auth=${category}`, origin), { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
  }
}
