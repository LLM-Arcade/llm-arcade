import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { LAUNCH_LINEUP } from "../../src/data/launch-lineup.ts";

// Reconstruct content only. No original IDs, publication state, players, scores,
// play counts, uploads or storage objects can be inferred from source files.
const root = new URL("../../", import.meta.url);
const sources = {};
async function source(path) {
  const value = await readFile(new URL(path, root), "utf8");
  sources[path] = createHash("sha256").update(value).digest("hex");
  return value;
}
const fallback = {
  "munch-maze": { genre: "Maze chase", controls: "Arrows or WASD to move; swipe on touch. P pauses, M mutes.", score_cap: 1000000 },
  "rune-ruin": { genre: "Dungeon crawler", controls: "Arrows, WASD or vi keys to move; Q uses a tonic. Touch controls are available.", score_cap: 200000 },
  "starfall-squadron": { genre: "Space shooter", controls: "Arrows or AD to move, Space to fire. Touch controls are available. P pauses, M mutes.", score_cap: 1000000 },
  "flap-hero": { genre: "Flying", controls: "Space, click or tap to flap. P pauses, M mutes.", score_cap: 1000000 },
  "rockbuster": { genre: "Space shooter", controls: "Arrows or WASD to steer, Space to fire. P pauses, M mutes.", score_cap: 1000000 },
  "boulder-rush": { genre: "Puzzle", controls: "Arrows or WASD to dig and move. P pauses. Touch controls are available.", score_cap: 1000000 },
  "trailbound": { genre: "Trail survival", controls: "Use the on-screen choices to manage the journey. P pauses.", score_cap: 1000000 },
};
const games = new Map(LAUNCH_LINEUP.map(row => [row.slug, {
  id: "reconstructed:" + row.slug, slug: row.slug, title: row.title, era: row.era,
  genre: fallback[row.slug]?.genre ?? "", description: row.alt,
  controls: fallback[row.slug]?.controls ?? "See the game screen for controls.",
  ai_credit: "AI agents", track: "A", status: "published", featured: row.featured ? 1 : 0,
  play_count: 0, score_label: "Score", score_cap: fallback[row.slug]?.score_cap ?? 1000000,
  html_path: null, art_url: `/assets/games/${row.slug}.png`, created_by: null,
  created_at: "2026-11-08T00:00:00.000Z", data_origin: "reconstructed",
}]));
await source("src/data/launch-lineup.ts");
await source("HANDOFF.md");
const registry = await source("src/games/registry.ts");
for (const name of (await readdir(new URL("db/", root))).filter(name => /^seed-.*\.sql$/.test(name)).sort()) {
  const text = await source("db/" + name);
  let match = /INSERT INTO games \(([^)]+)\)\s*VALUES\s*\(([\s\S]*?)\)\s*ON CONFLICT/.exec(text);
  if (!match && name === "seed-hyper-circuit.sql") {
    const update = /UPDATE games\s+SET\s+([\s\S]*?)WHERE slug = 'hyper-circuit';/.exec(text);
    if (!update) throw new Error("Missing reviewed Hyper Circuit update");
    const fields = [], entries = [];
    const assignments = /\s*(\w+)\s*=\s*('(?:''|[^'])*'|\d+)\s*(?:,|$)/gy;
    let offset = 0;
    while (offset < update[1].length) {
      assignments.lastIndex = offset;
      const assignment = assignments.exec(update[1]);
      if (!assignment) throw new Error("Unrecognized Hyper Circuit assignment");
      fields.push(assignment[1]); entries.push(assignment[2]); offset = assignments.lastIndex;
    }
    match = ["", "slug, " + fields.join(", "), "'hyper-circuit', " + entries.join(", ")];
  }
  if (!match) throw new Error("Unrecognized game metadata in " + name);
  const columns = match[1].split(",").map(x => x.trim());
  const input = match[2];
  const values = [];
  let offset = 0;
  while (offset < input.length) {
    const rest = input.slice(offset);
    const item = /^\s*(?:'((?:''|[^'])*)'|(\d+))\s*(,|$)/.exec(rest);
    if (!item) throw new Error("Only source string/number literals are allowed: " + name);
    values.push(item[1] === undefined ? Number(item[2]) : item[1].replace(/''/g, "'"));
    offset += item[0].length;
  }
  if (values.length !== columns.length || columns.some(x => !["slug", "title", "description", "era", "genre", "controls", "track", "status", "score_cap"].includes(x))) throw new Error("Unexpected game columns: " + name);
  const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  const old = games.get(row.slug);
  const base = old ?? { id: "reconstructed:" + row.slug, slug: row.slug, featured: 0, play_count: 0,
    score_label: "Score", html_path: null, art_url: `/assets/games/${row.slug}.png`, created_by: null,
    created_at: "2026-11-08T00:00:00.000Z", data_origin: "reconstructed", ai_credit: "AI agents" };
  // The source launch wall plus HANDOFF's explicit published Run 'n Gunner
  // select the fresh lineup. Lastwatch retains its outstanding playtest gate.
  games.set(row.slug, { ...base, ...row, status: old || row.slug === "run-n-gunner" ? "published" : "coming_soon" });
}
for (const game of games.values()) {
  if (!registry.includes(`"${game.slug}"`) && !registry.includes(`  ${game.slug}:`)) {
    const path = `public/games/${game.slug}.html`;
    await source(path);
    game.track = "B";
    game.html_path = `/games/${game.slug}.html`;
  }
  try { await access(new URL("public" + game.art_url, root)); }
  catch { game.art_url = "/placeholder.svg"; }
}
const rows = [...games.values()].sort((a, b) => a.slug.localeCompare(b.slug));
if (rows.length !== 15 || rows.filter(row => row.status === "published").length !== 14) throw new Error("Review a changed lineup before generating seeds");
const columns = Object.keys(rows[0]);
const literal = value => value === null ? "NULL" : typeof value === "number" ? String(value) : "'" + String(value).replace(/'/g, "''") + "'";
await mkdir(new URL("../catalog/", import.meta.url), { recursive: true });
await writeFile(new URL("../catalog/reconstructed.json", import.meta.url), JSON.stringify({
  data_origin: "reconstructed", historical_data_recovered: false,
  notes: "Fresh source-based lineup; seven fallback score caps/control descriptions are new configuration, not recovered database values. Original IDs, accounts, scoreboards, uploads and publication state remain unknown.",
  sources, games: rows,
}, null, 2) + "\n");
await writeFile(new URL("../schema/catalog.sql", import.meta.url),
  "-- NEW EMPTY ARCADE DATABASE ONLY. Source-based catalog, not recovered history.\n" +
  rows.map(row => `INSERT INTO games (${columns.join(", ")}) VALUES (${columns.map(key => literal(row[key])).join(", ")});`).join("\n") + "\n");
console.log(`Reconstructed ${rows.length} games (${rows.filter(row => row.status === "published").length} initial playable, 1 source-gated). No source assets or database were modified.`);
