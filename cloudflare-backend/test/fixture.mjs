import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { Miniflare } from "miniflare";
import { baseSchemas, allSchemas, schemaStatements } from "../scripts/schema-statements.mjs";

export const ORIGIN = "https://arcade.example.test";
export const cookies = response => response.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");

export async function fixture(options = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const users = new Map();
  const issuer = "https://clerk.example.test";
  const runtime = new Miniflare({ modules: [{ type: "ESModule", path: "dist/worker.mjs" }],
    compatibilityDate: "2026-07-30", compatibilityFlags: ["nodejs_compat"],
    inspectorPort: process.env.ARCADE_PROFILE === "1" ? 0 : undefined,
    d1Databases: { ARCADE_DB: "local-clerk-test" },
    bindings: { ...(options.accounts === false ? {} : {
      CLERK_PUBLISHABLE_KEY: "pk_test_" + Buffer.from("clerk.example.test$").toString("base64"),
      CLERK_SECRET_KEY: "sk_test_synthetic_not_a_real_app_key", CLERK_ISSUER: issuer,
      CLERK_JWT_KEY: await exportSPKI(publicKey),
    }), APP_ORIGIN: ORIGIN, INITIAL_ADMIN_EMAIL: "owner@example.test" },
    outboundService: async request => {
      const url = new URL(request.url);
      const match = /^\/v1\/users\/(user_[a-z0-9_]+)$/.exec(url.pathname);
      if (url.origin === "https://api.clerk.com" && match) {
        assert.equal(request.headers.get("authorization"), "Bearer sk_test_synthetic_not_a_real_app_key");
        assert.equal(request.headers.get("Clerk-API-Version"), "2026-05-12");
        const user = users.get(match[1]);
        const result = user && options.userResponse ? options.userResponse(user) : user;
        return result instanceof Response ? result : Response.json(result ?? { errors: [{ message: "Not found" }] }, { status: result ? 200 : 404 });
      }
      throw new Error("Unexpected outbound request in isolated test: " + url.origin + url.pathname);
    } });
  const db = await runtime.getD1Database("ARCADE_DB");
  const statements = await schemaStatements(options.catalog ? allSchemas : baseSchemas);
  await db.batch(statements.map(({ sql }) => db.prepare(sql)));
  const request = (path, options = {}) => {
    const headers = new Headers(options.headers);
    if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (!headers.has("CF-Connecting-IP")) headers.set("CF-Connecting-IP", "192.0.2.10");
    return runtime.dispatchFetch(ORIGIN + path, { ...options, redirect: "manual", headers });
  };
  const post = (path, data, auth = "") => request(path, { method: "POST",
    headers: typeof auth === "string" ? { Cookie: auth } : auth, body: JSON.stringify(data) });
  const identity = async (values = {}) => {
    const id = values.sub ?? "user_alice", email = values.email ?? "alice@example.test";
    const emailId = "idn_" + id;
    users.set(id, { id, object: "user", username: null, first_name: null, last_name: null,
      email_addresses: [{ id: emailId, object: "email_address", email_address: email,
        verification: { status: values.email_verified === false ? "unverified" : "verified", strategy: "email_code" }, linked_to: [] }],
      primary_email_address_id: emailId, primary_phone_number_id: null, primary_web3_wallet_id: null,
      phone_numbers: [], web3_wallets: [], external_accounts: [], organization_memberships: [],
      password_enabled: true, two_factor_enabled: false, public_metadata: {}, private_metadata: {}, unsafe_metadata: {},
      created_at: Date.now(), updated_at: Date.now(), image_url: "", has_image: false });
    const now = Math.floor(Date.now() / 1000);
    let token = await new SignJWT({ iss: issuer, sub: id, sid: "sess_" + id,
      azp: ORIGIN, iat: now, nbf: now - 1, exp: now + 60, v: 2, sts: "active", ...values })
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "synthetic-fixture-key" }).sign(privateKey);
    if (values._tamperSignature) {
      const parts = token.split("."); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1); token = parts.join(".");
    }
    return { Authorization: "Bearer " + token };
  };
  const login = async (values = {}, guestCookie = "") => {
    const auth = await identity(values);
    const linked = await post("/api/auth/account", {}, { ...auth, Cookie: guestCookie });
    assert.equal(linked.status, 200, await linked.clone().text());
    const me = await request("/api/me", { headers: auth });
    assert.equal(me.status, 200, await me.clone().text());
    return { user: (await me.json()).data, auth, linked };
  };
  return { runtime, db, request, post, identity, login };
}
