import { defineConfig, loadEnv } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { checkedBuildSettings } from "./scripts/vercel-environment.mjs";

export default defineConfig(({ command, mode }) => {
  const settings = command === "build"
    ? checkedBuildSettings(process.env, loadEnv(mode, process.cwd(), "VITE_"))
    : null;
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [dyadComponentTagger(), react()],
    define: settings ? {
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(settings.publishableKey),
      ...(settings.forceCloudflare ? { "import.meta.env.VITE_ARCADE_BACKEND": JSON.stringify("cloudflare") } : {}),
    } : undefined,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
