> **Execution order is load-bearing.** `deno ci` (and the gates in §13) require `deno.lock` to be
> in sync with the configs. Apply in this order: edit configs (§2–§8 text changes) → **regenerate
> the lockfile (§9)** → run the `deno ci` gates (§13). Regenerating the lock *before* the catalog
> edits (§4) produces a lock that `deno ci` then rejects as out of date once the catalog lands.
> All line numbers below are against the current `main` (verified 2026-06-27); re-confirm if `main`
> moved.

## 1. Prerequisite — align local Deno to the target version

- [x] 1.1 Upgrade local Deno from 2.8.3 to **2.9.0** (`deno upgrade --version 2.9.0`) so the lockfile regen (§9) is produced by the same runtime CI/Docker will use. Verify `deno --version` → `deno 2.9.0`. (Alternative if you don't want to touch local Deno: regenerate the lock inside the bumped Docker image — see §9.5 — but the local upgrade is simpler.)
- [x] 1.2 Confirm `deno ci`, `deno ci --prod`, and `deno bump-version` exist in 2.9.0 (`deno ci --help`, `deno bump-version --help`). Verified present in 2.8.3; this is a sanity check on the target binary.

## 2. Version bump — Dockerfiles (5 `FROM` tags → 2.9.0)

- [x] 2.1 `Dockerfile` — change all 3 stage bases (lines **13**, **24**, **37**): `FROM denoland/deno:debian-2.7.14 AS <stage>` → `FROM denoland/deno:debian-2.9.0 AS <stage>` (`deps`, `builder`, `runner`). Do NOT touch the entrypoint, `EXPOSE 8000`, the `COPY --from=builder /deno-dir /deno-dir`, or the builder's `email-build`/`generate`/`check` steps.
- [x] 2.2 `Dockerfile.web` — change both Deno stage bases (lines **14**, **27**): `debian-2.7.14` → `debian-2.9.0` (`deps`, `builder`). Leave the `caddy:2.11.4-alpine` runner base (line 46) untouched — it is already patch-pinned and unrelated to Deno.
- [x] 2.3 Confirm `denoland/deno:debian-2.9.0` exists on Docker Hub (`docker pull denoland/deno:debian-2.9.0`) before committing — tags publish ~2h post-release (2.9.0 shipped 2026-06-25, so it exists).

## 3. Version bump — CI workflows (6 `setup-deno` pins → v2.9.0)

- [x] 3.1 `.github/workflows/ci.yml` — `deno-version: v2.7.14` → `v2.9.0` at lines **17** (`quality` job) and **76** (`test` job).
- [x] 3.2 `.github/workflows/pr.yml` — `deno-version: v2.7.14` → `v2.9.0` at lines **15** (`check`), **46** (`test-unit`), **96** (`test-api`), **144** (`test-web`).
- [x] 3.3 `.github/workflows/release.yml` — **no change** (no `setup-deno`; Deno version flows from the Docker base images via §2). Confirm there is no `deno-version` pin in it.

## 4. Catalog migration (centralize the 3 duplicated npm deps)

- [x] 4.1 Root `deno.json` — add a top-level `catalog` block (after the `nodeModulesDir` line / before `tasks`, or anywhere at top level) recording the EXISTING ranges (no version change):
  ```jsonc
  "catalog": {
    "drizzle-orm": "^0.45.0",
    "bcryptjs": "^3.0.0",
    "zod": "^4.0.0"
  },
  ```
- [x] 4.2 `apps/api/package.json` — in `dependencies`, change `"drizzle-orm": "^0.45.0"` (line 6), `"zod": "^4.0.0"` (line 7), `"bcryptjs": "^3.0.0"` (line 14) → each value to `"catalog:"`. Leave `hono`, `@hono/*`, `hono-openapi`, `pino`, `pino-pretty`, `qrcode`, `nodemailer` and ALL `devDependencies` (incl. the `jsr:` `@std/*` and `mjml`) untouched.
- [x] 4.3 `packages/db/package.json` — in `dependencies`, change `"drizzle-orm": "^0.45.0"` (line 16) and `"bcryptjs": "^3.0.0"` (line 18) → `"catalog:"`. Leave `postgres` and the `devDependencies` (`drizzle-kit`, `@std/*`) untouched.
- [x] 4.4 `packages/shared/package.json` — in `dependencies`, change `"zod": "^4.0.0"` (line 12) → `"catalog:"`. Leave `zod-openapi` untouched (not duplicated, not cataloged).
- [x] 4.5 Do NOT add `@std/testing`/`@std/expect` to the catalog — `catalog:` cannot carry the `jsr:` prefix; they stay explicit `jsr:@std/...` specifiers. `apps/web/package.json` and root `package.json` have NO catalog candidates — leave them unchanged.

## 5. Member versions + `bump:*` tasks

- [x] 5.1 Add `"version": "0.1.0",` immediately after the `"name": "@brewform/..."` line (line 2) in each member `deno.json`: `apps/api/deno.json`, `apps/web/deno.json`, `packages/shared/deno.json`, `packages/db/deno.json`. Do NOT touch the `deploy` blocks in `apps/api/deno.json`/`apps/web/deno.json` (incl. their `"install": "deno install"` — that is Deno Deploy config, out of scope).
- [x] 5.2 Add to the root `deno.json` `tasks` block: `"bump:dry-run": "deno bump-version --base=main --dry-run"`, `"bump:patch": "deno bump-version patch"`, `"bump:minor": "deno bump-version minor"`.
- [x] 5.3 Sanity-check (NON-blocking): `deno task bump:patch --dry-run`-style behavior — note that `bump:dry-run` runs in **conventional-commits mode** (`--base=main`, no increment), which requires a git tag (`git describe --tags`) and would prepend to `Releases.md` if not `--dry-run`. If it errors because the repo has no tag, that is EXPECTED and not a blocker — the task only adds the task definitions. The functional check is that `deno bump-version patch --dry-run` reports the four members.

## 6. Re-enable test sanitizers

- [x] 6.1 Root `deno.json` `test` block — add `"sanitizeOps": true,` and `"sanitizeResources": true,` alongside the existing `include`/`exclude`.
- [x] 6.2 **VERIFIED: member-scoped runs DO inherit root sanitizers on 2.9.0.** Empirical probe (a throwaway `_leakprobe.test.ts` with a pending-timer op leak and an unclosed-file resource leak) FAILED under both `deno task --cwd packages/shared test` (member-scoped) and root `deno test` — "Leaks detected" in both. So the root `deno.json` `test` block governs member-scoped runs; **no per-member `test` blocks are needed.** (Probe removed after the check.)
- [x] 6.3 Run the FULL suite after enabling (`deno task ci` or `make test`) and triage newly-surfaced sanitizer failures. **Expect the api and db suites to be the most affected** — they open real Postgres connections (`postgres`/drizzle) and may leak unclosed clients/timers. Fix genuine leaks (close DB clients in `afterAll`/`afterEach`); for a test that legitimately leaks by design, override on that specific test (`it(... )` → use `Deno.test({ sanitizeResources: false, ... })` form, or the bdd `afterAll` cleanup), NOT by disabling the global setting. If leak-fixing proves large, see `design.md` Decision 8 for the scoped-sanitizers fallback.

## 7. Install command — `deno install[ --frozen]` → `deno ci`

- [x] 7.1 `.github/workflows/ci.yml` — `run: deno install` → `run: deno ci` at lines **20** (`quality`) and **79** (`test`).
- [x] 7.2 `.github/workflows/pr.yml` — `run: deno install --frozen` → `run: deno ci` at lines **18**, **49**, **99**, **147** (all four jobs).
- [x] 7.3 `Dockerfile` `deps` stage — `RUN deno install --frozen` (line **20**) → `RUN deno ci`.
- [x] 7.4 `Dockerfile.web` `deps` stage — `RUN deno install --frozen` (line **21**) → `RUN deno ci`.
- [x] 7.5 `Makefile` — **leave unchanged** (lines 47 `deno install --frozen` and 51 `deno install` stay; they run inside the Docker image, so they inherit 2.9.0 from §2). The unfrozen line 51 is the local lockfile-regen path. No Makefile target breaks by keeping `--frozen` locally while CI/Docker use `deno ci`.

## 8. Runner `--prod` slim (GATED — see §13.6 boot gate; `design.md` Decision 7)

- [x] 8.1 `Dockerfile` `runner` stage (lines **37–45**) — replace `COPY --from=builder /app .` (line 40) with member-manifest copies + `deno ci --prod` + selective source copies. **Reference shape** (verify against §8.2; the implementer adjusts paths to what the runtime actually needs):
  ```dockerfile
  FROM denoland/deno:debian-2.9.0 AS runner
  WORKDIR /app
  COPY --from=builder /deno-dir /deno-dir
  # Production-only install (drops devDeps: mjml, drizzle-kit, @types/*, @std/*).
  COPY deno.json deno.lock package.json ./
  COPY apps/api/package.json apps/api/deno.json ./apps/api/
  COPY apps/web/package.json apps/web/deno.json ./apps/web/
  COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
  COPY packages/db/package.json packages/db/deno.json ./packages/db/
  RUN deno ci --prod
  # Copy only the built artifacts the runtime needs (from the builder).
  COPY --from=builder /app/apps/api/src ./apps/api/src
  COPY --from=builder /app/apps/api/scripts ./apps/api/scripts
  COPY --from=builder /app/packages ./packages
  COPY --from=builder /app/scripts ./scripts
  COPY docker-entrypoint.sh /app/docker-entrypoint.sh
  RUN chmod +x /app/docker-entrypoint.sh
  EXPOSE 8000
  ENTRYPOINT ["/app/docker-entrypoint.sh"]
  ```
- [x] 8.2 Verify the runner image contains everything the entrypoint + API need at runtime: `/app/node_modules` with PROD deps (from `deno ci --prod`); `/app/deno-dir` cache with `drizzle-kit` (so the entrypoint's `npm:drizzle-kit@0.31 migrate` resolves from cache, NOT node_modules — this is why `--prod` dropping drizzle-kit from node_modules is OK); `packages/db/drizzle/` (migration SQL) and `packages/db/drizzle.config.ts`; `packages/db/src/seed.ts`; `apps/api/src/main.ts` + imports; `scripts/check-users-empty.ts`; and the **compiled email templates** (confirm the `deno task email-build` output path — wherever it writes under `apps/api/` must be inside a copied dir). Inspect: `docker run --rm --entrypoint ls <image> /app/packages/db/drizzle /app/scripts /app/node_modules`.
- [x] 8.3 **FALLBACK TAKEN — §8 reverted to d30's `COPY --from=builder /app .` runner.** Not because the boot gate failed (it PASSED: migrate→seed-skip→start→`/health` 200 on the `--prod` image), but because `deno ci --prod` **does not prune devDependencies** for this hybrid Deno+npm workspace on 2.9.0 — the `--prod` image's `node_modules` stayed **347M** with `drizzle-kit`/`mjml`/`vite`/`vitest`/`@vitest`/`@types` still present as resolvable symlinks. So `--prod`'s stated mechanism (exclude devDeps) is a **no-op** here, for added Dockerfile complexity + a slower second install. (The `--prod` image WAS ~110 MB smaller — 1.18 vs 1.29 GB — but only incidentally, from the selective source `COPY` excluding `apps/web` build artifacts, NOT from `--prod`; that delta isn't worth coupling a second install into the runner and is better pursued via `.dockerignore` later if needed.) **Correction to an earlier hypothesis:** the first-boot npm re-download at boot is **pre-existing in d30's runner too** (verified by booting the d30-form image — 12 `registry.npmjs.org` hits), so it is NOT a `--prod` regression; offline-boot is a separate, pre-existing gap, out of scope for d31. The version bump (§2) and the `deps`-stage `deno ci` swap (§7.3) stand alone. Revisit `--prod` if a future Deno makes it actually exclude workspace devDeps.

## 9. Regenerate the lockfile (AFTER §4–§8 config edits)

- [x] 9.1 **CORRECTED (implementation finding):** use a **non-destructive** `deno install` on 2.9.0 (NOT `rm deno.lock && deno install`). The lock encodes member deps as RESOLVED specifiers (`npm:drizzle-orm@0.45`), which are invariant to the `catalog:` indirection (the catalog maps back to the identical range), so a non-destructive install folds the catalog in while preserving every locked version. `rm deno.lock` would float all `^`/`*` ranges to latest-in-range (verified: it churned hono/react/vite/vitest/mjml/tailwind/etc. — 1073-line diff), violating the "no dependency upgrades" Non-Goal. Lock stays `"version": "5"`.
- [x] 9.2 **Diff is EMPTY (corrected expectation).** Because the workspace section records resolved specifiers (`npm:drizzle-orm@0.45`, not the `^0.45.0` range form), the catalog migration produces a **byte-identical** lock — even cleaner than the prior "diff confined to workspace.members" claim. Verified: `diff` vs pre-d31 = 0 lines. Any non-empty resolved-version diff would signal `rm deno.lock` was used by mistake → revert and redo non-destructively.
- [x] 9.3 N/A — the non-destructive install did no fresh resolution, so `min-release-age` never applied (and the lock is unchanged anyway). No `.npmrc` (`design.md` Decision 4).
- [x] 9.4 GATE 1 (§13.4): `deno ci` (frozen) on 2.9.0 installs cleanly from the lock, exit 0, no "out of date" error — `catalog:` resolves under frozen install. Lock unchanged by `deno ci`. **PASSED.**
- [x] 9.5 N/A — local sandboxed Deno 2.9.0 was used (installed via the official installer into a scratchpad dir, leaving the brew-managed global 2.8.3 untouched, since `deno upgrade` is unavailable on the brew build). The Docker-image regen path was not needed.

## 10. Docs & memory prose → 2.9

- [x] 10.1 `README.md:29` — `| Runtime | Deno 2.7 ...` → Deno 2.9.
- [x] 10.2 `.serena/memories/tech_stack.md:5` — `| Runtime | Deno 2.7 ...` → Deno 2.9.
- [x] 10.3 `docs/requirements-audit-report.md:8` — `**Deno Version:** 2.7.13 (Docker)` → `2.9.0 (Docker)`.
- [x] 10.4 Grep the repo for remaining `2\.7\.14`, `2\.7\.13`, `2\.8\.1`, `2\.8\.3`, `Deno 2\.7`, `Deno 2\.8` (excluding `openspec/changes/d31-*`, `openspec/changes/archive`, `.git`, `node_modules`) and update stragglers. (Verified 2026-06-27: the only hits are the 5 Docker `FROM` lines + the 3 prose lines above — but re-check, since `main` may have moved.)

## 11. Workspace-integrity test + docblocks

- [x] 11.1 Add `packages/shared/src/workspace.test.ts` using the repo's BDD convention (`jsr:@std/testing/bdd` + `jsr:@std/expect`, matching `packages/shared/src/utils/slug.test.ts`). It reads the workspace configs from disk relative to the repo root (resolved from `import.meta.url`). **Reference skeleton:**
  ```ts
  import { describe, it } from 'jsr:@std/testing/bdd';
  import { expect } from 'jsr:@std/expect';

  /** Workspace root, derived from this file (packages/shared/src → up three levels). */
  const ROOT = new URL('../../../', import.meta.url);
  /** The four workspace members, relative to the workspace root. */
  const MEMBERS = ['apps/api', 'apps/web', 'packages/shared', 'packages/db'];

  /**
   * Reads and parses a JSON config relative to the workspace root.
   * @param path Path relative to the workspace root (e.g. 'deno.json').
   * @returns The parsed JSON object.
   */
  async function readJson(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await Deno.readTextFile(new URL(path, ROOT)));
  }

  describe('workspace integrity', () => {
    it('every member declares a name and a version', async () => {
      for (const m of MEMBERS) {
        const cfg = await readJson(`${m}/deno.json`);
        expect(cfg.name, `${m} must have a name`).toBeDefined();
        expect(cfg.version, `${m} must have a version`).toBeDefined();
      }
    });

    it('member names are unique', async () => {
      const names = await Promise.all(MEMBERS.map(async (m) => (await readJson(`${m}/deno.json`)).name));
      expect(new Set(names).size).toBe(names.length);
    });

    it('every "catalog:" reference maps to a defined root catalog key', async () => {
      const catalog = ((await readJson('deno.json')).catalog ?? {}) as Record<string, string>;
      for (const m of MEMBERS) {
        let pkg: Record<string, unknown>;
        try { pkg = await readJson(`${m}/package.json`); } catch { continue; }
        for (const [name, spec] of Object.entries((pkg.dependencies ?? {}) as Record<string, string>)) {
          if (spec === 'catalog:') {
            expect(catalog[name], `${m} references catalog:${name} but root catalog lacks "${name}"`).toBeDefined();
          }
        }
      }
    });

    it('root catalog defines every dependency duplicated across members', async () => {
      const catalog = ((await readJson('deno.json')).catalog ?? {}) as Record<string, string>;
      for (const dep of ['drizzle-orm', 'bcryptjs', 'zod']) {
        expect(catalog[dep], `root catalog must define ${dep}`).toBeDefined();
      }
    });
  });
  ```
- [x] 11.2 The skeleton's `readJson` already carries a docblock. Add docblocks to any additional helper introduced, and to any nearby function touched that is missing one (per the repo's docblock convention). `packages/shared` needs no new dependency — the `jsr:@std/...` imports resolve directly (the shared tests already use them inline).
- [x] 11.3 Confirm the test is picked up by `test.include` (`packages/shared/src/`) and runs green under `deno task test:shared` (and the root `test-coverage`). It needs `--allow-read` (the shared test task uses `--allow-all`, so this is covered).

