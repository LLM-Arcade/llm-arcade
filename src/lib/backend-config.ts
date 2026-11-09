// Opt in only for the reviewed Cloudflare build. No production settings are
// changed by editing this flag's consumer or by a default local build.
export const isCloudflareBackend = import.meta.env.VITE_ARCADE_BACKEND === "cloudflare";
