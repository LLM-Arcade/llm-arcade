import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, cookies } from "./fixture.mjs";
import { bootstrapVerifiedOwner } from "../src/auth.ts";

test("concurrent Clerk identities cannot take over one guest card", async () => {
  const app = await fixture();
  try {
    const cookie = cookies(await app.post("/api/auth/guest", { username: "concurrent_guest" }));
    const guest = (await (await app.request("/api/me", { headers: { Cookie: cookie } })).json()).data;
    const left = await app.identity({ sub: "user_left", email: "left@example.test" });
    const right = await app.identity({ sub: "user_right", email: "right@example.test" });
    const replies = await Promise.all([left, right].map(auth => app.post("/api/auth/account", {}, { ...auth, Cookie: cookie })));
    for (const response of replies) assert.ok([200, 409].includes(response.status), await response.clone().text());
    const original = await app.db.prepare('SELECT clerk_id FROM "user" WHERE id = ?').bind(guest.id).first();
    assert.ok(["user_left", "user_right"].includes(original.clerk_id));
    assert.equal((await app.request("/api/me", { headers: { Cookie: cookie } })).status, 401);
    const ids = [];
    for (const auth of [left, right]) {
      const linked = await app.post("/api/auth/account", {}, auth);
      assert.equal(linked.status, 200, await linked.clone().text());
      ids.push((await linked.json()).data.user_id);
    }
    assert.notEqual(ids[0], ids[1]);
    assert.equal(ids.filter(id => id === guest.id).length, 1);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user"').first()).n, 2);
  } finally { await app.runtime.dispose(); }
});

test("Clerk SDK verifies account tokens and primary email; new accounts retain guest IDs and revoke old guest credentials", async t => {
  const app = await fixture();
  try {
    const created = await app.post("/api/auth/guest", { username: "kept_guest" });
    const guestCookie = cookies(created);
    const guest = (await (await app.request("/api/me", { headers: { Cookie: guestCookie } })).json()).data;
    const alice = await app.login({}, guestCookie);
    assert.equal(alice.user.id, guest.id);
    assert.equal(alice.user.username, "kept_guest");
    assert.equal(alice.user.isGuest, false);
    assert.equal(alice.user.emailVerified, true);
    assert.equal(alice.user.role, "player");
    assert.equal("clerk_id" in alice.user, false);
    assert.equal((await app.request("/api/me", { headers: { Cookie: guestCookie } })).status, 401);
    const again = await app.login();
    assert.equal(again.user.id, alice.user.id);
    for (const bad of [
      { _tamperSignature: true }, { iss: "https://evil.example.test" }, { azp: "https://evil.example.test" },
      { exp: Math.floor(Date.now() / 1000) - 60 },
    ]) {
      const auth = await app.identity(bad);
      assert.equal((await app.request("/api/me", { headers: auth })).status, 401);
    }
    const unverified = await app.identity({ sub: "user_unverified", email: "owner@example.test", email_verified: false });
    assert.equal((await app.post("/api/auth/account", {}, unverified)).status, 403);
    const owner = await app.login({ sub: "user_owner", email: "owner@example.test" });
    assert.equal(owner.user.role, "admin");
    // A signed token's client-like email fields are not trusted as verified
    // identity. The server fetches the provider's verified primary address.
    await bootstrapVerifiedOwner({ ARCADE_DB: app.db, INITIAL_ADMIN_EMAIL: "not-an-owner@example.test" }, alice.user.id);
    assert.equal((await app.db.prepare('SELECT count(*) AS n FROM "user" WHERE role = ?').bind("admin").first()).n, 1);
    const unrelatedGuest = await app.post("/api/auth/guest", { username: "separate_guest" });
    const separateCookie = cookies(unrelatedGuest);
    const signedOut = await app.post("/api/auth/sign-out", {}, { ...owner.auth, Cookie: separateCookie });
    assert.equal(signedOut.status, 200);
    assert.equal((await app.request("/api/me", { headers: { Cookie: separateCookie } })).status, 200);
    t.diagnostic("Real Clerk backend SDK signature checks with local synthetic keys/provider API; no real Clerk account, password or app credentials created.");
  } finally { await app.runtime.dispose(); }
});
