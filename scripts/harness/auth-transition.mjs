import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, MutationObserver, onlineManager } from "@tanstack/react-query";
import { savePlayerScore, unlockPlayerAchievement, setArcadeAccountTokenSource } from "../../src/lib/arcade-api.ts";
import { captureScoreIntent, captureAchievementIntent } from "../../src/lib/player-intent.ts";
import {
  cacheServerPlayer, clearAuthQueryCache, clerkIdentityKey, clerkTokenMatchesIdentity,
  createAuthRequestGuard, profileQueryKey,
} from "../../src/lib/auth-transition.ts";

test("same-UUID guest upgrade replaces cached player role with the server's owner profile", () => {
  const client = new QueryClient();
  try {
    const guest = { id: "retained-guest-id", username: "kept_player", name: "Kept Player", image: null, bio: "",
      role: "player", xp: 250, level: 3, streak_days: 2, best_streak: 2, last_play_date: "2026-11-08", createdAt: "2026-11-01T00:00:00Z" };
    cacheServerPlayer(client, guest, "guest");
    client.setQueryData(["admin-waitlist"], [{ email: "previous-owner@example.test" }]);
    clearAuthQueryCache(client);
    const identity = clerkIdentityKey("user_verified_owner", "session_owner");
    cacheServerPlayer(client, { ...guest, role: "admin" }, identity);
    const profile = client.getQueryData(profileQueryKey(guest.id, identity));
    assert.equal(profile.id, guest.id);
    assert.equal(profile.role, "admin");
    assert.equal(profile.xp, 250);
    assert.equal(client.getQueryData(profileQueryKey(guest.id, "guest")), undefined);
    assert.equal(client.getQueryData(["admin-waitlist"]), undefined);
  } finally { client.clear(); }
});

test("cancelled QueryClient requests cannot restore a previous account's private data", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let resolveOld;
  const response = new Promise(resolve => { resolveOld = resolve; });
  // Deliberately ignore AbortSignal: query cancellation must still prevent the
  // cache write when a legacy adapter cannot abort its underlying transport.
  const oldRequest = client.fetchQuery({ queryKey: ["admin-waitlist"], queryFn: () => response }).catch(() => null);
  clearAuthQueryCache(client);
  client.setQueryData(["profile", "new-account", "new-session"], { id: "new-account", role: "player" });
  resolveOld([{ email: "previous-owner@example.test" }]);
  await oldRequest;
  await Promise.resolve();
  assert.equal(client.getQueryData(["admin-waitlist"]), undefined);
  assert.equal(client.getQueryData(["profile", "new-account", "new-session"]).id, "new-account");
  client.clear();
});

test("a stable SDK callback cannot forward a different active principal's token under old UI state", () => {
  const token = claims => "fixture." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".synthetic";
  assert.equal(clerkTokenMatchesIdentity(token({ sub: "user_a", sid: "session_a" }), "user_a", "session_a"), true);
  assert.equal(clerkTokenMatchesIdentity(token({ sub: "user_b", sid: "session_b" }), "user_a", "session_a"), false);
  assert.equal(clerkTokenMatchesIdentity(token({ sub: "user_a", sid: "session_new" }), "user_a", "session_a"), false);
  assert.equal(clerkTokenMatchesIdentity("not-a-token", "user_a", "session_a"), false);
});

test("an already signed-in Clerk account or session replacement changes the identity boundary", () => {
  const first = clerkIdentityKey("user_a", "session_a");
  assert.notEqual(clerkIdentityKey("user_b", "session_b"), first);
  assert.notEqual(clerkIdentityKey("user_a", "session_new"), first);
  assert.equal(clerkIdentityKey(null, null), "guest");
  assert.notEqual(first, "guest");
});

test("queued score and unlock mutations retain the originating player across an account switch", async () => {
  const originalFetch = globalThis.fetch;
  const sent = [], savedFor = [];
  globalThis.fetch = async (url, options) => {
    const authorization = new Headers(options.headers).get("Authorization");
    const authenticatedPlayer = authorization === "Bearer synthetic-token-b" ? "player-b" : "player-a";
    const body = JSON.parse(options.body);
    const expected = body.expected_player_id ?? body.args?.p_expected_player_id;
    sent.push({ url, expected });
    // Match the real API's optional reject-only intent assertion. JWT checking
    // and D1 writes are separately exercised by the backend integration tests.
    if (expected !== undefined && expected !== authenticatedPlayer) return Response.json({ error: "Your active player changed." }, { status: 409 });
    savedFor.push(authenticatedPlayer);
    return Response.json({ data: { id: "synthetic-score", unlocked: true } });
  };
  try {
    for (const mutationFn of [
      () => savePlayerScore("player-a", { game_id: "game", run_id: "run", score: 10 }),
      () => unlockPlayerAchievement("player-a", "game", "first-step"),
    ]) {
      const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      setArcadeAccountTokenSource(async () => "synthetic-token-a");
      const observer = new MutationObserver(client, { mutationFn, onMutate: () => {} });
      const unsubscribe = observer.subscribe(() => {});
      const pending = observer.mutate();
      queueMicrotask(() => {
        unsubscribe();
        setArcadeAccountTokenSource(async () => "synthetic-token-b");
        clearAuthQueryCache(client);
      });
      await pending.catch(error => { if (error.status !== 409 && error.name !== "AbortError") throw error; });
      client.clear();
    }
    assert.ok(sent.every(request => request.expected === "player-a"));
    assert.equal(savedFor.includes("player-b"), false, "Old mutations must not credit the newly active account");
  } finally {
    globalThis.fetch = originalFetch;
    setArcadeAccountTokenSource(undefined);
  }
});

