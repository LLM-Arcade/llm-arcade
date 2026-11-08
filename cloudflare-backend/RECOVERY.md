# Recovery evidence

The audit is limited to the authorized Arcade repository and its isolated Git
recovery artifacts. A verified Git bundle preserves repository history; it is
not a database or object-storage backup.

The scoped source/history inspection found sixteen SQL files: eight game seed
scripts and eight publication scripts. It found no complete database DDL/RLS
definition, auth export, user/score data dump or storage backup in those
artifacts. This does not prove that the provider has deleted the old database
or that no backup exists elsewhere. Provider/account recovery is a separate
investigation.

The frontend has nineteen Supabase-dependent files, fifteen directly queried
tables and twelve RPC calls. Handoffs describe seventeen tables including XP
and badge tables, row policies, explicit grants and score/progression triggers
whose full definitions are not in the repository. Supabase currently supplies
database, account/session handling and public game/art storage. No active
realtime subscriptions or Edge Function calls were found. Chat and game saves
were deferred in the source handoff.

Locally shipped React games and HTML can reconstruct content; they cannot
reconstruct historical user identities, passwords, scores, play counts,
approval state or uploaded games. Do not replay PostgreSQL game seed scripts
against a surviving database: their upserts can reset games to `coming_soon`.

If exports become available, preserve originals privately and verify row
counts, foreign keys and content hashes before transformation. Retain user
UUIDs and score/user links; import legacy password hashes only through an
explicitly supported verifier or require a verified reset. Never fabricate
verified identity. Inventory stored files, content hashes, paths and moderation
state separately from database rows. Any new catalog rows must be labeled
reconstructed, rather than presented as recovered history.

D1 provides SQLite rather than MySQL. For this application, moving to MySQL
would still require replacing Supabase Auth, storage, policies, RPCs and
triggers, while also operating a database server. D1 plus a Worker avoids that
server administration; it does not replace authentication or recover missing
data automatically. Self-hosted PostgreSQL/Supabase preserves more SQL
semantics but adds hosting, updates, backups and incident responsibility; it
does not itself restore the inaccessible database.
