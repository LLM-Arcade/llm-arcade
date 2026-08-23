import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { showError } from "@/utils/toast";

type Status = "idle" | "loading" | "done";

const WaitlistForm = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("loading");
    const { error } = await supabase.from("waitlist").insert({ email: email.trim() });
    if (error && error.code !== "23505") {
      // 23505 = already signed up — treat as success
      showError("Couldn't sign you up. Try again in a moment.");
      setStatus("idle");
      return;
    }
    setStatus("done");
  };

  if (status === "done") {
    return (
      <div className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-arcade-green px-6 font-mono text-sm tracking-wide text-arcade-green">
        <Check className="h-4 w-4" />
        YOU'RE ON THE LIST
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-md gap-2">
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="h-12 rounded-full border-2 border-border bg-secondary px-5 font-mono text-sm placeholder:text-muted-foreground focus-visible:ring-arcade-amber"
      />
      <Button
        type="submit"
        disabled={status === "loading"}
        className="h-12 shrink-0 rounded-full bg-arcade-red px-6 font-mono text-sm font-semibold tracking-wide text-primary-foreground transition-all hover:bg-arcade-red hover:shadow-hard-amber"
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "SIGN UP"
        )}
      </Button>
    </form>
  );
};

export default WaitlistForm;
