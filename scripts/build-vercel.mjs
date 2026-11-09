import { build, loadEnv } from "vite";
import { checkedBuildSettings } from "./vercel-environment.mjs";

const expectedTarget = process.argv[2];
try {
  if (!["production", "preview"].includes(expectedTarget) || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/build-vercel.mjs production|preview");
  }
  const settings = checkedBuildSettings(process.env, loadEnv("production", process.cwd(), "VITE_"), expectedTarget);
  process.env.ARCADE_VERCEL_BUILD_TARGET = expectedTarget;
  process.env.VITE_ARCADE_BACKEND = "cloudflare";
  // Freeze the validated effective value so a later dotenv read cannot replace it.
  process.env.VITE_CLERK_PUBLISHABLE_KEY = settings.publishableKey;
  await build();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Vercel build validation failed.");
  process.exitCode = 1;
}