## 12. `Deno.serve` 2.9 compression check (verify, no edit expected)

- [x] 12.1 Inspect `apps/api/src/main.ts:141-142` (`Deno.serve(app.fetch)` / `Deno.serve({ port: config.APP_PORT }, app.fetch)`). Confirm the app does not depend on `Deno.serve`'s now-off-by-default automatic compression (Hono owns compression). No change expected; if a regression appears, opt in with `Deno.serve({ port, automaticCompression: true }, app.fetch)`.

## 13. Format, lint, type-check, tests, and verification gates

- [x] 13.1 Run `make fmt` (or `deno fmt`) on the touched `deno.json`/`package.json`/`.ts` files. `deno fmt` does not touch `Dockerfile*`/CI YAML (not in the fmt include list) — format those by hand if needed.
- [x] 13.1a **2.9 formatter scope change — likely CI breaker, handle explicitly.** Deno 2.9 formats **HTML/XML/SVG by default** (no flag) and switches CSS to the `lax-css` formatter. Four files in the `fmt` scope (`apps/`, `packages/`; not excluded) were left alone by 2.7.14 and will now be reformatted: `apps/web/index.html`, `apps/web/public/404.html`, `apps/web/public/favicon.svg`, `apps/web/src/styles/globals.css`. Run `deno fmt` on 2.9.0, then **review the reformat carefully** — confirm `index.html` keeps its `%VITE_PUBLIC_APP_URL%`/Vite placeholders intact and `globals.css` keeps its Tailwind v4 `@import`/`@theme` directives intact — and **commit the result** so `deno fmt --check` passes in CI (`ci.yml:31`, `pr.yml:27`). If any reformat is undesirable or risky (e.g. it mangles the SVG or HTML placeholders), instead add the specific files or `*.html`/`*.svg`/`*.css` globs to the root `deno.json` `fmt.exclude` to preserve current behavior. Either way, after this step `deno fmt --check` MUST pass on 2.9.0.
- [x] 13.2 Run `make lint` (`deno lint apps/ packages/`) — fix any lint errors in the new test/helper.
- [x] 13.3 Run `make check` (`deno task check`) — all four members type-check clean on 2.9.0.
- [x] 13.4 **GATE 1 (lockfile):** `deno ci` installs cleanly from the regenerated lock on 2.9.0 (from §9.4).
- [x] 13.5 Run `make test` / `deno task ci` — all suites (api + shared + db Deno-native; web/vitest) green on 2.9.0, including the new sanitizer settings (§6) and the workspace-integrity test (§11). Note: sanitizers are a Deno-test feature — they do NOT affect the `apps/web` vitest suite.
- [x] 13.6 **GATE 2 (prod image boots):** build the API image (`make images` or `docker build -f Dockerfile .`) and run it against a local Postgres — confirm the entrypoint sequence (migrate → seed-once → start) succeeds and `GET /health` returns 200, proving `deno ci --prod` (§8) did not break the entrypoint's `drizzle-kit`/seed resolution. If this fails, execute §8.3 (revert the `--prod` runner).
- [x] 13.7 Build the web image (`docker build -f Dockerfile.web .` with default build-args) on 2.9.0 and confirm `GET /` serves `index.html` (the Vite build runs under the bumped `deps`/`builder` stages).
- [x] 13.8 `openspec validate d31-deno-29-upgrade --strict` passes.

## 14. Close out PR #54

- [ ] 14.1 After this change merges, close PR #54 (`feat/workspace-management`) with a note pointing to `d31-deno-29-upgrade` as its superseding change, and delete the stale branch. _(outstanding manual GitHub follow-up: PR #54 still open as of 2026-07-05; no code impact. Archived with this note as a reminder.)_
