import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkedBuildSettings, createVercelConfig, deploymentTarget, WORKER_ORIGINS } from "../vercel-environment.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), "arcade-vercel-"));
process.on("exit", () => rmSync(temporary, { recursive: true, force: true }));
const key = (type, host) => `pk_${type}_${Buffer.from(`${host}$`).toString("base64")}`;
const productionKey = key("live", "clerk.arcade-fixture.example");
const previewKey = key("test", "arcade-fixture.clerk.accounts.dev");
const cleanEnv = Object.fromEntries(Object.entries(process.env)
  .filter(([name]) => !/^(VITE_|VERCEL|ARCADE_VERCEL)/i.test(name)));
function node(args, env = {}, cwd = root) {
  return spawnSync(process.execPath, args, {
    cwd, env: { ...cleanEnv, ...env }, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
}
function routes(config, origin) {
  assert.deepEqual(config.rewrites, [
    { source: "/api", destination: `${origin}/api` },
    { source: "/api/:path*", destination: `${origin}/api/:path*` },
    { source: "/(.*)", destination: "/index.html" },
  ]);
}

test("automatic Git config separates production, preview, custom and local targets", () => {
  // Pin the release boundaries independently of the implementation constants.
  assert.deepEqual(WORKER_ORIGINS, {
    production: "https://llm-arcade-api.jeffkazzee.workers.dev",
    preview: "https://llm-arcade-api-preview.jeffkazzee.workers.dev",
  });
  const env = { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production" };
  const config = createVercelConfig(env);
  routes(config, WORKER_ORIGINS.production);
  assert.equal(config.buildCommand, "node scripts/build-vercel.mjs production");
  for (const nonProduction of [
    {}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" },
    { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "staging" },
    { VERCEL_TARGET_ENV: "staging", NODE_ENV: "production" },
    { VERCEL_PROJECT_PRODUCTION_URL: "www.llmarcade.fun", NODE_ENV: "production" },
  ]) {
    const preview = createVercelConfig(nonProduction);
    routes(preview, WORKER_ORIGINS.preview);
    assert.equal(preview.buildCommand, "node scripts/build-vercel.mjs preview");
    assert.ok(!JSON.stringify(preview).includes(WORKER_ORIGINS.production));
  }
  const actualExport = node(["--input-type=module", "-e", "import {config} from './vercel.mjs'; console.log(JSON.stringify(config))"], env);
  assert.equal(actualExport.status, 0, actualExport.stderr);
  assert.deepEqual(JSON.parse(actualExport.stdout), config);
  assert.ok(!readdirSync(root).includes("vercel.json"), "only one automatic Vercel config may exist");
});

test("conflicting contexts and config/build target mismatches fail closed", () => {
  for (const env of [
    { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "production" },
    { VERCEL_ENV: "production", VERCEL_TARGET_ENV: "staging" },
    { VERCEL_ENV: "unexpected" },
  ]) assert.throws(() => deploymentTarget(env));
  assert.throws(() => checkedBuildSettings({ VERCEL_ENV: "production" }, { VITE_CLERK_PUBLISHABLE_KEY: productionKey }, "preview"));
  assert.throws(() => checkedBuildSettings({}, {}, "production"));
  for (const env of [{}, { VERCEL: "1" }]) {
    assert.throws(() => checkedBuildSettings(env, {}, "preview"), /target context is required/);
    const unidentified = node([path.join(root, "scripts/build-vercel.mjs"), "preview"], env, temporary);
    assert.equal(unidentified.status, 1);
    assert.match(unidentified.stderr, /target context is required/);
  }
  assert.throws(() => checkedBuildSettings({ VERCEL: "1" }, {}), /target context is required/);
  const explicit = JSON.parse(readFileSync(path.join(root, "vercel.cloudflare-preview.json"), "utf8"));
  routes(explicit, WORKER_ORIGINS.preview);
  assert.equal(explicit.buildCommand, "node scripts/build-vercel.mjs preview");
  const failed = node([path.join(root, "scripts/build-vercel.mjs"), "preview"], {
    VERCEL_ENV: "production", VITE_CLERK_PUBLISHABLE_KEY: productionKey,
  }, temporary);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /does not match the build target/);
  assert.ok(!failed.stderr.includes(productionKey));
});

test("production requires a live key and rejects malformed or disguised development keys", () => {
  for (const value of [undefined, "", previewKey, "pk_live_malformed", "sk_live_not_a_publishable_key",
    key("live", "fixture.accounts.dev"), key("live", "fixture.lcl.dev"),
    key("live", "https://clerk.arcade-fixture.example"), key("live", "fixture.example/path"),
  ]) {
    assert.throws(() => checkedBuildSettings({ VERCEL_ENV: "production" }, { VITE_CLERK_PUBLISHABLE_KEY: value }), /requires a valid live Clerk/);
  }
  const valid = checkedBuildSettings({ VERCEL_ENV: "production" }, { VITE_CLERK_PUBLISHABLE_KEY: productionKey });
  assert.equal(valid.publishableKey, productionKey);
  assert.equal(valid.forceCloudflare, true);
});

test("preview accepts a development key or guest-only build and rejects every live key", () => {
  for (const env of [{}, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, { VERCEL_TARGET_ENV: "staging" }]) {
    assert.equal(checkedBuildSettings(env, {}).publishableKey, "");
    assert.equal(checkedBuildSettings(env, { VITE_CLERK_PUBLISHABLE_KEY: previewKey }).publishableKey, previewKey);
    for (const value of [productionKey, key("live", "fixture.accounts.dev"), "pk_live_malformed", key("test", "clerk.fixture.example")]) {
      assert.throws(() => checkedBuildSettings(env, { VITE_CLERK_PUBLISHABLE_KEY: value }), /Non-production builds/);
    }
  }
  assert.equal(checkedBuildSettings({}, {}).forceCloudflare, false, "ordinary local build retains its opt-in flag");
  assert.equal(checkedBuildSettings({ VERCEL_ENV: "preview" }, {}, "preview").forceCloudflare, true);
});

test("real Vite config rejects a live dotenv fallback and respects environment precedence", () => {
  const dotenv = path.join(temporary, ".env.production");
  writeFileSync(dotenv, `VITE_CLERK_PUBLISHABLE_KEY=${productionKey}\n`);
  const vite = new URL("../../node_modules/vite/dist/node/index.js", import.meta.url).href;
  const config = path.join(root, "vite.config.ts");
  const code = `import {loadConfigFromFile} from ${JSON.stringify(vite)}; await loadConfigFromFile({command:'build', mode:'production'}, ${JSON.stringify(config)});`;
  const rejected = node(["--input-type=module", "-e", code], { VERCEL_ENV: "preview" }, temporary);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Non-production builds/);
  assert.ok(!rejected.stderr.includes(productionKey));
  const accepted = node(["--input-type=module", "-e", code], {
    VERCEL_ENV: "preview", VITE_CLERK_PUBLISHABLE_KEY: previewKey,
  }, temporary);
  assert.equal(accepted.status, 0, accepted.stderr);
  for (const value of ["", previewKey]) {
    const production = node(["--input-type=module", "-e", code], {
      VERCEL_ENV: "production", VITE_CLERK_PUBLISHABLE_KEY: value,
    }, temporary);
    assert.equal(production.status, 1);
    assert.match(production.stderr, /requires a valid live Clerk/);
    assert.ok(!production.stderr.includes(previewKey));
  }
  const missing = node([path.join(root, "scripts/build-vercel.mjs"), "production"], {
    VERCEL_ENV: "production", VITE_CLERK_PUBLISHABLE_KEY: "",
  }, temporary);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /requires a valid live Clerk/);
});

