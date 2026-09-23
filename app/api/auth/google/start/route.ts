import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { beginGoogleLogin, OIDC_COOKIE } from "@/server/auth/google-oidc";
import { getCurrentUser, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { rateLimit, requestAddress, secretHash } from "@/server/auth/security-events";
import { limitedJson } from "@/server/commercial/mercado-pago";

export async function POST(request: Request) {
  try {
    await rateLimit("oidc-start", requestAddress(request), 30);
    const body = await limitedJson(request, 1024);
    const jar = await cookies();
    let link: { userId: string; sessionHash: string } | undefined;
    if (body.link === true) {
      const user = await getCurrentUser();
      const token = jar.get(SESSION_COOKIE_NAME)?.value;
      if (!user || !token) return NextResponse.json({ error: "Inicia sesión para vincular Google." }, { status: 401 });
      link = { userId: user.id, sessionHash: secretHash(token) };
    }
    const prior = jar.get(SESSION_COOKIE_NAME)?.value;
    const result = await beginGoogleLogin(link, prior ? secretHash(prior) : undefined);
    jar.set(OIDC_COOKIE, result.browserToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
    return NextResponse.json({ url: result.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "El acceso con Google no está disponible. Intenta más tarde o utiliza tu cuenta existente." }, { status: 503 });
  }
}
