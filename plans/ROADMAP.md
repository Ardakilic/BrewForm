# Roadmap

> Living index of remaining work and the only status table for debt and features. Per-item
> detail lives in the source-of-truth files: [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) for
> resolved history, [`D99-debts.md`](D99-debts.md) for deferred debt, and
> [`FEATURE_SUGGESTIONS.md`](FEATURE_SUGGESTIONS.md) for the feature backlog with per-plan PRDs.
> Update this file ONLY when an item's status changes; do NOT duplicate problem/fix detail here.

**Legend:** `P0` critical · `P1` correctness/security · `P2` structural · `P3` polish · `P4` deferred.

---

## Remaining Debt

### Wave 6 — 2026-11-18 audit remediation

The [2026-11-18 health audit](AUDIT-2026-11-18.md) found user-facing bugs and security gaps
behind the earlier "all debt resolved" status. The `wave-6-audit-remediation` OpenSpec change
fixed them in one pull request. After merge, the change is archived under
[`openspec/changes/archive/`](../openspec/changes/archive/) as
`<date>-wave-6-audit-remediation`. What it changed:

- **Security:** caller-scoped private recipe notes replace the notes IDOR, and the legacy notes
  `POST` is removed. Uploads get server-generated keys, magic-byte type checks and signed S3
  paths. Rate limiting gets its own store, trusted-proxy client IPs and per-account login limits.
- **Data correctness:** slugs are claimed in the transaction, with a random suffix on collision.
  Email and username uniqueness is case-insensitive. A recipe PATCH amends or bumps in one
  transaction and keeps omitted fields. Errors map to typed responses.
- **Visibility:** collections, search, lists, profiles, the sitemap and OG previews hide
  unlisted, draft, private and deleted recipes through shared conditions. Non-public pages are
  `noindex`.
- **Search:** ranked and paged in SQL with `pg_trgm` indexes and a statement timeout.
- **Web:** app-wide providers (the admin crash is fixed), list state in the URL, data loading
  through router loaders, actions and fetchers only, and charts rebuilt on one shared chart
  module.
- **Deploy:** a one-shot migrate service, liveness and readiness probes, a hardened Node 26
  runtime image, a same-origin Caddy edge, persistent upload and backup volumes, and one CI
  workflow with image smoke tests and a gated publish.
- **Docs and specs:** AGENTS.md, `docs/` and `plans/` are consolidated, the doc-drift and
  docblock guards are added, and the API reference is generated.

### Open items

Ledgered debt D01–D43 and D99.1–.19 stays resolved (see [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md)).
The open items are D44 and D99.20–.62. They come from three sources: what wave 6 deferred
(its `proposal.md` → Non-Goals), the audit findings it had no owner for, and follow-ups found
while implementing it.

