// Admin site panel: the launch flag, behind a scary confirm (spec §4.10).

import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useSetLaunched } from "@/hooks/useAdmin";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Rocket, ShieldAlert } from "lucide-react";

const SitePanel = () => {
  const { data: settings, isLoading } = useSiteSettings();
  const setLaunched = useSetLaunched();

  if (isLoading || !settings) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const launched = settings.launched;

  return (
    <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-foreground/10">
      <div className="flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            launched ? "bg-olive/15" : "bg-mustard/25"
          }`}
        >
          {launched ? (
            <Rocket className="h-6 w-6 text-olive" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-foreground/70" />
          )}
        </div>
        <div>
          <p className="font-display text-lg font-bold">
            The arcade is {launched ? "OPEN" : "GATED"}
          </p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {launched
              ? "Everyone — including guests — sees the Arcade Home. Closing the gate puts guests back on the Coming Soon landing."
              : "Guests see the Coming Soon landing; signed-in players already get the full arcade with the preview banner. Flipping this opens the front door to the world."}
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={setLaunched.isPending}
                className={`mt-4 h-11 gap-2 rounded-full px-6 font-display font-bold ${
                  launched
                    ? "bg-secondary text-foreground hover:bg-secondary/70"
                    : "bg-terra text-primary-foreground hover:bg-terra/90"
                }`}
              >
                {setLaunched.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {launched ? "Close the gate" : "LAUNCH THE ARCADE"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display">
                  {launched ? "Close the gate again?" : "Flip the launch switch?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {launched
                    ? "Guests will be back on the waitlist landing. Signed-in players keep full access."
                    : "This is the Phase 7 moment: the landing page retires and every visitor walks straight onto the arcade floor. Make sure the floor is ready for company."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Not yet</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => setLaunched.mutate({ launched: !launched })}
                  className={`rounded-full ${
                    launched
                      ? ""
                      : "bg-terra text-primary-foreground hover:bg-terra/90"
                  }`}
                >
                  {launched ? "Close it" : "Launch 🚀"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default SitePanel;
