import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const PUBLIC = new URL("public/", ROOT);
const BUDGET = 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".webp", ".jpg", ".jpeg", ".avif", ".gif"]);

const pathOf = (url) => decodeURIComponent(url.pathname).replace(/^\/(?:([A-Za-z]):)/, "$1:");
const publicPath = pathOf(PUBLIC);

const lineup = readFileSync(new URL("src/data/launch-lineup.ts", ROOT), "utf8");
const slugs = [...lineup.matchAll(/\bslug:\s*"([^"]+)"/g)].map((match) => match[1]);
if (!slugs.includes("run-n-gunner")) slugs.push("run-n-gunner");

function imageBytes(directory) {
  if (!existsSync(directory)) return 0;
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) total += imageBytes(file);
    else if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) total += statSync(file).size;
  }
  return total;
}

function embeddedImageBytes(htmlFile) {
  if (!existsSync(htmlFile)) return 0;
  const html = readFileSync(htmlFile, "utf8");
  let total = 0;
  for (const match of html.matchAll(/data:image\/(?:png|webp|jpe?g|avif|gif);base64,([A-Za-z0-9+/=]+)/g)) {
    total += Buffer.byteLength(match[1], "base64");
  }
  return total;
}

function playable(slug) {
  return (
    existsSync(pathOf(new URL(`src/games/${slug}/`, ROOT))) ||
    existsSync(join(publicPath, "games", `${slug}.html`))
  );
}

const rows = slugs.map((slug) => {
  const keyArtFile = join(publicPath, "assets", "games", `${slug}.png`);
  const keyArt = existsSync(keyArtFile) ? statSync(keyArtFile).size : 0;
  const looseGameplay = imageBytes(join(publicPath, "assets", "games", slug));
  const embeddedGameplay = embeddedImageBytes(join(publicPath, "games", `${slug}.html`));
  const gameplay = looseGameplay + embeddedGameplay;
  const total = keyArt + gameplay;

  return {
    slug,
    state: playable(slug) ? "playable" : "poster-only",
    "gameplay KiB": (gameplay / 1024).toFixed(1),
    "key art KiB": (keyArt / 1024).toFixed(1),
    "total KiB": (total / 1024).toFixed(1),
    budget: total <= BUDGET ? "PASS" : "OVER",
    bytes: total,
  };
});

console.table(rows.map(({ bytes: _bytes, ...row }) => row));

const over = rows.filter((row) => row.bytes > BUDGET);
console.log(
  `${rows.length} launch-visible games; ${rows.length - over.length} at or below 1 MiB; ${over.length} over budget.`,
);

if (process.argv.includes("--strict") && over.length > 0) process.exitCode = 1;