| Priority | Id | Item | Effort |
|----------|----|------|--------|
| **P1** | [D99.26](D99-debts.md) | Account deletion keeps PII and public content; deleted emails and usernames are never released | Medium |
| **P1** | [D99.38](D99-debts.md) | Auth session hygiene: a password reset does not revoke sessions; reset tokens are stored in plaintext | Medium |
| **P2** | [D99.21](D99-debts.md) | `SetupUpdateSchema` keeps `isDefault: false`, so a setup PATCH clears the default flag | Low |
| **P2** | [D99.25](D99-debts.md) | Like, favourite, rate and the photo list skip visibility checks for draft/private recipes | Low–Medium |
| **P2** | [D99.29](D99-debts.md) | EXIF/GPS metadata is served with public photos (ships with F23) | Medium |
| **P2** | [D99.36](D99-debts.md) | 37 admin routes have no OpenAPI metadata, so `docs/api-reference.md` omits them | Medium |
| **P2** | [D99.39](D99-debts.md) | Equipment lookups stop at 20 items; admin equipment and recipe lists are unpaginated | Medium |
| **P2** | [D99.40](D99-debts.md) | Undefined `.input` CSS class on 13 form fields | Low |
| **P2** | [D99.41](D99-debts.md) | Photos are never shown: `PhotoUpload` is unmounted and there is no gallery | Medium |
| **P2** | [D99.42](D99-debts.md) | A comment reply can attach to a comment on another recipe | Low |
| **P2** | [D99.43](D99-debts.md) | Moderation UI (F15a): no Report button and no admin reports page | Small–Medium |
| **P2** | [D99.44](D99-debts.md) | Like/follow toggles send a new notification and email every time | Low–Medium |
| **P2** | [D99.45](D99-debts.md) | Cron and email are not multi-instance safe (needed before F29/F30 on more than one replica) | Medium |
| **P2** | [D99.47](D99-debts.md) | Web edge: no security headers, publicly served sourcemaps, no immutable asset caching | Low–Medium |
| **P2** | [D99.57](D99-debts.md) | Shared recipe links never reach the API's Open Graph renderer (the edge does not proxy `/recipes/*`) | Low |
| **P2** | [D99.59](D99-debts.md) | Reply button shown to the thread author, but the API answers 403 | Low |
| **P3** | [D44](D44-remove-taste-note-id-phase-2.md) | Remove the deprecated `tasteNoteId` filter (D28 phase 2) once the sunset criterion is met | Low |
| **P3** | [D99.20](D99-debts.md) | Recipe merge drops intensities, `tds` and coffee variety; it copies other users' brewer notes | Medium |
| **P3** | [D99.23](D99-debts.md) | Author-only "My recipes" listing | Medium |
| **P3** | [D99.24](D99-debts.md) | Unguessable URLs for unlisted recipes | Medium |
| **P3** | [D99.27](D99-debts.md) | Catalog-name uniqueness (equipment, vendors, coffee varieties, taste notes) | Medium |
| **P3** | [D99.28](D99-debts.md) | Drop the redundant plain indexes | Low |
| **P3** | [D99.30](D99-debts.md) | Per-user upload rate limit; env-configurable image dimension limits | Low |
| **P3** | [D99.31](D99-debts.md) | Search: full-text search, keyset paging on the score, current-version scope, minimum length | Medium–High |
| **P3** | [D99.32](D99-debts.md) | Playwright end-to-end and screenshot tests | Medium |
| **P3** | [D99.33](D99-debts.md) | Multi-arch images, a TLS compose overlay, a non-root web image | Medium |
| **P3** | [D99.34](D99-debts.md) | Admin lockout reset, env-tunable rate-limit policies, Valkey in CI | Low–Medium |
| **P3** | [D99.35](D99-debts.md) | Pre-infusion and flow-rate form inputs; an `extractionTimeSeconds` upper bound | Low |
| **P3** | [D99.37](D99-debts.md) | Top-level error boundary above the providers; safe `localStorage` access | Low |
| **P3** | [D99.46](D99-debts.md) | Observability: access logs, metrics, error tracking | Medium |
| **P3** | [D99.48](D99-debts.md) | Renovate configuration fixes (release age, JSON5) | Low |
| **P3** | [D99.49](D99-debts.md) | Recipe GET returns `tds` `'1.4'` for a stored `1.40` | Low |
| **P3** | [D99.50](D99-debts.md) | `/ready` reports `cache: "ok"` while Valkey is down | Low |
| **P3** | [D99.58](D99-debts.md) | robots.txt `Sitemap:` URL falls back to the SPA on split domains without `API_UPSTREAM` | Low |
| **P3** | [D99.60](D99-debts.md) | `grindSize` accepts 100 characters, the column holds 50 | Trivial |
| **P3** | [D99.61](D99-debts.md) | Taste-note search uses an unescaped, case-sensitive `like` | Low |
| **P4** | [D99.22](D99-debts.md) | "My notes" listing; an `amendedAt` marker for in-place amends | Medium |
| **P4** | [D99.51](D99-debts.md) | Unused `recipe/model.ts#update` | Trivial |
| **P4** | [D99.52](D99-debts.md) | Demo accounts seeded in production (accepted by the user on 2026-11-19; revisit before public sign-ups) | Low |
| **P4** | [D99.53](D99-debts.md) | Entry/exit logs missing in five API services; mount/unmount logs missing in five web files | Low |
| **P4** | [D99.54](D99-debts.md) | Log conventions: `durationMs` on exit logs; entity-named id keys instead of a bare `id` | Low–Medium |
| **P4** | [D99.55](D99-debts.md) | Log sampling and slow-query logging | Medium |
| **P4** | [D99.56](D99-debts.md) | Web telemetry: navigation timing and `unhandledrejection` logging | Low |
| **P4** | [D99.62](D99-debts.md) | `make ci` runs the web tests twice | Trivial |

