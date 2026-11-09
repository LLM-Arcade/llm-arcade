import { createVercelConfig } from "./scripts/vercel-environment.mjs";

// One automatic config for Git deployments. No production destination is
// selected until Vercel identifies the deployment as production.
export const config = createVercelConfig(process.env);
