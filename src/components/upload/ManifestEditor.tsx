// Form-based achievement manifest editor (spec §4.6 step 1).
// The manifest becomes the game's approved achievement set on approval —
// games can't invent achievement slugs after review.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { ManifestEntry } from "@/hooks/useSubmissions";

export const MAX_ACHIEVEMENTS = 12;

export const kebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export const SLUG_RE = /^[a-z0-9-]{2,64}$/;

export const manifestEntryValid = (entry: ManifestEntry) =>
  SLUG_RE.test(entry.slug) &&
  entry.name.trim().length >= 2 &&
  entry.name.length <= 60;

const XP_OPTIONS = [10, 25, 50, 100, 150];

const ManifestEditor = ({
  entries,
  onChange,
}: {
  entries: ManifestEntry[];
  onChange: (entries: ManifestEntry[]) => void;
}) => {
  const update = (index: number, patch: Partial<ManifestEntry>) =>
    onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const updateName = (index: number, name: string) => {
    const entry = entries[index];
    // Keep the slug in sync until the creator edits it by hand
    const slugFollowsName = entry.slug === "" || entry.slug === kebab(entry.name);
    update(index, { name, ...(slugFollowsName ? { slug: kebab(name) } : {}) });
  };

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0 && (
        <p className="rounded-xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          No achievements yet. Games fire{" "}
          <code className="font-mono text-xs">ARCADE_ACHIEVEMENT</code> events
          with these slugs — 5–12 recommended.
        </p>
      )}

      {entries.map((entry, i) => {
        const slugBad = entry.slug !== "" && !SLUG_RE.test(entry.slug);
        return (
          <div
            key={i}
            className="rounded-2xl bg-secondary/50 p-3.5 ring-1 ring-foreground/5"
          >
            <div className="grid gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                value={entry.name}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder={`Achievement ${i + 1} name`}
                maxLength={60}
                className="h-10 rounded-xl border-border bg-card"
              />
              <Input
                value={entry.slug}
                onChange={(e) =>
                  update(i, {
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 64),
                  })
                }
                placeholder="slug-the-game-fires"
                maxLength={64}
                className={`h-10 rounded-xl border-border bg-card font-mono text-xs ${
                  slugBad ? "ring-2 ring-destructive" : ""
                }`}
              />
              <div className="flex items-center gap-2">
                <Select
                  value={String(entry.xp)}
                  onValueChange={(v) => update(i, { xp: Number(v) })}
                >
                  <SelectTrigger className="h-10 w-28 rounded-xl border-border bg-card font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {XP_OPTIONS.map((xp) => (
                      <SelectItem key={xp} value={String(xp)} className="rounded-lg font-mono text-xs">
                        {xp} XP
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => onChange(entries.filter((_, j) => j !== i))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove achievement ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Input
              value={entry.hint}
              onChange={(e) => update(i, { hint: e.target.value })}
              placeholder="Locked-state hint players see (optional)"
              maxLength={200}
              className="mt-2.5 h-10 rounded-xl border-border bg-card"
            />
          </div>
        );
      })}

      {entries.length < MAX_ACHIEVEMENTS && (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange([...entries, { slug: "", name: "", hint: "", xp: 25 }])
          }
          className="h-10 w-fit gap-2 rounded-full border-border font-semibold"
        >
          <Plus className="h-4 w-4" />
          Add achievement
          <span className="font-mono text-[10px] text-muted-foreground">
            {entries.length}/{MAX_ACHIEVEMENTS}
          </span>
        </Button>
      )}
    </div>
  );
};

export default ManifestEditor;