---

## Feature Backlog

Status reflects each F-plan's 2026-07-13 validation verdict, the 2026-08-13 refresh pass and
the 2026-11-21 wave-6 refresh. Ship dates are the merge dates of the linked pull requests.

| Priority | Feature | Effort | Impact | Status | PRD |
|----------|---------|--------|--------|--------|-----|
| **P0** | @Mention notifications (F04) | Low | High | ✅ Shipped (2026-07-17, #114) | [`F04`](F04-mention-notifications.md) |
| **P0** | Recipe collections (F01) | Medium | High | ✅ Shipped (2026-07-09, #112) | [`F01`](F01-recipe-collections.md) |
| **P0** | Recipe comparison improvements (F08) | Medium | High | ✅ Shipped (2026-07-28, #122) | [`F08`](F08-recipe-comparison-improvements.md) |
| **P0** | Recipe version diff (F09) | Medium | High | ✅ Shipped (2026-07-28, #123) | [`F09`](F09-version-diff.md) |
| **P1** | In-app notification center (F05) | High | High | ✅ Shipped (2026-08-02, #124) | [`F05`](F05-in-app-notifications.md) |
| **P1** | Advanced search w/ facets (F11) | Medium | High | ✅ Shipped (2026-08-12, #125) | [`F11`](F11-advanced-search.md) |
| **P1** | Image optimisation (F23) | Medium | Medium | ✅ Refreshed (2026-11-21): sharp-based design; also closes D99.29 | [`F23`](F23-image-optimisation.md) |
| **P2** | Brew journal / "brew again" (F02) | Medium | Medium | ✅ Shipped (2026-08-13, #126) | [`F02`](F02-brew-journal.md) |
| **P2** | Recipe templates (F06) | Low | Medium | ✅ Refreshed (2026-08-13) | [`F06`](F06-recipe-templates.md) |
| **P2** | Batch/scale calculator (F07) | Low | Medium | ✅ Refreshed (2026-11-21): Vitest test notes | [`F07`](F07-batch-calculator.md) |
| **P2** | Similar recipes (F12) | Medium | Medium | ✅ Refreshed (2026-08-13) | [`F12`](F12-similar-recipes.md) |
| **P2** | Equipment reviews/ratings (F27) | Medium | Medium | ✅ Valid (test plan moved to Vitest 2026-11-21) | [`F27`](F27-equipment-reviews.md) |
| **P3** | Brew method landing pages (F14) | Medium | Low | 🔧 Rough — SEO stack undecided | [`F14`](F14-brew-method-pages.md) |
| **P3** | Recipe export/import (F10) | Medium | Medium | ✅ Refreshed (2026-08-13) | [`F10`](F10-recipe-export-import.md) |
| **P3** | Admin analytics (F17) | Medium | Low | ✅ Re-scoped (2026-11-21): UI over the existing `/admin/analytics/*` endpoints first | [`F17`](F17-admin-analytics.md) |
| **P3** | PWA / offline (F25) | High | Medium | ✅ Refreshed (2026-11-21): PWA shell valid; brew-log sync unblocked by F02 | [`F25`](F25-pwa-offline.md) |
| **P3** | Public API v2 (F21) | High | Medium | ✅ Valid | [`F21`](F21-public-api.md) |

**Not in matrix:**

- ✅ Unblocked by F02 (shipped 2026-08-13; plans carry 2026-11-21 refresh notes that point at
  `brewLogs`, `/api/v1/brew-logs` and `getUserBrewStats`): F03, F20, F26, F28. F25 is in the
  matrix above.
- ✅ Refreshed (2026-08-13, validated twice): F13, F18, F19. F15 was split on 2026-11-21 into F15a
  (Report button/dialog and admin reports page, which is D99.43) and F15b (auto-flagging).
- ✅ Refreshed (2026-11-21, node-cron jobs): F16, F29, F30. Running these jobs on more than one
  API replica needs D99.45.
- ✅ Re-scoped (2026-11-21): F24 is cut to version immutability guards (the diff shipped as F09).
- ✅ Valid (ready to spec): F28, F29, F30, F31. F31's embed route needs a per-route override of
  the global frame-blocking headers.
- 🔧 Rough: F22 webhooks.

---

## Next candidates

1. **F03** (user profile stats): unblocked by F02's shipment (2026-08-13). Its refresh note
   (2026-11-21) points at `brewLogs`, `/api/v1/brew-logs` and `getUserBrewStats`.

**Optional quick wins** (no plan refresh needed):

- Any ✅ Valid feature: F21, F27, F28, F29, F30, F31 (F29/F30 on more than one replica need
  D99.45 first).

---

## History

- **Waves 0–4** (2026-07-05 → 2026-07-07): all ledgered D-items resolved. See
  [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) for the per-item resolution log.
- **Wave 5** (2026-07-27): resolved D99.1, .3, .5, .6, .7, .9, .10–.16, .19 via the
  `wave-5-debt-clearance` OpenSpec change. D99.8, .17, .18 remain deferred by design.
- **Remaining debt clearance** (2026-07-27): resolved D99.4, .8, .17, .18 via the
  `remaining-debt-clearance` OpenSpec change. The D99 ledger was closed (reopened 2026-11-21
  with D99.20+).
- **Features shipped** (merge dates): F01 (recipe collections, 2026-07-09, #112), F04 (mention
  notifications, 2026-07-17, #114), F08 (recipe comparison improvements, 2026-07-28, #122), F09
  (recipe version diff, 2026-07-28, #123), F05 (in-app notification center, 2026-08-02, #124),
  F11 (advanced search, 2026-08-12, #125), F02 (brew journal / "brew again", 2026-08-13, #126).
- **Plan refresh pass** (2026-08-13): all 12 outdated plans (F02, F06, F07, F10, F12, F13, F15,
  F16, F17, F18, F19, F25) re-validated against the current codebase with correction banners
  (F11 convention), each independently validated twice. No ⚠️ Outdated items remain.
- **Platform changes:** #135 (2026-10-11) moved the runtime to Node 24 LTS with pnpm; #149
  (2026-11-02) Node 26 LTS; #166 (2026-11-11) production compose, the redis cache driver and
  `CACHE_ENABLED`; #168 (2026-11-11) authenticated Valkey 9.1 replaces redis; wave 6 added the
  Node 26 runtime image with `serve`/`migrate` modes, the same-origin Caddy edge, health and
  readiness probes, and one CI workflow with a gated image publish.
- **Wave 6** (2026-11-18 audit → 2026-11-21): `wave-6-audit-remediation` fixed the
  [audit](AUDIT-2026-11-18.md) findings (see Remaining Debt → Wave 6). Deferrals, unowned
  findings and implementation follow-ups are ledgered as D44 and D99.20–.62. The plans were
  refreshed for Node, pnpm, Vitest and sharp (F07, F16, F17, F23, F27, F29, F30). F03, F20, F25,
  F26 and F28 got F02 refresh notes, F24 was cut to immutability guards, F15 was split into
  F15a/F15b, and F31 got its frame-header note.
