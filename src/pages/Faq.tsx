import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import SiteFooter from "@/components/layout/SiteFooter";
import { ArrowLeft } from "lucide-react";

const groups = [
  {
    id: "project",
    title: "The Project",
    items: [
      {
        id: "what-is-this",
        q: "What is Neon Arcade?",
        a: "A social arcade where every game — and the platform itself — was built entirely by AI agents. 30 games at launch, spanning arcade cabinets, Atari, NES, SNES, Genesis, Amiga, DOS, PS1/PS2, and mobile eras. High scores, achievements, badges, streaks, and seasonal prizes keep the coin slot warm.",
      },
      {
        id: "who-built-it",
        q: "Who actually built the games?",
        a: "AI coding agents — Dyad built the platform and the flagship in-repo games; external agents like Claude Code and Codex build self-contained HTML games submitted through the same upload pipeline community creators use. Each game page credits the agent that made it.",
      },
      {
        id: "ip-policy",
        q: "Are these clones of classic games?",
        a: "They're homages. Every game uses an original name, original art, and original audio — 'inspired by' classics, never copies. No trademarked names, sprites, or music appear anywhere on the platform.",
      },
    ],
  },
  {
    id: "playing",
    title: "Playing",
    items: [
      {
        id: "accounts",
        q: "Do I need an account to play?",
        a: "No — anyone can play. You'll need to sign in (Google) to claim scores on leaderboards, unlock achievements, earn badges, and keep a streak. If you finish a run as a guest, we hold your score so you can claim it right after signing in.",
      },
      {
        id: "scores",
        q: "How do leaderboards work?",
        a: "Every game has daily, weekly, and all-time boards. Your best run is pinned to your row. Each week one game becomes the Spotlight — its weekly winner earns a seasonal badge and a homepage feature.",
      },
      {
        id: "progression",
        q: "What are XP, levels, and streaks?",
        a: "Score submissions, achievement unlocks, and daily logins grant XP that levels you from 1 to 50. Levels unlock cosmetics: avatar frames, banner patterns, and chat name colors. Playing daily builds a streak — at level 10 you earn a freeze token that saves your streak if you miss a day.",
      },
    ],
  },
  {
    id: "uploading",
    title: "Uploading Games",
    items: [
      {
        id: "how-to-upload",
        q: "Can I submit my own game?",
        a: "Yes. Games are single self-contained HTML files (≤5 MB) that talk to the platform through the Arcade SDK — a simple postMessage protocol for scores, achievements, and save data. The upload wizard validates your game live before you submit.",
      },
      {
        id: "review",
        q: "What's the review process?",
        a: "Submissions enter a moderated queue. Reviewers play your game in the sandbox, check the achievement manifest, and approve or reject with a written reason. Uploading a new version re-enters review.",
      },
      {
        id: "content-policy",
        q: "What's the content policy?",
        a: "Original names, art, and audio only. No trademarked material, no offensive content, no external network calls. Games run fully sandboxed and can only communicate through the SDK.",
      },
    ],
  },
  {
    id: "playtesting",
    title: "Playtesting",
    items: [
      {
        id: "playtest-perks",
        q: "What do playtesters get?",
        a: "Early access before launch, direct input on the games, and the exclusive Playtester badge — a neon-rarity trophy that will never be obtainable again after launch.",
      },
      {
        id: "playtest-apply",
        q: "How do I apply?",
        a: "Fill out the short form on the Playtest page. We approve testers in waves; you'll get an email when your access opens.",
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    items: [
      {
        id: "data",
        q: "What data do you store?",
        a: "Your email (waitlist/account), profile info you choose to set, and gameplay data: scores, achievements, and activity. Uploaded games run in a sandbox with no access to your cookies or storage.",
      },
    ],
  },
];

const Faq = () => {
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
          className="mb-10 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-neon-cyan"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the arcade
        </Link>
        <h1 className="fade-up font-display text-[40px] font-bold leading-tight">
          FAQ
        </h1>
        <p className="fade-up mt-2 text-muted-foreground" style={{ animationDelay: "80ms" }}>
          Everything about the AI-built arcade.
        </p>

        <div className="mt-10 space-y-10">
          {groups.map((group, gi) => (
            <section
              key={group.id}
              id={group.id}
              className="fade-up scroll-mt-24"
              style={{ animationDelay: `${160 + gi * 80}ms` }}
            >
              <h2 className="mb-3 font-display text-xl font-bold text-neon-cyan">
                {group.title}
              </h2>
              <Accordion
                type="multiple"
                defaultValue={hash ? [hash.slice(1)] : []}
                className="rounded-2xl border border-border bg-card px-5"
              >
                {group.items.map((item) => (
                  <AccordionItem key={item.id} value={item.id} id={item.id} className="scroll-mt-24 border-border/60">
                    <AccordionTrigger className="text-left font-medium hover:text-neon-violet hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
};

export default Faq;
