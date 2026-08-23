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
      <div className="inline-flex h-12 items-center gap-2 rounded-full bg-olive/15 px-6 font-medium text-olive">
        <Check className="h-4 w-4" />
        You're on the list — see you at opening night.
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
        className="h-12 rounded-full border-border bg-card px-5 text-base shadow-sm placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        disabled={status === "loading"}
        className="h-12 shrink-0 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90"
      >
        {status === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Get updates"
        )}
      </Button>
    </form>
  );
};

export default WaitlistForm;
