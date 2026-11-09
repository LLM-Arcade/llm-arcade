-- New source-based progression engine. No historical awards or ledger imported.
-- Explicit statement boundaries keep whole SQLite triggers intact in local tests.
CREATE TABLE achievements (
  id TEXT PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id), slug TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', hint TEXT NOT NULL DEFAULT '',
  xp INTEGER NOT NULL CHECK (xp BETWEEN 0 AND 1000), sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)), UNIQUE(game_id, slug)
);
-- statement-breakpoint
CREATE TABLE user_achievements (
  user_id TEXT NOT NULL REFERENCES "user"(id), achievement_id TEXT NOT NULL REFERENCES achievements(id),
  unlocked_at TEXT NOT NULL, PRIMARY KEY (user_id, achievement_id)
);
-- statement-breakpoint
CREATE INDEX user_achievements_definition ON user_achievements(achievement_id);
-- statement-breakpoint
CREATE TABLE badges (
  slug TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('bronze','silver','gold','neon')),
  icon TEXT NOT NULL, sort_order INTEGER NOT NULL, xp INTEGER NOT NULL
);
-- statement-breakpoint
CREATE TABLE user_badges (
  user_id TEXT NOT NULL REFERENCES "user"(id), badge_slug TEXT NOT NULL REFERENCES badges(slug),
  detail TEXT NOT NULL DEFAULT '', earned_at TEXT NOT NULL, PRIMARY KEY(user_id, badge_slug)
);
-- statement-breakpoint
CREATE TABLE xp_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT REFERENCES games(id),
  kind TEXT NOT NULL, points INTEGER NOT NULL CHECK (points BETWEEN 1 AND 1000), created_at TEXT NOT NULL,
  source_key TEXT NOT NULL, UNIQUE (user_id, source_key)
);
-- statement-breakpoint
CREATE INDEX xp_events_daily ON xp_events(user_id, kind, created_at);
-- statement-breakpoint
CREATE TABLE activity_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES "user"(id), game_id TEXT REFERENCES games(id),
  type TEXT NOT NULL CHECK (type IN ('achievement','badge','top_rank','level_up')),
  data TEXT NOT NULL CHECK (json_valid(data)), created_at TEXT NOT NULL
);
-- statement-breakpoint
CREATE INDEX activity_recent ON activity_events(created_at DESC);
-- statement-breakpoint
CREATE INDEX activity_player_recent ON activity_events(user_id, created_at DESC);
-- statement-breakpoint
CREATE TABLE level_thresholds (level INTEGER PRIMARY KEY, xp INTEGER NOT NULL);
-- statement-breakpoint
INSERT INTO level_thresholds WITH RECURSIVE levels(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM levels WHERE n < 50)
  SELECT n, 40 * (n-1) * (n-1) FROM levels;
-- statement-breakpoint
-- Six documented badge identities plus two fresh, explicitly documented rules.
INSERT INTO badges VALUES
 ('first-coin','First Coin','Save your first score.','bronze','coins',1,25),
 ('chart-topper','Chart-topper','Take first place on a game leaderboard.','gold','trophy',2,100),
 ('era-tourist','Era Tourist','Save scores in five different published eras.','silver','compass',3,50),
 ('completionist','Completionist','Unlock every active achievement in one game.','gold','medal',4,100),
 ('playtester','Playtester','Be approved as a playtester.','silver','wrench',5,50),
 ('creator','Creator','Have an uploaded game approved.','silver','hammer',6,50),
 ('streak-keeper','Streak Keeper','Save a score on seven consecutive UTC days.','silver','flame',7,50),
 ('cabinet-explorer','Cabinet Explorer','Save scores in ten different games.','silver','compass',8,50);
-- statement-breakpoint
CREATE TRIGGER xp_award AFTER INSERT ON xp_events BEGIN
  INSERT INTO activity_events (id,user_id,game_id,type,data,created_at)
    SELECT 'level:' || NEW.id, NEW.user_id, NEW.game_id, 'level_up',
      json_object('level',(SELECT max(level) FROM level_thresholds WHERE xp <= u.xp + NEW.points)), NEW.created_at
    FROM "user" u WHERE u.id = NEW.user_id AND u.level < (SELECT max(level) FROM level_thresholds WHERE xp <= u.xp + NEW.points);
  UPDATE "user" SET xp = xp + NEW.points,
    level = (SELECT max(level) FROM level_thresholds WHERE xp <= "user".xp + NEW.points)
    WHERE id = NEW.user_id;
END;
-- statement-breakpoint
CREATE TRIGGER badge_award AFTER INSERT ON user_badges BEGIN
  INSERT INTO xp_events (id,user_id,kind,points,created_at,source_key)
    SELECT 'badge:' || NEW.user_id || ':' || NEW.badge_slug, NEW.user_id, 'badge', b.xp, NEW.earned_at, 'badge:' || NEW.badge_slug
    FROM badges b WHERE b.slug = NEW.badge_slug ON CONFLICT DO NOTHING;
  INSERT INTO activity_events (id,user_id,type,data,created_at)
    SELECT 'badge:' || NEW.user_id || ':' || NEW.badge_slug, NEW.user_id, 'badge', json_object('name',b.name,'slug',b.slug), NEW.earned_at
    FROM badges b WHERE b.slug = NEW.badge_slug;
