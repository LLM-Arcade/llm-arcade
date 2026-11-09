import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("../catalog/reconstructed.json", import.meta.url), "utf8"));
const sources = {}, rows = [];
const title = slug => slug.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
async function source(path) {
  const text = await readFile(new URL(path, root), "utf8");
  sources[path] = createHash("sha256").update(text).digest("hex");
  return text;
}
// Parse only literal tuples from the reviewed seed's VALUES block. Never
// evaluate or replay historical PostgreSQL statements against a new database.
function tuples(input) {
  const token = /\s*('(?:''|[^'])*'|\d+|[(),])/gy;
  let offset = 0, row = null, expect = "open";
  const result = [];
  while (offset < input.length && input.slice(offset).trim()) {
    token.lastIndex = offset;
    const next = token.exec(input);
    if (!next) throw new Error("Nonliteral achievement definition");
    const value = next[1]; offset = token.lastIndex;
    if (expect === "open" && value === "(") { row = []; expect = "value"; }
    else if (expect === "value" && (/^'/.test(value) || /^\d+$/.test(value))) {
      row.push(value[0] === "'" ? value.slice(1, -1).replace(/''/g, "'") : Number(value)); expect = "separator";
    } else if (expect === "separator" && value === ",") expect = "value";
    else if (expect === "separator" && value === ")") { result.push(row); row = null; expect = "between"; }
    else if (expect === "between" && value === ",") expect = "open";
    else throw new Error("Malformed achievement literals");
  }
  if (expect !== "between") throw new Error("Incomplete achievement literals");
  return result;
}
for (const game of catalog.games) {
  let definitions, basis;
  try {
    const text = await source(`db/seed-${game.slug}.sql`);
    const block = /CROSS JOIN\s*\(\s*VALUES([\s\S]*?)\) AS a\(slug, name, description, hint, xp, sort_order\)/.exec(text);
    if (!block) throw new Error("Unrecognized SQL achievement block: " + game.slug);
    definitions = tuples(block[1]).map(row => {
      if (row.length !== 6) throw new Error("Unexpected achievement columns");
      return Object.fromEntries(["slug", "name", "description", "hint", "xp", "sort_order"].map((key, index) => [key, row[index]]));
    });
    basis = "source-sql";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (game.track === "B") {
      const html = await source("public" + game.html_path);
      const block = /<script type="application\/json" id="arcade-manifest">([\s\S]*?)<\/script>/.exec(html);
      if (block) definitions = JSON.parse(block[1]).achievements.map((item, i) => ({
        slug: item.id, name: item.name, description: item.hint, hint: item.hint,
        xp: item.xp ?? (game.slug === "flap-hero" && item.id === "first-flight" ? 10 : 25), sort_order: i + 1,
      }));
      else {
        const ids = [...html.matchAll(/(?:fire\(|ach:\s*)["']([a-z][a-z0-9-]+)["']/g)].map(match => match[1]);
        definitions = [...new Set(ids)].map((slug, i) => ({ slug, name: title(slug), description: "Complete this in-game challenge.", hint: "Play this game to discover the challenge.", xp: 25, sort_order: i + 1 }));
      }
    } else {
      const engine = await source(`src/games/${game.slug}/engine.ts`);
      definitions = [...new Set([...engine.matchAll(/this\.achieve\("([a-z0-9-]+)"\)/g)].map(match => match[1]))]
        .map((slug, i) => ({ slug, name: title(slug), description: "Complete this in-game challenge.", hint: "Play this game to discover the challenge.", xp: 25, sort_order: i + 1 }));
    }
    basis = "source-events-with-new-fallback-metadata";
  }
  if (!definitions?.length) throw new Error("No approved achievement events reconstructed: " + game.slug);
  for (const entry of definitions) {
    if (!/^[a-z0-9-]{1,64}$/.test(entry.slug) || !Number.isSafeInteger(entry.xp) || entry.xp < 0 || entry.xp > 1000) throw new Error("Invalid achievement");
    rows.push({ id: `reconstructed:${game.slug}:${entry.slug}`, game_id: game.id, ...entry, basis });
  }
}
const literal = value => typeof value === "number" ? String(value) : "'" + String(value).replace(/'/g, "''") + "'";
const columns = ["id", "game_id", "slug", "name", "description", "hint", "xp", "sort_order"];
await writeFile(new URL("../catalog/achievements.json", import.meta.url), JSON.stringify({
  historical_data_recovered: false,
  notes: "SQL definitions retained verbatim where present. Seven games lack complete source seed metadata; event IDs are retained but missing names/hints/XP are new fallback configuration (25 XP, except documented First Flight 10). Badge replacement rules are also new configuration; review before launch.",
  sources, achievements: rows,
}, null, 2) + "\n");
await writeFile(new URL("../schema/achievement-catalog.sql", import.meta.url), "-- New empty Arcade database only. Reconstructed content, not recovered awards.\n" +
  rows.map(row => `INSERT INTO achievements (${columns.join(", ")}) VALUES (${columns.map(key => literal(row[key])).join(", ")});`).join("\n") + "\n");
console.log(`Reconstructed ${rows.length} achievement definitions for ${catalog.games.length} games. No database or original files changed.`);
