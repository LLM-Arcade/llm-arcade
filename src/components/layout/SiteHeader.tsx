import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { authCta } from "@/lib/known-player";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, ShieldCheck, UploadCloud, UserRound } from "lucide-react";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-secondary text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`;

const SiteHeader = () => {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const cta = authCta(location.pathname + location.search);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src="/assets/brand/logo-mark.png"
            alt="LLM Arcade logo"
            className="h-9 w-9 rounded-full shadow-sm ring-1 ring-foreground/10"
          />
          <p className="font-display text-xl font-extrabold tracking-tight">
            llmarcade<span className="text-terra">.fun</span>
          </p>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/games" className={navLinkClass}>
            Games
          </NavLink>
          <NavLink to="/faq" className={navLinkClass}>
            FAQ
          </NavLink>

          {user && profile ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1.5 rounded-full ring-1 ring-foreground/10 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={profile.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-terra font-display font-bold text-primary-foreground">
                    {profile.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-border bg-card p-1.5 shadow-lg"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    @{profile.username} · LV {profile.level}
                  </p>
                </div>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl py-2.5 font-medium">
                  <Link to={`/creator/${profile.username}`}>
                    <UserRound className="h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl py-2.5 font-medium">
                  <Link to="/uploads">
                    <UploadCloud className="h-4 w-4" />
                    My uploads
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer rounded-xl py-2.5 font-medium">
                  <Link to="/settings">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {profile.role === "admin" && (
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl py-2.5 font-medium">
                    <Link to="/admin">
                      <ShieldCheck className="h-4 w-4" />
                      Admin
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => void signOut()}
                  className="cursor-pointer rounded-xl py-2.5 font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              asChild
              className="ml-1.5 rounded-full bg-primary font-semibold hover:bg-primary/90"
            >
              <Link to={cta.to}>{cta.verb}</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default SiteHeader;
