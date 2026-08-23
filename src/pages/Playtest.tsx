import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BadgeChip from "@/components/arcade/BadgeChip";
import SiteFooter from "@/components/layout/SiteFooter";
import { showError } from "@/utils/toast";
import { ArrowLeft, FlaskConical, Loader2, Sparkles, Zap, Check } from "lucide-react";

const DEVICES = ["Desktop", "Phone", "Tablet"];
const ERAS = ["Arcade", "Atari", "NES", "SNES", "Genesis", "Amiga/DOS", "PS1/PS2", "Mobile", "Text & Terminal"];

const Playtest = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [devices, setDevices] = useState<string[]>([]);
  const [hours, setHours] = useState("");
  const [eras, setEras] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (devices.length === 0) {
      showError("Pick at least one device you'd test on.");
      return;
    }
    setStatus("loading");
    const { error } = await supabase.from("playtest_applications").insert({
      name: name.trim(),
      email: email.trim(),
      devices,
      hours_per_week: hours || null,
      favorite_eras: eras,
    });
    if (error) {
      showError("Couldn't send your application. Try again in a moment.");
      setStatus("idle");
      return;
    }
    setStatus("done");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link
          to="/"
          className="mb-10 inline-flex items-center gap-2 font-mono text-xs tracking-widest text-muted-foreground transition-colors hover:text-arcade-amber"
        >
          <ArrowLeft className="h-4 w-4" /> BACK TO THE ARCADE
        </Link>

        {status === "done" ? (
          <div className="fade-up rounded-2xl border-2 border-arcade-green/60 bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-arcade-green/15">
              <Check className="h-7 w-7 text-arcade-green" />
            </div>
            <h1 className="font-display text-2xl uppercase">Application received</h1>
            <p className="mt-3 text-muted-foreground">
              We approve testers in waves. Watch your inbox — when your access opens,
              the Playtester badge is waiting for you.
            </p>
            <div className="mt-6 flex justify-center">
              <BadgeChip name="Playtester" rarity="neon" icon={FlaskConical} />
            </div>
          </div>
        ) : (
          <>
            <h1 className="fade-up font-display text-4xl uppercase leading-tight">
              Become a <span className="text-arcade-red">playtester</span>
            </h1>
            <div className="fade-up mt-3 h-1 w-16 rounded-full bg-arcade-red" />
            <p className="fade-up mt-3 text-lg text-muted-foreground" style={{ animationDelay: "80ms" }}>
              Get inside before the doors open. Break the games so nobody else has to.
            </p>

            {/* Perks */}
            <div
              className="fade-up mt-8 grid gap-4 rounded-2xl border-2 border-border bg-card p-6 sm:grid-cols-3"
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex flex-col items-start gap-2">
                <Zap className="h-5 w-5 text-arcade-green" />
                <p className="text-sm font-medium">Early access</p>
                <p className="text-xs text-muted-foreground">Play weeks before launch</p>
              </div>
              <div className="flex flex-col items-start gap-2">
                <Sparkles className="h-5 w-5 text-arcade-amber" />
                <p className="text-sm font-medium">Shape the games</p>
                <p className="text-xs text-muted-foreground">Your feedback lands in patches</p>
              </div>
              <div className="flex flex-col gap-2">
                <BadgeChip name="Playtester" rarity="neon" icon={FlaskConical} />
                <p className="text-xs text-muted-foreground">Never obtainable again</p>
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={submit}
              className="fade-up mt-6 space-y-6 rounded-2xl border-2 border-border bg-card p-6"
              style={{ animationDelay: "240ms" }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pt-name">Name</Label>
                  <Input
                    id="pt-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your handle"
                    className="rounded-full bg-secondary focus-visible:ring-arcade-amber"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pt-email">Email</Label>
                  <Input
                    id="pt-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-full bg-secondary focus-visible:ring-arcade-amber"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Devices you'd test on</Label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {DEVICES.map((d) => (
                    <label key={d} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={devices.includes(d)}
                        onCheckedChange={() => toggle(devices, setDevices, d)}
                        className="data-[state=checked]:border-arcade-red data-[state=checked]:bg-arcade-red"
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hours per week you could play</Label>
                <Select value={hours} onValueChange={setHours}>
                  <SelectTrigger className="rounded-full bg-secondary">
                    <SelectValue placeholder="Pick a range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-2">1–2 hours</SelectItem>
                    <SelectItem value="3-5">3–5 hours</SelectItem>
                    <SelectItem value="6-10">6–10 hours</SelectItem>
                    <SelectItem value="10+">10+ hours (respect)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Favorite eras</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {ERAS.map((era) => {
                    const active = eras.includes(era);
                    return (
                      <button
                        key={era}
                        type="button"
                        onClick={() => toggle(eras, setEras, era)}
                        className={`rounded-full border px-3.5 py-1.5 font-mono text-xs tracking-wide transition-all ${
                          active
                            ? "border-arcade-amber bg-arcade-amber/15 text-arcade-amber"
                            : "border-border bg-secondary text-muted-foreground hover:border-arcade-amber/50 hover:text-foreground"
                        }`}
                      >
                        {era}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button
                type="submit"
                disabled={status === "loading"}
                className="h-12 w-full rounded-full bg-arcade-red font-mono text-sm font-semibold tracking-wide text-primary-foreground transition-all hover:bg-arcade-red hover:shadow-hard-amber"
              >
                {status === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "APPLY TO PLAYTEST"
                )}
              </Button>
            </form>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
};

export default Playtest;
