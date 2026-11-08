# D1 isolation review — 2026-11-08

Scope: all current Worker handlers in `src/index.ts`, `auth.ts`, `clerk-auth.ts`,
`community.ts`, `rpc.ts`, `submissions.ts`, `storage.ts`, schemas and integration
tests. Local code review and synthetic workerd/D1 execution; no old/live data
was queried or changed by this review. D1 is SQLite-based and has no native
PostgreSQL-style row policies: the Worker enforces every row permission.
Prepared values prevent SQL injection, but authorization depends on the
explicit owner/admin predicates described below.

## Principal and data trace

- Guest: opaque 256-bit cookie -> SHA-256 digest -> unexpired auth_sessions
  join -> user without email/Clerk identity. Linked guest cookies cannot
  authenticate accounts. Session digest and provider subject are never public.
- Clerk: official SDK verifies signature, issuer, authorized party and session
  token type -> stable provider subject -> D1 user. Linking obtains the primary
  verified email through the backend SDK, not client fields or JWT email text.
- Owner: server-only configured email plus verified Clerk identity, with a
  no-other-admin guard. Client signup cannot choose an admin role.
- Scores, ratings, favorites, follows, comments and profile writes bind the
  principal's ID. Object updates/deletes constrain both ID and owner. Existing
  public player IDs are usable for public reads, not mutation authority.
- Public profile/leaderboard/activity models exclude email, private names,
  session digests and provider IDs. Signup lists require verified admin role.
  Submissions require own rows or verified admin, including unfiltered lists.
- Model names, fields, filters and ordering are allowlisted. There is no client
  SQL route. RPC names/arguments are explicit; progression tables cannot be
  written directly. Counts use the same filtered relation as rows.
- File creation derives ownership from the verified account and own path;
  chunks are immutable and completion checks lengths/counts. Submission files
  must be owned/complete; only the original creator can version a game. Review
  writes are atomic and guarded by pending status. Removed achievement
  definitions retain prior award rows rather than deleting player history.
- Files remain intentionally public, including pending uploads, matching the
  old public bucket. This is disclosed before upload. Private form records
  and account details are never included in file manifests.
- Local preview data is isolated. The only remote target prepared is the new
  `llm-arcade-preview` database; no old/unrelated database binding is used.

## Findings fixed during review

1. **Medium, high confidence: concurrent guest linking.** In `auth.ts` the
   session deletion originally followed an UPDATE that could affect zero rows
   if another identity had linked that guest. It now checks update success and
   only deletes sessions when the expected subject owns that exact user.
   Negative test: reused linked guest credentials must not access the account;
   concurrent identities may never take over the same card. The explicit
   concurrent-request test now passes; exactly one identity retains that UUID.
2. **Low, high confidence: oversized LIKE patterns.** The community query
   allowlist allowed patterns longer than D1's 50-byte limit, producing a
   service error. Username search now rejects oversized patterns before SQL.
   Negative test: long patterns should return 400 without executing SQL.
3. **Low, high confidence: unbounded score-reset output.** Admin score reset
   returned every deleted ID. It now returns the database change count without
   materializing historical IDs. This command has not run on real scores.

## Negative tests and positive controls

The suite proves two players can save separate scores and access their own
personal bests; spoofed score ownership, role fields, unauthorized profile
updates, another player's rating/favorite/comment/submission/file changes,
private signup access, unknown table/RPC/filter names and SQL-like identifiers
are rejected. Verified owner controls succeed; revoked admin role is checked
again despite a still-valid token. Manifest unlocks and score retries do not
award XP twice. Guest-to-account upgrade keeps UUID links and revokes old guest
credentials. Upload/version review preserves files and unlock history.

## Outstanding verification and limits

- Concurrent-link and long-pattern negative cases pass in the eleven-test local
  suite. No claim of exhaustive or externally audited security is made.
- Actual Clerk app, primary-email delivery/recovery, real owner sign-in and
  provider-side revocation are unverified. A valid short-lived Clerk token can
  remain valid until its expiry; local role revocation is enforced immediately.
- Browser verification is required for the trusted file loader, blob navigation
  and sandbox inheritance. Both loader response CSP and parent iframe require
  `sandbox allow-scripts` without same-origin. Do not promote uploads based
  only on header assertions in Node tests.
- Native 128 KB chunk decoding works in the local runtime. Authenticated upload
  sampled about 8.9 ms and public reads 0–6.7 ms; this is sampling, not deployed
  CPU accounting. The 5 MB monolithic approach failed the CPU budget and was
  replaced. Measure real cold/warm requests before production promotion.
- Full-file assembly adds up to 40 public chunk requests for a 5 MB game, 16
  for 2 MB art. File payload capacity is 400 MiB; account upload allowance is
  12 files/day, with three pending submissions. Free shared account quotas can
  stop service until reset. No billing upgrade or automatic data deletion.
- Achievement outcome/score truth remains client-reported, matching the
  documented v1 trust model. Cap, rate, manifest and ownership checks are not
  proof that a player legitimately achieved a score or challenge.