test("actual production and preview app builds force Cloudflare and embed only their checked fixture key", { timeout: 120000 }, () => {
  for (const [target, publishableKey] of [["production", productionKey], ["preview", previewKey]]) {
    const outDir = path.join(temporary, `dist-${target}`);
    // Use the real project config and app, with isolated output so CI's normal
    // dist stays intact for the existing browser/parity verification tools.
    const code = `import {build} from 'vite'; await build({build:{outDir:${JSON.stringify(outDir)},emptyOutDir:true,copyPublicDir:false}});`;
    const result = node(["--input-type=module", "-e", code], {
      VERCEL_ENV: target, VERCEL_TARGET_ENV: target,
      VITE_ARCADE_BACKEND: "supabase", VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
      ARCADE_VERCEL_BUILD_TARGET: target,
    });
    assert.equal(result.status, 0, `${target} build failed: ${result.stderr}`);
    const assets = path.join(outDir, "assets");
    const javascript = readdirSync(assets).filter(name => name.endsWith(".js"))
      .map(name => readFileSync(path.join(assets, name), "utf8")).join("\n");
    assert.ok(javascript.includes(publishableKey), `${target}: checked key absent`);
    assert.ok(javascript.includes("/api"), `${target}: same-origin API absent`);
    assert.ok(!javascript.includes("afcqhievsmnepxopetkt.supabase.co"), `${target}: legacy backend survived the build`);
    if (target === "preview") assert.doesNotMatch(javascript, /pk_live_[A-Za-z0-9+/_-]{12,}/);
  }
});
