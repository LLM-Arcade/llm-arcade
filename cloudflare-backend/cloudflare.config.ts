import { bindings, defineConfig } from "cf/config";

// The owner confirmed Workers Free. Always bind a reviewed Arcade database ID;
// never let a deployment provision an unexpected resource or activate billing.
export default defineConfig(({ mode }) => {
  if (mode !== "preview" && mode !== "production") throw new Error("Choose an explicit preview or production mode.");
  if (!process.env.ARCADE_D1_ID || !process.env.ARCADE_APP_ORIGIN) throw new Error("Bind a reviewed Arcade database ID and exact HTTPS app origin explicitly.");
  if (!process.env.ARCADE_APP_ORIGIN.startsWith("https://")) throw new Error("The Arcade app origin must use HTTPS.");
  return ({
  worker: {
    name: mode === "preview" ? "llm-arcade-api-preview" : "llm-arcade-api",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-08",
    compatibilityFlags: ["nodejs_compat"],
    env: {
      ARCADE_DB: bindings.d1({
        name: mode === "preview" ? "llm-arcade-preview" : "llm-arcade",
        id: process.env.ARCADE_D1_ID,
      }),
      APP_ORIGIN: bindings.text(process.env.ARCADE_APP_ORIGIN ?? "https://www.llmarcade.fun"),
      CLERK_PUBLISHABLE_KEY: bindings.text(process.env.CLERK_PUBLISHABLE_KEY ?? ""),
      CLERK_ISSUER: bindings.text(process.env.CLERK_ISSUER ?? ""),
      CLERK_SECRET_KEY: bindings.secret(),
      CLERK_JWT_KEY: bindings.secret(),
      INITIAL_ADMIN_EMAIL: bindings.secret(),
    },
  },
});
});
