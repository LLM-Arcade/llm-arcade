import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "browser"],
  target: "es2022",
  external: ["cloudflare:workers"],
});