END;
-- statement-breakpoint
CREATE TRIGGER score_progression AFTER INSERT ON scores BEGIN
  INSERT INTO xp_events (id,user_id,game_id,kind,points,created_at,source_key)
    VALUES ('daily:' || NEW.user_id || ':' || date(NEW.created_at),NEW.user_id,NEW.game_id,'daily',25,NEW.created_at,'daily:' || date(NEW.created_at)) ON CONFLICT DO NOTHING;
  INSERT INTO xp_events (id,user_id,game_id,kind,points,created_at,source_key)
    SELECT 'score:' || NEW.id,NEW.user_id,NEW.game_id,'score',10,NEW.created_at,'score:' || NEW.id
    WHERE coalesce((SELECT sum(points) FROM xp_events WHERE user_id = NEW.user_id AND kind = 'score' AND created_at >= date(NEW.created_at) AND created_at < date(NEW.created_at,'+1 day')),0) < 200;
  UPDATE "user" SET
    best_streak = max(best_streak, CASE WHEN last_play_date = date(NEW.created_at) THEN streak_days WHEN last_play_date = date(NEW.created_at,'-1 day') THEN streak_days + 1 ELSE 1 END),
    streak_days = CASE WHEN last_play_date = date(NEW.created_at) THEN streak_days WHEN last_play_date = date(NEW.created_at,'-1 day') THEN streak_days + 1 ELSE 1 END,
    last_play_date = date(NEW.created_at) WHERE id = NEW.user_id;
  INSERT INTO user_badges VALUES (NEW.user_id,'first-coin','',NEW.created_at) ON CONFLICT DO NOTHING;
  INSERT INTO xp_events (id,user_id,game_id,kind,points,created_at,source_key)
    SELECT 'top:' || NEW.id,NEW.user_id,NEW.game_id,'top_rank',50,NEW.created_at,'top:' || NEW.id
    WHERE NEW.score > coalesce((SELECT max(score) FROM scores WHERE game_id = NEW.game_id AND id <> NEW.id),-1)
    AND NEW.user_id <> coalesce((SELECT user_id FROM scores WHERE game_id = NEW.game_id AND id <> NEW.id ORDER BY score DESC,created_at,id LIMIT 1),'');
  INSERT INTO activity_events (id,user_id,game_id,type,data,created_at)
    SELECT 'top:' || NEW.id,NEW.user_id,NEW.game_id,'top_rank',json_object('score',NEW.score),NEW.created_at
    WHERE EXISTS (SELECT 1 FROM xp_events WHERE id = 'top:' || NEW.id);
  INSERT INTO user_badges (user_id,badge_slug,detail,earned_at)
    SELECT NEW.user_id,'chart-topper','',NEW.created_at WHERE EXISTS (SELECT 1 FROM xp_events WHERE id = 'top:' || NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO user_badges (user_id,badge_slug,detail,earned_at)
    SELECT NEW.user_id,'streak-keeper','',NEW.created_at FROM "user" WHERE id = NEW.user_id AND streak_days >= 7 ON CONFLICT DO NOTHING;
  INSERT INTO user_badges (user_id,badge_slug,detail,earned_at)
    SELECT NEW.user_id,'cabinet-explorer','',NEW.created_at WHERE (SELECT count(DISTINCT game_id) FROM scores WHERE user_id = NEW.user_id) >= 10 ON CONFLICT DO NOTHING;
  INSERT INTO user_badges (user_id,badge_slug,detail,earned_at)
    SELECT NEW.user_id,'era-tourist','',NEW.created_at
    WHERE (SELECT count(DISTINCT era) FROM games WHERE status = 'published') >= 5
    AND (SELECT count(DISTINCT g.era) FROM scores s JOIN games g ON g.id = s.game_id WHERE s.user_id = NEW.user_id AND g.status = 'published') >= 5 ON CONFLICT DO NOTHING;
END;
-- statement-breakpoint
CREATE TRIGGER achievement_progression AFTER INSERT ON user_achievements BEGIN
  INSERT INTO xp_events (id,user_id,game_id,kind,points,created_at,source_key)
    SELECT 'achievement:' || NEW.user_id || ':' || a.id,NEW.user_id,a.game_id,'achievement',a.xp,NEW.unlocked_at,'achievement:' || a.id
    FROM achievements a WHERE a.id = NEW.achievement_id AND a.xp > 0 ON CONFLICT DO NOTHING;
  INSERT INTO activity_events (id,user_id,game_id,type,data,created_at)
    SELECT 'achievement:' || NEW.user_id || ':' || a.id,NEW.user_id,a.game_id,'achievement',json_object('name',a.name,'slug',a.slug),NEW.unlocked_at
    FROM achievements a WHERE a.id = NEW.achievement_id;
  INSERT INTO user_badges (user_id,badge_slug,detail,earned_at)
    SELECT NEW.user_id,'completionist',g.title,NEW.unlocked_at FROM achievements a JOIN games g ON g.id = a.game_id
    WHERE a.id = NEW.achievement_id
    AND NOT EXISTS (SELECT 1 FROM achievements required WHERE required.game_id = a.game_id AND required.active = 1
      AND NOT EXISTS (SELECT 1 FROM user_achievements unlocked WHERE unlocked.user_id = NEW.user_id AND unlocked.achievement_id = required.id))
    ON CONFLICT DO NOTHING;
END;
-- statement-breakpoint
CREATE TRIGGER role_badge AFTER UPDATE OF role ON "user" WHEN NEW.role = 'playtester' BEGIN
  INSERT INTO user_badges VALUES (NEW.id,'playtester','',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT DO NOTHING;
END;
