import { Link, useParams } from "react-router-dom";
import SiteHeader from "@/components/layout/SiteHeader";
import SiteFooter from "@/components/layout/SiteFooter";
import LevelRing from "@/components/progression/LevelRing";
import BadgeCase from "@/components/progression/BadgeCase";
import ActivityFeed from "@/components/progression/ActivityFeed";
import { useAuth } from "@/contexts/AuthContext";
import {
  useFollowCounts,
  useIsFollowing,
  useProfileByUsername,
  useToggleFollow,
  useUserBadges,
  useUserTopScores,
  useUserUnlocks,
} from "@/hooks/useProgression";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { showError } from "@/utils/toast";
import { Flame, Loader2, Trophy, UserRound } from "lucide-react";

const tabTriggerClass =
  "rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm";

const roleLabel: Record<string, string> = {
  playtester: "PLAYTESTER",
  moderator: "MODERATOR",
  admin: "ADMIN",
};

const hexClip = {
  clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
};

const FollowButton = ({ targetId }: { targetId: string }) => {
  const { data: isFollowing } = useIsFollowing(targetId);
  const toggle = useToggleFollow(targetId);
  return (
    <Button
      onClick={() =>
        toggle.mutate(!!isFollowing, {
          onError: () => showError("Couldn't update follow — try again."),
        })
      }
      disabled={toggle.isPending || isFollowing === undefined}
      variant={isFollowing ? "outline" : "default"}
      className={`h-10 rounded-full px-6 font-semibold ${
        isFollowing ? "border-border" : "bg-primary hover:bg-primary/90"
      }`}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
};

const CreatorProfile = () => {
  const { username = "" } = useParams();
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfileByUsername(username);

  const { data: badges } = useUserBadges(profile?.id);
  const { data: topScores } = useUserTopScores(profile?.id);
  const { data: unlocks } = useUserUnlocks(profile?.id);
  const { data: followCounts } = useFollowCounts(profile?.id);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <UserRound className="h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
            No player by that name.
          </h1>
          <p className="mt-2 text-muted-foreground">
            @{username} hasn't stepped onto the floor.
          </p>
          <Link
            to="/games"
            className="mt-5 rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to the games
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const isOwn = user?.id === profile.id;
  const joined = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const stats = [
    { label: "TOTAL XP", value: profile.xp.toLocaleString() },
    { label: "PLAY STREAK", value: `${profile.streak_days}d`, flame: profile.streak_days > 0 },
    { label: "ACHIEVEMENTS", value: String(unlocks?.length ?? 0) },
    { label: "BADGES", value: String(badges?.length ?? 0) },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {/* Identity */}
        <section className="fade-up flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <LevelRing
            xp={profile.xp}
            avatarUrl={profile.avatar_url}
            fallback={profile.username[0] ?? "?"}
            size={96}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="font-display text-3xl font-extrabold tracking-tight">
                {profile.display_name || profile.username}
              </h1>
              {roleLabel[profile.role] && (
                <span className="rounded-full bg-mustard px-2.5 py-1 font-mono text-[10px] font-medium tracking-widest">
                  {roleLabel[profile.role]}
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-xs tracking-wider text-muted-foreground">
              @{profile.username} · JOINED {joined.toUpperCase()} ·{" "}
              {followCounts?.followers ?? 0} FOLLOWERS · {followCounts?.following ?? 0} FOLLOWING
            </p>
            {profile.bio && (
              <p className="mt-2 max-w-xl leading-relaxed text-muted-foreground">{profile.bio}</p>
            )}
          </div>
          <div className="shrink-0">
            {isOwn ? (
              <Button
                asChild
                variant="outline"
                className="h-10 rounded-full border-border px-6 font-semibold"
              >
                <Link to="/settings">Edit profile</Link>
              </Button>
            ) : user ? (
              <FollowButton targetId={profile.id} />
            ) : (
              <Button
                asChild
                className="h-10 rounded-full bg-primary px-6 font-semibold hover:bg-primary/90"
              >
                <Link to={`/login?next=/creator/${profile.username}`}>Sign in to follow</Link>
              </Button>
            )}
          </div>
        </section>

        {/* Stats strip */}
        <section
          className="fade-up mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
          style={{ animationDelay: "60ms" }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-card px-4 py-3.5 shadow-sm ring-1 ring-foreground/10"
            >
              <p className="flex items-center gap-1.5 font-mono text-2xl font-bold tabular-nums">
                {s.value}
                {s.flame && <Flame className="h-5 w-5 text-terra" />}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tracking-widest text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </section>

        {/* Badge case */}
        <section className="fade-up mt-6" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-2.5 font-mono text-xs tracking-widest text-muted-foreground">
            BADGE CASE
          </h2>
          <BadgeCase userId={profile.id} />
        </section>

        {/* Tabs */}
        <Tabs defaultValue="scores" className="fade-up mt-7" style={{ animationDelay: "180ms" }}>
          <TabsList className="h-auto rounded-full bg-secondary p-1">
            <TabsTrigger value="scores" className={tabTriggerClass}>
              Top scores
            </TabsTrigger>
            <TabsTrigger value="achievements" className={tabTriggerClass}>
              Achievements
            </TabsTrigger>
            <TabsTrigger value="activity" className={tabTriggerClass}>
              Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scores" className="mt-4">
            {!topScores || topScores.length === 0 ? (
              <p className="rounded-2xl bg-secondary/60 px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
                No scores on the boards yet.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {topScores.map((row) => (
                  <li
                    key={row.game_id}
                    className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/10"
                  >
                    <span
                      className={`w-12 shrink-0 rounded-full px-2 py-0.5 text-center font-mono text-xs font-bold ${
                        row.rank === 1
                          ? "bg-mustard text-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      #{row.rank}
                    </span>
                    <Link
                      to={`/game/${row.slug}`}
                      className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-terra"
                    >
                      {row.title}
                    </Link>
                    <span className="font-mono text-sm font-bold tabular-nums">
                      {row.best_score.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-4">
            {!unlocks || unlocks.length === 0 ? (
              <p className="rounded-2xl bg-secondary/60 px-5 py-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
                Nothing unlocked yet — every cabinet has secrets.
              </p>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {unlocks.map((u, i) => (
                  <li
                    key={`${u.unlocked_at}-${i}`}
                    className="flex items-center gap-3 rounded-xl bg-card px-3.5 py-2.5 shadow-sm ring-1 ring-foreground/10"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-mustard bg-mustard/15"
                      style={hexClip}
                    >
                      <Trophy className="h-3.5 w-3.5 text-[#8F6400]" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-semibold">{u.achievements.name}</span>
                      {u.achievements.games && (
                        <>
                          {" "}
                          ·{" "}
                          <Link
                            to={`/game/${u.achievements.games.slug}`}
                            className="text-muted-foreground hover:text-terra"
                          >
                            {u.achievements.games.title}
                          </Link>
                        </>
                      )}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] tracking-wider text-olive">
                      +{u.achievements.xp} XP
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ActivityFeed userId={profile.id} limit={30} />
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
};

export default CreatorProfile;
