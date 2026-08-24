# Branch and release workflow

## Branch roles

- `prod` is the production source of truth. Vercel must explicitly use it
  as the production branch before any release promotion.
- `dev` is the default integration branch. It should always be releasable.
- `main` is a frozen legacy branch. Do not target new work at it.
- `feature/<game>-<scope>` contains one cabinet's work and starts from `dev`.
- `hotfix/<scope>` starts from `prod`, returns to `prod` by PR, then is
  merged back to `dev` by PR.

Never combine unrelated games in one feature branch. Never push directly
to `dev`, `prod`, or `main`.

## Cabinet change

1. Update local `dev`: `git switch dev`, then `git pull --ff-only origin dev`.
2. Create the branch: `git switch -c feature/<game>-<scope>`.
3. Keep gameplay/balance and art-only changes separate unless the ticket
   explicitly couples them.
4. Run `pnpm run ci`.
5. Start `pnpm dev`, play `/dev/<slug>` with real controls, and inspect the
   actual canvas at desktop and mobile sizes. Reject broken loads, frame
   clipping, incoherent overlap, animation popping/jank, and console errors.
6. Push the feature branch and open a PR targeting `dev`. Record harness,
   build, and browser-play evidence in the PR.
7. Merge only after the protected `check` job succeeds. Delete the feature
   branch after merge.

## Production promotion

1. Confirm Vercel's project setting names `prod` as the production branch.
   A GitHub default-branch change is not proof of this setting.
2. Open a release PR from `dev` to `prod`; do not add unrelated commits.
3. Wait for the protected `check` job and inspect the Vercel preview.
4. Merge the PR, wait for the production deployment, then play changed
   public routes as a fresh guest and capture proof.
5. Confirm `prod` is clean and the deployed commit matches the merged SHA.

Deterministic harnesses prove engine contracts. They do not prove feel,
rendering, responsive fit, asset integrity, or animation quality; browser
play is a separate required gate.
