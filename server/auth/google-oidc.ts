import * as oidc from "openid-client";
import { prisma } from "@/lib/prisma";
import { securityAudit, secretHash } from "./security-events";

export const OIDC_COOKIE = "imx_oidc_transaction";
const ISSUER = "https://accounts.google.com";
let config: Promise<oidc.Configuration> | undefined;
export function googleConfigured() { return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_ORIGIN); }
export function googleRedirectUri() {
  const origin = new URL(process.env.APP_ORIGIN || "invalid");
  if (origin.origin !== process.env.APP_ORIGIN || origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("AUTH_ORIGIN_INVALID");
  return `${origin.origin}/api/auth/google/callback`;
}
async function configuration() {
  if (!googleConfigured()) throw new Error("GOOGLE_UNAVAILABLE");
  config ??= oidc.discovery(new URL(ISSUER), process.env.GOOGLE_CLIENT_ID!, process.env.GOOGLE_CLIENT_SECRET!, undefined,
    { execute: [oidc.enableNonRepudiationChecks] }).catch((error) => { config = undefined; throw error; });
  return config;
}
export async function createOidcTransaction(link?: { userId: string; sessionHash: string }, priorSessionHash?: string) {
  const state = oidc.randomState(), browserToken = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
  const redirectUri = googleRedirectUri();
  await prisma.oidcTransaction.create({ data: { stateHash: secretHash(state), browserHash: secretHash(browserToken), nonce, verifier, redirectUri,
    linkUserId: link?.userId, linkSessionHash: link?.sessionHash ?? priorSessionHash, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return { state, browserToken, nonce, verifier, redirectUri };
}
export async function beginGoogleLogin(link?: { userId: string; sessionHash: string }, priorSessionHash?: string) {
  const client = await configuration();
  const attempt = await createOidcTransaction(link, priorSessionHash);
  const url = oidc.buildAuthorizationUrl(client, { redirect_uri: attempt.redirectUri, scope: "openid email profile", state: attempt.state,
    nonce: attempt.nonce, code_challenge: await oidc.calculatePKCECodeChallenge(attempt.verifier), code_challenge_method: "S256", prompt: "select_account" });
  return { url: url.href, browserToken: attempt.browserToken };
}
export async function consumeOidcTransaction(state: string, browserToken: string) {
  if (!state || !browserToken || state.length > 512 || browserToken.length > 512) throw new Error("AUTH_TRANSACTION_INVALID");
  return prisma.$transaction(async (tx) => {
    const stateHash = secretHash(state);
    const result = await tx.oidcTransaction.updateMany({ where: { stateHash, browserHash: secretHash(browserToken), consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (result.count !== 1) throw new Error("AUTH_TRANSACTION_INVALID");
    const attempt = await tx.oidcTransaction.findUniqueOrThrow({ where: { stateHash } });
    // Erase PKCE and nonce after single use; keep only metadata for audit/expiry cleanup.
    await tx.oidcTransaction.update({ where: { stateHash }, data: { verifier: "", nonce: "" } });
    return attempt;
  });
}
export type GoogleIdentity = { sub: string; email: string; email_verified: boolean; name?: string };
export function checkedGoogleIdentity(claims: Record<string, unknown>): GoogleIdentity {
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || claims.email_verified !== true) throw new Error("VERIFIED_IDENTITY_REQUIRED");
  return { sub: claims.sub, email: claims.email.trim().toLowerCase(), email_verified: true, name: typeof claims.name === "string" ? claims.name.slice(0, 200) : undefined };
}
export async function resolveGoogleIdentity(identity: GoogleIdentity, link?: { userId: string; sessionHash: string }) {
  const verified = checkedGoogleIdentity(identity);
  return prisma.$transaction(async (tx) => {
    // Serialize both sub and email without using email as the identity key.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`google:${verified.sub}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email:${verified.email}`}))`;
    if (link) {
      const session = await tx.userSession.findFirst({ where: { userId: link.userId, tokenHash: link.sessionHash, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!session || Date.now() - session.createdAt.getTime() > 15 * 60_000) throw new Error("RECENT_LOGIN_REQUIRED");
    }
    const existing = await tx.authIdentity.findUnique({ where: { provider_providerSubject: { provider: "google", providerSubject: verified.sub } } });
    if (existing) {
      if (link && existing.userId !== link.userId) throw new Error("IDENTITY_ALREADY_LINKED");
      await tx.authIdentity.update({ where: { id: existing.id }, data: { lastUsedAt: new Date() } });
      return existing.userId;
    }
    const collision = await tx.user.findUnique({ where: { email: verified.email } });
    if (collision && !link) throw new Error("ACCOUNT_LINK_REQUIRED");
    const userId = link?.userId ?? (await tx.user.create({ data: { email: verified.email, name: verified.name } })).id;
    await tx.authIdentity.create({ data: { userId, provider: "google", providerSubject: verified.sub, emailAtLinkTime: verified.email, emailVerifiedAtLinkTime: true } });
    await securityAudit("IDENTITY_LINKED", userId, { provider: "google", explicitLink: Boolean(link) }, tx);
    return userId;
  });
}
export async function finishGoogleLogin(callback: URL, browserToken: string) {
  if (`${callback.origin}${callback.pathname}` !== googleRedirectUri()) throw new Error("AUTH_REDIRECT_INVALID");
  const state = callback.searchParams.get("state") || "";
  const attempt = await consumeOidcTransaction(state, browserToken);
  const identity = await exchangeGoogleCode(await configuration(), callback, { state, nonce: attempt.nonce, verifier: attempt.verifier });
  const userId = await resolveGoogleIdentity(identity, attempt.linkUserId && attempt.linkSessionHash ? { userId: attempt.linkUserId, sessionHash: attempt.linkSessionHash } : undefined);
  // Strict session cookies are absent on the cross-site callback. Revoke the
  // pre-auth session captured by the same-origin start, not a callback cookie.
  if (attempt.linkSessionHash) await prisma.userSession.updateMany({ where: { tokenHash: attempt.linkSessionHash, revokedAt: null }, data: { revokedAt: new Date() } });
  return userId;
}
export async function exchangeGoogleCode(client: oidc.Configuration, callback: URL, attempt: { state: string; nonce: string; verifier: string }) {
  const tokens = await oidc.authorizationCodeGrant(client, callback, { expectedState: attempt.state, expectedNonce: attempt.nonce, pkceCodeVerifier: attempt.verifier, idTokenExpected: true });
  const claims = tokens.claims();
  if (!claims) throw new Error("ID_TOKEN_REQUIRED");
  return checkedGoogleIdentity(claims);
}
