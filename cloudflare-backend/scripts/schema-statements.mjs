import { readFile } from "node:fs/promises";

export const baseSchemas = ["auth.sql", "application.sql", "community.sql", "progression.sql", "uploads.sql"];
export const allSchemas = [...baseSchemas, "catalog.sql", "achievement-catalog.sql"];

export async function schemaStatements(files = allSchemas) {
  const statements = [];
  for (const file of files) {
    const input = await readFile(new URL("../schema/" + file, import.meta.url), "utf8");
    const content = input.replace(/^--.*$/gm, "");
    // Generated catalogs deliberately use one INSERT per line. String
    // literals contain real semicolons, so splitting these on ';' corrupts data.
    const parts = file.endsWith("catalog.sql") ? content.split("\n") :
      file === "progression.sql" ? input.split(/\n-- statement-breakpoint\n/) : content.split(";");
    for (const part of parts) {
      const sql = part.replace(/^--.*$/gm, "").trim();
      if (sql) statements.push({ sql });
    }
  }
  return statements;
}
