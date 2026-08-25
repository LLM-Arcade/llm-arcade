// /upload — 3-step wizard (spec §4.6): metadata + manifest → files →
// test flight in the production sandbox. Submissions land in the admin
// review queue as `pending`.

import { useMemo, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import ManifestEditor, {
  kebab,
  manifestEntryValid,
} from "@/components/upload/ManifestEditor";
import TestFlight, { type TestFlightResult } from "@/components/upload/TestFlight";
import {
  useSubmitGame,
  type GameSubmission,
  type ManifestEntry,
  type SubmissionMeta,
} from "@/hooks/useSubmissions";
import { ERAS } from "@/data/launch-lineup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError } from "@/utils/toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCode2,
  ImageIcon,
  Loader2,
  Rocket,
} from "lucide-react";

const GAME_SLUG_RE = /^[a-z0-9-]{2,50}$/;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_ART_BYTES = 2 * 1024 * 1024;

const STEPS = ["Metadata", "Files", "Test flight"] as const;

const fieldClass = "h-11 rounded-xl border-border bg-card";

const emptyMeta = (): SubmissionMeta => ({
  slug: "",
  title: "",
  era: "Mobile",
  genre: "",
  description: "",
  controls: "",
  ai_credit: "",
  score_label: "Score",
  score_cap: 100000,
});

