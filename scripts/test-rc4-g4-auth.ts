import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import * as oidc from "openid-client";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";
import { exchangeGoogleCode, createOidcTransaction, consumeOidcTransaction, resolveGoogleIdentity, checkedGoogleIdentity } from "@/server/auth/google-oidc";
import { issueSessionToken, revokeSessionToken } from "@/server/auth/session";
import { secretHash, rateLimit } from "@/server/auth/security-events";
import { removeTestCommercialData } from "./fixtures/commercial";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55440/imx_b4_validation_rc4")) throw new Error("Isolated DB required");
  global.fetch = async () => { throw new Error("No external calls"); };
  process.env.APP_ORIGIN = "https://app.example.test";
  const issuer = "https://accounts.google.com", clientId = "offline-client";
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
  let checks = 0;
  const users: string[] = []; const transactionHashes: string[] = [];
  const now = Math.floor(Date.now()/1000);
  const baseClaims = { iss: issuer, aud: clientId, sub: "test-sub", email: "oidc@example.test", email_verified: true, nonce: "test-nonce", iat: now, exp: now+600 };
  const attempt = { state: "test-state", nonce: "test-nonce", verifier: "pkce-test-verifier-with-at-least-forty-three-characters" };
  const callback = new URL("https://app.example.test/api/auth/google/callback?code=test-code&state=test-state");
  const makeClient = (patch: Record<string, unknown> = {}, badSignature = false) => {
    const config = new oidc.Configuration({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` }, clientId, "offline-secret");
    oidc.enableNonRepudiationChecks(config);
    config[oidc.customFetch] = async (url, init) => {
      if (String(url).endsWith("/jwks")) return Response.json({ keys: [jwk] });
      assert.equal(String(url), `${issuer}/token`);
      const form = new URLSearchParams(String(init?.body));
      assert.equal(form.get("code_verifier"), attempt.verifier);
      assert.equal(form.get("redirect_uri"), "https://app.example.test/api/auth/google/callback");
      const payload = [Buffer.from(JSON.stringify({ alg: "RS256", kid: "test-key" })).toString("base64url"), Buffer.from(JSON.stringify({ ...baseClaims, ...patch })).toString("base64url")].join(".");
      const signature = sign("RSA-SHA256", Buffer.from(payload), badSignature ? otherKeys.privateKey : privateKey).toString("base64url");
      return Response.json({ token_type: "Bearer", access_token: "offline-never-persist", id_token: `${payload}.${signature}`, expires_in: 600 });
    };
    return config;
  };
  try {
    assert.equal((await exchangeGoogleCode(makeClient(), callback, attempt)).sub, "test-sub"); checks++;
    for (const claims of [{ iss: "https://evil.test" }, { aud: "wrong-client" }, { exp: now-600 }, { nonce: "wrong" }, { email_verified: false }]) {
      await assert.rejects(() => exchangeGoogleCode(makeClient(claims), callback, attempt)); checks++;
    }
    await assert.rejects(() => exchangeGoogleCode(makeClient({}, true), callback, attempt)); checks++;
    await assert.rejects(() => exchangeGoogleCode(makeClient(), new URL(callback.href.replace("test-state", "wrong-state")), attempt)); checks++;
    assert.throws(() => checkedGoogleIdentity({ sub: "x", email: "test@example.test", email_verified: false })); checks++;
    const transaction = await createOidcTransaction(); transactionHashes.push(secretHash(transaction.state));
    await assert.rejects(() => consumeOidcTransaction(transaction.state, "another-browser"), /INVALID/); checks++;
    const raced = await Promise.allSettled([consumeOidcTransaction(transaction.state, transaction.browserToken), consumeOidcTransaction(transaction.state, transaction.browserToken)]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1); checks++;
    const used = await prisma.oidcTransaction.findUniqueOrThrow({ where: { stateHash: secretHash(transaction.state) } });
    assert.equal(used.verifier, ""); assert.equal(used.nonce, ""); checks++;
    const expired = await createOidcTransaction(); transactionHashes.push(secretHash(expired.state));
    await prisma.oidcTransaction.update({ where: { stateHash: secretHash(expired.state) }, data: { expiresAt: new Date(0) } });
    await assert.rejects(() => consumeOidcTransaction(expired.state, expired.browserToken)); checks++;

    const existing = await prisma.user.create({ data: { email: `g4-existing-${randomUUID()}@example.test` } }); users.push(existing.id);
    const identity = { sub: randomUUID(), email: existing.email, email_verified: true };
    await assert.rejects(() => resolveGoogleIdentity(identity), /ACCOUNT_LINK_REQUIRED/); checks++;
    const firstToken = await issueSessionToken({ userId: existing.id });
    const secondToken = await issueSessionToken({ userId: existing.id }, firstToken);
    assert.notEqual(firstToken, secondToken); checks++;
    assert.equal(await prisma.userSession.count({ where: { tokenHash: secretHash(firstToken), revokedAt: null } }), 0); checks++;
    assert.equal(await resolveGoogleIdentity(identity, { userId: existing.id, sessionHash: secretHash(secondToken) }), existing.id); checks++;
    assert.equal(await resolveGoogleIdentity({ ...identity, email: `changed-${randomUUID()}@example.test` }), existing.id, "stable provider sub, not email"); checks++;
    const stranger = await prisma.user.create({ data: { email: `g4-stranger-${randomUUID()}@example.test` } }); users.push(stranger.id);
    const strangerToken = await issueSessionToken({ userId: stranger.id });
    await assert.rejects(() => resolveGoogleIdentity(identity, { userId: stranger.id, sessionHash: secretHash(strangerToken) }), /ALREADY_LINKED/); checks++;
    await revokeSessionToken(secondToken);
    await assert.rejects(() => resolveGoogleIdentity({ ...identity, sub: randomUUID() }, { userId: existing.id, sessionHash: secretHash(secondToken) }), /RECENT_LOGIN_REQUIRED/); checks++;
    const unique = { sub: randomUUID(), email: `g4-new-${randomUUID()}@example.test`, email_verified: true };
    const newUsers = await Promise.all([resolveGoogleIdentity(unique), resolveGoogleIdentity(unique)]);
    users.push(newUsers[0]); assert.equal(newUsers[0], newUsers[1]); checks++;
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: newUsers[0] } })).trainingConsent, false); checks++;
    const subject = randomUUID();
    const rate = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit("offline-test", subject, 3)));
    assert.equal(rate.filter((r) => r.status === "fulfilled").length, 3); checks++;
    await prisma.authThrottle.delete({ where: { keyHash: secretHash(`g4:offline-test:${subject}`) } });
    for (const path of ["/api/auth/google/start", "/api/commercial", "/api/commercial/consent"]) {
      assert.equal(proxy(new NextRequest(`https://app.example.test${path}`, { method: "POST", headers: { origin: "https://attacker.test" } })).status, 403); checks++;
    }
    assert.equal(proxy(new NextRequest("https://app.example.test/api/payments/mercado-pago/webhook", { method: "POST" })).status, 200, "only exact webhook bypasses origin; signature checked in route"); checks++;
    assert.equal(proxy(new NextRequest("https://app.example.test/api/payments/mercado-pago/webhook/other", { method: "POST" })).status, 403); checks++;
    console.log(`PASS G4 auth: ${checks} assertions; mocked real OIDC JWT validation, PKCE/state/nonce/replay, stable sub, explicit linking, session rotation/revoke, rate limits, CSRF. Google external=NOT_RUN.`);
  } finally {
    await prisma.oidcTransaction.deleteMany({ where: { stateHash: { in: transactionHashes } } });
    await removeTestCommercialData(users);
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
