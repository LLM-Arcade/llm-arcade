import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import SiteFooter from "@/components/layout/SiteFooter";
import { ArrowLeft } from "lucide-react";

// Creator guides: how to submit a cabinet, how to build one with AI
// agents, and what gets approved. Written as documents, not FAQ chips,
// because creators read these start to finish.

const guides = [
  {
    id: "submit",
    title: "Submitting a game",
    lead: "The arcade takes community cabinets through an upload wizard and a human review. Here is the whole path.",
    blocks: [
      {
        h: "What a submission is",
        p: [
          "One self-contained HTML file, 5 MB or smaller. Everything lives inside it: game code, styles, and art inlined as data URIs. The file runs in a sandboxed frame on the site, so it cannot load outside assets or touch anything beyond its own square of the page.",
          "Alongside the file you provide a name, a short description, an era tag, square key art (a PNG tile shown on the game floor), and an achievement manifest: up to 12 achievements with kebab-case slugs, names, and hints.",
        ],
      },
      {
        h: "The wizard",
        p: [
          "Upload from your account at /upload. Three steps: metadata and the manifest editor, then your HTML file and key art, then a test flight that boots your game right there in the wizard and checks that it speaks the arcade protocol. Submissions need a passing test flight before they enter the queue.",
          "You can have up to three submissions pending at once. New versions of an approved game go through the same wizard and keep your art unless you replace it.",
        ],
      },
      {
        h: "Review",
        p: [
          "A human plays your build in the same sandbox players get, compares your manifest against the live one if this is an update, and either approves or sends it back with a written reason. Approved games publish with your creator credit and your achievements go live exactly as seeded.",
        ],
      },
    ],
  },
  {
    id: "build",
    title: "Building a game with AI agents",
    lead: "Every cabinet on this floor was coded by an AI agent. The recipe is repeatable and it works with any capable coding agent, including the ones inside Dyad.",
    blocks: [
      {
        h: "Pick one loop and originalize it",
        p: [
          "The games that work here take one classic arcade loop, give it an original name, original art, and original tuning, and go deep instead of wide. Endless escalation beats a short fixed campaign: loop your stages with a ramp and let the run end on a real fail state.",
          "Give your agent a written brief: the loop, the controls, the scoring, the achievements, and the balance targets. Ask it to put every balance number in one block at the top of the script so you can tune without hunting.",
        ],
      },
      {
        h: "Speak the arcade protocol",
        p: [
          "Your game talks to the site with three postMessage calls. Send ARCADE_READY once your assets load (send it even if they fail, so the player never hangs). Send ARCADE_ACHIEVEMENT with a manifest slug when one unlocks. Send ARCADE_SCORE exactly once at game over, with the final score and a small stats object.",
          "House standards players expect: P pauses, M mutes, the game pauses itself when the tab hides, and it either supports touch or declares itself keyboard-only in its description.",
        ],
      },
      {
        h: "Make the agent prove it",
        p: [
          "Ask your agent to write a scripted playtest that runs the game logic headless: a deliberately bad player should survive long enough to have fun, every achievement should be reachable, and the score threshold for your hardest achievement should come from measured runs, not a guess. This is how the in-house cabinets are tuned, and it shows in review.",
          "Keep art light. Flat colors compress well; noise and gradients bloat a file fast. Most cabinets here ship all their art in well under a megabyte.",
        ],
      },
    ],
  },
  {
    id: "standards",
    title: "What gets approved",
    lead: "The bar is simple: original, playable, and fit for everyone on the floor.",
    blocks: [
      {
        h: "Original only",
        p: [
          "Homages, never copies. No trademarked names, characters, sprites, or music. If your game tips its hat to a classic, it does so with an invented name and art of its own.",
        ],
      },
      {
        h: "Fit for the floor",
        p: [
          "No drug content. No sexual content. No racist, hateful, or harassing content. No real-money gambling. This is an arcade, not an edgelord gallery; if you would not put it on a cabinet in a family arcade, do not put it here.",
        ],
      },
      {
        h: "Playable and honest",
        p: [
          "A brand-new player should get a real run, not a ten-second death. Failure should be legible: players deserve to know what killed them. Scores submit once per run and stay under your declared cap. Games that shovel points or hide their rules get sent back.",
        ],
      },
    ],
  },
];

const Guides = () => {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the arcade
        </Link>
        <h1 className="fade-up font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Creator guides
        </h1>
        <p className="fade-up mt-2 text-muted-foreground" style={{ animationDelay: "80ms" }}>
          Build a cabinet with an AI agent, submit it, and get it on the
          floor.
        </p>

        <div className="mt-10 space-y-12">
          {guides.map((guide, gi) => (
            <section
              key={guide.id}
              id={guide.id}
              className="fade-up scroll-mt-24"
              style={{ animationDelay: `${160 + gi * 80}ms` }}
            >
              <h2 className="font-display text-2xl font-bold tracking-tight">{guide.title}</h2>
              <p className="mt-1 text-muted-foreground">{guide.lead}</p>
              <div className="mt-5 space-y-6">
                {guide.blocks.map((block) => (
                  <div key={block.h} className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
                    <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-olive">
                      {block.h}
                    </h3>
                    <div className="space-y-3">
                      {block.p.map((para, i) => (
                        <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                          {para}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="fade-up mt-12 rounded-2xl bg-olive/10 p-5 ring-1 ring-foreground/10" style={{ animationDelay: "480ms" }}>
          <p className="text-sm text-muted-foreground">
            Ready?{" "}
            <Link to="/upload" className="font-medium text-terra hover:underline">
              Open the upload wizard
            </Link>{" "}
            or read the{" "}
            <Link to="/faq" className="font-medium text-terra hover:underline">
              FAQ
            </Link>{" "}
            first.
          </p>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
};

export default Guides;
