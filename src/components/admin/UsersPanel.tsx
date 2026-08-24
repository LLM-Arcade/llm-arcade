// Admin users panel: search + role grants. Granting playtester auto-awards
// the Playtester badge via the on_role_badges trigger.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, type Role } from "@/contexts/AuthContext";
import { useAdminUsers, useSetRole } from "@/hooks/useAdmin";
import { timeAgo } from "@/lib/progression";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";

const ROLES: Role[] = ["player", "playtester", "moderator", "admin"];

const roleChipClass: Record<Role, string> = {
  player: "bg-secondary text-muted-foreground",
  playtester: "bg-mustard text-foreground",
  moderator: "bg-olive text-primary-foreground",
  admin: "bg-terra text-primary-foreground",
};

const UsersPanel = () => {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useAdminUsers(search);
  const setRole = useSetRole();

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username…"
          className="h-11 rounded-full border-border bg-card pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(users ?? []).map((u) => {
            const isSelf = u.id === me?.id;
            return (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sm ring-1 ring-foreground/10"
              >
                <Avatar className="h-10 w-10 ring-1 ring-foreground/10">
                  <AvatarImage src={u.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-terra font-display font-bold text-primary-foreground">
                    {u.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/creator/${u.username}`}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    @{u.username}
                    {isSelf && (
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">(you)</span>
                    )}
                  </Link>
                  <p className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    LV {u.level} · {u.xp.toLocaleString()} XP · joined {timeAgo(u.created_at)}
                  </p>
                </div>

                <span
                  className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest ${roleChipClass[u.role]}`}
                >
                  {u.role.toUpperCase()}
                </span>

                <Select
                  value={u.role}
                  disabled={isSelf || setRole.isPending}
                  onValueChange={(role) => setRole.mutate({ userId: u.id, role: role as Role })}
                >
                  <SelectTrigger className="h-9 w-36 rounded-full border-border bg-card font-mono text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {ROLES.map((role) => (
                      <SelectItem key={role} value={role} className="rounded-lg font-mono text-xs">
                        {role.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {users && users.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-sm ring-1 ring-foreground/10">
              No players match "{search}".
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default UsersPanel;