const Upload = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // "Upload new version" from My Uploads carries the previous submission
  const from = (location.state as { from?: GameSubmission } | null)?.from;
  const gameId = from?.game_id ?? null;
  const version = from ? from.version + 1 : 1;

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<SubmissionMeta>(() =>
    from
      ? {
          slug: from.slug,
          title: from.title,
          era: from.era,
          genre: from.genre,
          description: from.description,
          controls: from.controls,
          ai_credit: from.ai_credit,
          score_label: from.score_label,
          score_cap: from.score_cap,
        }
      : emptyMeta(),
  );
  const [manifest, setManifest] = useState<ManifestEntry[]>(from?.manifest ?? []);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [htmlText, setHtmlText] = useState("");
  const [artFile, setArtFile] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const [flight, setFlight] = useState<TestFlightResult | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  const submit = useSubmitGame();

  const setField = <K extends keyof SubmissionMeta>(key: K, value: SubmissionMeta[K]) =>
    setMeta((m) => ({ ...m, [key]: value }));

  const setTitle = (title: string) => {
    setMeta((m) => ({
      ...m,
      title,
      // Slug follows the title until edited by hand (and never for versions)
      ...(gameId === null && (m.slug === "" || m.slug === kebab(m.title).slice(0, 50))
        ? { slug: kebab(title).slice(0, 50) }
        : {}),
    }));
  };

  const manifestSlugs = useMemo(() => manifest.map((e) => e.slug), [manifest]);
  const manifestValid =
    manifest.every(manifestEntryValid) &&
    new Set(manifestSlugs).size === manifest.length;

  const step1Valid =
    meta.title.trim().length >= 2 &&
    meta.title.length <= 60 &&
    GAME_SLUG_RE.test(meta.slug) &&
    meta.ai_credit.trim().length >= 2 &&
    meta.score_label.trim().length >= 1 &&
    meta.score_cap >= 1 &&
    meta.score_cap <= 1_000_000_000 &&
    manifestValid;

  const step2Valid = !!htmlFile && (!!artFile || gameId !== null);
  const flightPassed = !!flight?.ready && !!flight?.score;

  const pickHtml = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.html?$/i.test(file.name)) {
      showError("The game must be a single self-contained .html file.");
      return;
    }
    if (file.size > MAX_HTML_BYTES) {
      showError("Game file is over the 5 MB Track-B cap.");
      return;
    }
    setHtmlFile(file);
    setHtmlText(await file.text());
    setFlight(null);
  };

  const pickArt = (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      showError("Key art must be a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_ART_BYTES) {
      showError("Key art is over 2 MB — export it smaller.");
      return;
    }
    if (artPreview) URL.revokeObjectURL(artPreview);
    setArtFile(file);
    setArtPreview(URL.createObjectURL(file));
  };

  const continueFromMetadata = async () => {
    if (gameId !== null) {
      setStep(1);
      return;
    }
    // New game: make sure the slug isn't taken or already queued
    setSlugChecking(true);
    try {
      const [{ data: existingGame }, { data: pendingSub }] = await Promise.all([
        supabase.from("games").select("id").eq("slug", meta.slug).maybeSingle(),
        supabase
          .from("game_submissions")
          .select("id")
          .eq("slug", meta.slug)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle(),
      ]);
      if (existingGame) {
        showError(`The slug "${meta.slug}" is already taken by another cabinet.`);
        return;
      }
      if (pendingSub) {
        showError(`A submission for "${meta.slug}" is already in the review queue.`);
        return;
      }
      setStep(1);
    } finally {
      setSlugChecking(false);
    }
  };

  const handleSubmit = () => {
    submit.mutate(
      {
        meta: {
          ...meta,
          title: meta.title.trim(),
          ai_credit: meta.ai_credit.trim(),
          score_label: meta.score_label.trim(),
        },
        manifest,
        checklist: {
          ready: !!flight?.ready,
          score: !!flight?.score,
          achievement: !!flight?.achievement,
          save: !!flight?.save,
        },
        htmlFile: htmlFile!,
        artFile,
        gameId,
        version,
      },
      {
        onSuccess: () => setDone(true),
        onError: (error: Error) => showError(error.message),
      },
    );
  };

  if (!loading && !user) {
    return <Navigate to={authCta("/upload").to} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {done ? (
          <div className="fade-up mx-auto max-w-md rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-foreground/10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-olive/15">
              <Check className="h-7 w-7 text-olive" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
              Submitted for review
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{meta.title}</span>{" "}
              {gameId ? `v${version}` : ""} is in the queue. An operator will
              review it against the acceptance checklist — you'll see the
              verdict (and any reasons) in My Uploads.
            </p>
            <Button asChild className="mt-5 h-11 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90">
              <Link to="/uploads">Go to My Uploads</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="fade-up">
              <p className="font-mono text-xs tracking-widest text-muted-foreground">
                {gameId ? `NEW VERSION · V${version}` : "SUBMIT A CABINET"}
              </p>
              <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                {gameId ? `Update ${meta.title}` : "Upload a game"}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                One self-contained HTML file, talking Arcade SDK postMessages,
                sandboxed like every uploaded cabinet. Review is human; the
                checklist is not. First time?{" "}
                <Link to="/guides" className="font-medium text-terra hover:underline">
                  Read the creator guides
                </Link>
                .
              </p>
            </div>

            {/* Progress dots */}
            <div className="fade-up mt-6 flex items-center gap-2" style={{ animationDelay: "60ms" }}>
              {STEPS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-[10px] tracking-widest transition-colors ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-olive/15 text-olive"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                  {label.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="fade-up mt-6" style={{ animationDelay: "120ms" }}>
              {step === 0 && (
                <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10 sm:p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-title" className="text-sm font-semibold">Title</Label>
                      <Input
                        id="up-title"
                        value={meta.title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Brickstorm"
                        maxLength={60}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-slug" className="text-sm font-semibold">
                        Slug{" "}
                        <span className="font-mono text-[10px] font-normal text-muted-foreground">
                          /game/…
                        </span>
                      </Label>
                      <Input
                        id="up-slug"
                        value={meta.slug}
                        onChange={(e) =>
                          setField(
                            "slug",
                            e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50),
                          )
                        }
                        disabled={gameId !== null}
                        placeholder="brickstorm"
                        className={`${fieldClass} font-mono text-sm`}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-sm font-semibold">Era</Label>
                      <Select value={meta.era} onValueChange={(v) => setField("era", v as SubmissionMeta["era"])}>
                        <SelectTrigger className={fieldClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {ERAS.map((era) => (
                            <SelectItem key={era} value={era} className="rounded-lg">
                              {era}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-genre" className="text-sm font-semibold">
                        Genre <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="up-genre"
                        value={meta.genre}
                        onChange={(e) => setField("genre", e.target.value)}
                        placeholder="Block breaker"
                        maxLength={40}
                        className={fieldClass}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="up-desc" className="text-sm font-semibold">Description</Label>
                    <Textarea
                      id="up-desc"
                      value={meta.description}
                      onChange={(e) => setField("description", e.target.value)}
                      placeholder="What's the loop? Why will players chase the board?"
                      maxLength={2000}
                      rows={3}
                      className="rounded-xl border-border bg-card"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-controls" className="text-sm font-semibold">Controls</Label>
                      <Input
                        id="up-controls"
                        value={meta.controls}
                        onChange={(e) => setField("controls", e.target.value)}
                        placeholder="Tap / click / space to flap"
                        maxLength={300}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-credit" className="text-sm font-semibold">AI credit (required)</Label>
                      <Input
                        id="up-credit"
                        value={meta.ai_credit}
                        onChange={(e) => setField("ai_credit", e.target.value)}
                        placeholder="Claude Code · GPT-5 Codex · Dyad…"
                        maxLength={80}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-label" className="text-sm font-semibold">Score label</Label>
                      <Input
                        id="up-label"
                        value={meta.score_label}
                        onChange={(e) => setField("score_label", e.target.value)}
                        placeholder="Score · Pipes · Depth…"
                        maxLength={20}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="up-cap" className="text-sm font-semibold">
                        Score cap{" "}
                        <span className="text-xs font-normal text-muted-foreground">(anti-cheat sanity)</span>
                      </Label>
                      <Input
                        id="up-cap"
                        type="number"
                        min={1}
                        max={1_000_000_000}
                        value={meta.score_cap}
                        onChange={(e) => setField("score_cap", Number(e.target.value))}
                        className={`${fieldClass} font-mono`}
                      />
                    </div>
                  </div>

                  <div>
                    <h2 className="text-sm font-semibold">Achievement manifest</h2>
                    <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                      Approved at review — the game can only unlock slugs listed here.
                    </p>
                    <ManifestEditor entries={manifest} onChange={setManifest} />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={() => void continueFromMetadata()}
                      disabled={!step1Valid || slugChecking}
                      className="h-11 gap-2 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90"
                    >
                      {slugChecking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      Continue to files
                    </Button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-foreground/10 sm:p-6">
                  <label
                    className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-colors ${
                      htmlFile ? "border-olive/50 bg-olive/5" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".html,.htm,text/html"
                      className="sr-only"
                      onChange={(e) => void pickHtml(e.target.files?.[0])}
                    />
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                      <FileCode2 className="h-6 w-6 text-foreground/70" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {htmlFile ? htmlFile.name : "Game file — one .html, everything inlined"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {htmlFile
                          ? `${(htmlFile.size / 1024 / 1024).toFixed(2)} MB of 5 MB · click to replace`
                          : "Max 5 MB. Sprites as data URIs (sandbox can't read external images back)."}
                      </p>
                    </div>
                    {htmlFile && <Check className="ml-auto h-5 w-5 shrink-0 text-olive" />}
                  </label>

                  <label
                    className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed p-5 transition-colors ${
                      artFile ? "border-olive/50 bg-olive/5" : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => pickArt(e.target.files?.[0])}
                    />
                    {artPreview ? (
                      <img
                        src={artPreview}
                        alt="Key art preview"
                        className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-1 ring-foreground/10"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary">
                        <ImageIcon className="h-6 w-6 text-foreground/70" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {artFile
                          ? artFile.name
                          : `Key art — square${gameId !== null ? " (optional: keeps current art)" : ""}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {artFile
                          ? `${(artFile.size / 1024).toFixed(0)} KB · click to replace`
                          : "PNG/JPEG/WebP, max 2 MB. AI-generated original — flat vector, earthy palette, no text."}
                      </p>
                    </div>
                    {artFile && <Check className="ml-auto h-5 w-5 shrink-0 text-olive" />}
                  </label>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setStep(0)}
                      className="h-11 gap-2 rounded-full border-border font-semibold"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(2)}
                      disabled={!step2Valid}
                      className="h-11 gap-2 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90"
                    >
                      <ArrowRight className="h-4 w-4" />
                      Continue to test flight
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-5">
                  <TestFlight
                    html={htmlText}
                    manifestSlugs={manifestSlugs}
                    onResult={setFlight}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="h-11 gap-2 rounded-full border-border font-semibold"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!flightPassed || submit.isPending}
                      className="h-12 gap-2 rounded-full bg-primary px-7 font-display text-base font-bold hover:bg-primary/90"
                    >
                      {submit.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Rocket className="h-4 w-4" />
                      )}
                      Submit for review
                    </Button>
                  </div>
                  {!flightPassed && (
                    <p className="text-right text-xs text-muted-foreground">
                      Submit unlocks once the game loads and sends a real score event.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Upload;