test("paused mutations keep the original player, game, run, slug and stats after UI options change", async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const originalFetch = globalThis.fetch;
  const originalOnline = onlineManager.isOnline();
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return Response.json({ data: { id: "synthetic-score", unlocked: true } });
  };
  let unsubscribeScore, unsubscribeUnlock;
  try {
    onlineManager.setOnline(false);
    setArcadeAccountTokenSource(undefined);
    const ui = { playerId: "player-a", gameId: "game-a", runId: "run-a", slug: "first-step" };
    const stats = { kills: 2, mode: "original", unsupported: { nested: true } };
    const score = captureScoreIntent(ui.playerId, ui.gameId, ui.runId, { score: 10, stats });
    const achievement = captureAchievementIntent(ui.playerId, ui.gameId, ui.slug);
    const scoreOptions = () => ({ mutationFn: intent => savePlayerScore(intent.playerId, {
      game_id: intent.gameId, run_id: intent.runId, score: intent.score, stats: intent.stats,
    }) });
    const unlockOptions = () => ({ mutationFn: intent => unlockPlayerAchievement(intent.playerId, intent.gameId, intent.slug) });
    const scoreObserver = new MutationObserver(client, scoreOptions());
    const unlockObserver = new MutationObserver(client, unlockOptions());
    unsubscribeScore = scoreObserver.subscribe(() => {});
    unsubscribeUnlock = unlockObserver.subscribe(() => {});
    const pendingScore = scoreObserver.mutate(score);
    const pendingUnlock = unlockObserver.mutate(achievement);
    for (let attempt = 0; attempt < 100 && (!scoreObserver.getCurrentResult().isPaused || !unlockObserver.getCurrentResult().isPaused); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.equal(scoreObserver.getCurrentResult().isPaused, true);
    assert.equal(unlockObserver.getCurrentResult().isPaused, true);

    // Simulate Play again / another game / a new principal and the subsequent
    // useMutation options update while both original actions are still paused.
    Object.assign(ui, { playerId: "player-b", gameId: "game-b", runId: "run-b", slug: "different-step" });
    stats.kills = 999;
    stats.mode = "changed after the score event";
    scoreObserver.setOptions(scoreOptions());
    unlockObserver.setOptions(unlockOptions());
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    await Promise.all([pendingScore, pendingUnlock]);

    assert.deepEqual(sent.find(request => request.url === "/api/scores").body, {
      game_id: "game-a", run_id: "run-a", score: 10,
      stats: { kills: 2, mode: "original" }, expected_player_id: "player-a",
    });
    assert.deepEqual(sent.find(request => request.url === "/api/community/rpc").body.args, {
      p_game_id: "game-a", p_slug: "first-step", p_expected_player_id: "player-a",
    });
    assert.equal(Object.isFrozen(score), true);
    assert.equal(Object.isFrozen(score.stats), true);
    assert.equal(Object.isFrozen(achievement), true);
  } finally {
    onlineManager.setOnline(originalOnline);
    unsubscribeScore?.(); unsubscribeUnlock?.();
    globalThis.fetch = originalFetch;
    setArcadeAccountTokenSource(undefined);
    client.clear();
  }
});

test("late account data cannot publish after a newer refresh or provider unmount", async () => {
  const guard = createAuthRequestGuard();
  const writes = [];
  let finishOld;
  const oldResponse = new Promise(resolve => { finishOld = resolve; });
  const oldGeneration = guard.begin();
  const oldRequest = oldResponse.then(value => {
    if (guard.current(oldGeneration)) writes.push(value);
  });

  const newGeneration = guard.begin();
  assert.equal(guard.current(newGeneration), true);
  finishOld("old account private profile");
  await oldRequest;
  assert.deepEqual(writes, []);

  let finishOnUnmount;
  const lateResponse = new Promise(resolve => { finishOnUnmount = resolve; });
  const queryGeneration = guard.snapshot();
  const lateQuery = lateResponse.then(value => {
    if (guard.current(queryGeneration)) writes.push(value);
  });
  guard.dispose();
  finishOnUnmount("previous session private profile");
  await lateQuery;
  assert.deepEqual(writes, []);

  // React development StrictMode can activate the same effect again. Results
  // from its earlier lifecycle must remain invalid after that activation.
  guard.activate();
  assert.equal(guard.current(queryGeneration), false);
  const active = guard.begin();
  assert.equal(guard.current(active), true);
});
