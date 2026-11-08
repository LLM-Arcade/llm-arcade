import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { createClerkClient } from "@clerk/backend";
import { fixture, ORIGIN } from "./fixture.mjs";

test("the lean verifier preserves the pinned SDK's session-only header decisions", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const issuer = "https://clerk.example.test";
  const env = { APP_ORIGIN: ORIGIN, CLERK_ISSUER: issuer, CLERK_JWT_KEY: await exportSPKI(publicKey),
    CLERK_SECRET_KEY: "sk_test_synthetic_not_a_real_app_key",
    CLERK_PUBLISHABLE_KEY: "pk_test_" + Buffer.from("clerk.example.test$").toString("base64") };
  const reference = createClerkClient({ secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY, telemetry: { disabled: true } });
  const compiled = await build({ entryPoints: ["src/clerk-auth.ts"], bundle: true, platform: "node", format: "esm", write: false });
  const { readClerkIdentity } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    ["active", {}, {}, true], ["missing azp", { azp: undefined }, {}, false],
    ["wrong azp", { azp: "https://other.example.test" }, {}, false],
    ["wrong issuer", { iss: "https://other.example.test" }, {}, false],
    ["expired", { exp: now - 60 }, {}, false], ["future nbf", { nbf: now + 60 }, {}, false],
    ["future iat", { iat: now + 60 }, {}, false], ["pending", { sts: "pending" }, {}, false],
    ["missing session", { sid: undefined }, {}, false], ["empty session", { sid: "" }, {}, false],
    ["machine subject", { sub: "mch_synthetic" }, {}, false],
    ["other category", {}, { cat: "cl_B7d4PD999AAA" }, false],
    ["machine category", {}, { cat: "cl_B7d4PD333AAA" }, false],
    ["null category", {}, { cat: null }, false],
    ["session category", {}, { cat: "cl_B7d4PD111AAA" }, true],
    ["OAuth header type", {}, { typ: "at+jwt" }, false],
    ["application OAuth header type", {}, { typ: "application/at+jwt" }, false],
    ["legacy absent status", { sts: undefined }, {}, true],
    ["legacy absent header type", {}, { typ: undefined }, true],
  ];
  for (const [name, claims, header, expected] of cases) {
    const token = await new SignJWT({ iss: issuer, sub: "user_synthetic", sid: "sess_synthetic", azp: ORIGIN,
      iat: now, nbf: now - 1, exp: now + 60, v: 2, sts: "active", ...claims })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "synthetic", ...header }).sign(privateKey);
    const request = new Request(ORIGIN + "/api/me", { headers: { Authorization: "Bearer " + token } });
    const state = await reference.authenticateRequest(request, { jwtKey: env.CLERK_JWT_KEY, issuer,
      authorizedParties: [ORIGIN], acceptsToken: "session_token" });
    const auth = state.toAuth();
    assert.equal(Boolean(state.isAuthenticated && auth.userId && auth.sessionId), expected, name + " reference");
    assert.equal(Boolean(await readClerkIdentity(request, env)), expected, name + " lean verifier");
  }
});

test("primary-email verification rejects mismatched, unverified, oversized or redirected provider responses", async () => {
  const cases = [
    ["wrong provider user", user => ({ ...user, id: "user_someone_else" }), 403],
    ["missing primary", user => ({ ...user, primary_email_address_id: null }), 403],
    ["verified secondary only", user => ({ ...user, primary_email_address_id: "unverified-primary", email_addresses: [
      ...user.email_addresses,
      { id: "unverified-primary", email_address: "owner@example.test", verification: { status: "unverified" } },
    ] }), 403],
    ["oversized body", user => ({ ...user, unsafe_metadata: { excessive: "x".repeat(70000) } }), 503],
    ["provider redirect", () => Response.redirect("https://never-follow.example.test", 302), 503],
  ];
  for (const [name, userResponse, expected] of cases) {
    const app = await fixture({ userResponse });
    try {
      const auth = await app.identity({ email: "owner@example.test" });
      const response = await app.post("/api/auth/account", {}, auth);
      assert.equal(response.status, expected, name);
      assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 0, name + " must not create a player or admin");
    } finally { await app.runtime.dispose(); }
  }
});
