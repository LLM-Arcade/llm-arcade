import { Buffer } from "node:buffer";

export const WORKER_ORIGINS = Object.freeze({
  production: "https://llm-arcade-api.jeffkazzee.workers.dev",
  preview: "https://llm-arcade-api-preview.jeffkazzee.workers.dev",
});

export function deploymentTarget(env) {
  const environment = env.VERCEL_ENV || undefined;
  const target = env.VERCEL_TARGET_ENV || environment;
  if (environment && !["production", "preview", "development"].includes(environment)) {
    throw new Error("Unrecognized Vercel environment; refusing to choose a backend.");
  }
  if (target === "production") {
    if (environment && environment !== "production") throw new Error("Conflicting Vercel deployment targets.");
    return "production";
  }
  if (environment === "production") throw new Error("Conflicting Vercel deployment targets.");
  // Custom environments and local config discovery stay on the preview side.
  return "preview";
}

export function createVercelConfig(env) {
  const target = deploymentTarget(env);
  const worker = WORKER_ORIGINS[target];
  return {
    $schema: "https://openapi.vercel.sh/vercel.json",
    buildCommand: `node scripts/build-vercel.mjs ${target}`,
    rewrites: [
      { source: "/api", destination: `${worker}/api` },
      { source: "/api/:path*", destination: `${worker}/api/:path*` },
      { source: "/(.*)", destination: "/index.html" },
    ],
  };
}

function validPublishableKey(target, value = "") {
  const fail = () => { throw new Error(target === "production"
    ? "Production requires a valid live Clerk publishable key from the production instance."
    : "Non-production builds accept only a Clerk development publishable key or no key for guest play."); };
  if (!value && target !== "production") return "";
  if (typeof value !== "string") return fail();
  const match = /^pk_(live|test)_([A-Za-z0-9+/_-]+={0,2})$/.exec(value);
  if (!match) return fail();
  const bytes = Buffer.from(match[2], "base64");
  const normalized = match[2].replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (bytes.toString("base64").replace(/=+$/, "") !== normalized) return fail();
  const decoded = bytes.toString("utf8");
  if (!decoded.endsWith("$") || decoded.indexOf("$") !== decoded.length - 1) return fail();
  const host = decoded.slice(0, -1);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return fail();
  const development = host.endsWith(".accounts.dev") || host.endsWith(".lcl.dev");
  if (target === "production" ? match[1] !== "live" || development : match[1] !== "test" || !development) return fail();
  return value;
}

export function checkedBuildSettings(env, publicEnv, expectedTarget = env.ARCADE_VERCEL_BUILD_TARGET) {
  const target = deploymentTarget(env);
  if ((expectedTarget || env.VERCEL === "1") && !(env.VERCEL_ENV || env.VERCEL_TARGET_ENV)) {
    throw new Error("Vercel build target context is required.");
  }
  if (expectedTarget && (!["production", "preview"].includes(expectedTarget) || target !== expectedTarget)) {
    throw new Error("The selected Vercel config does not match the build target.");
  }
  return {
    target,
    publishableKey: validPublishableKey(target, publicEnv.VITE_CLERK_PUBLISHABLE_KEY),
    forceCloudflare: Boolean(expectedTarget || env.VERCEL_ENV || env.VERCEL_TARGET_ENV || env.VERCEL === "1"),
  };
}
