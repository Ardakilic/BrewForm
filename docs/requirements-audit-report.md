# BrewForm Requirements Audit Report

**Date:** 2026-05-03\
**Auditor:** OpenCode Agent\
**Plan Reference:** `brewform-plan.md` (all sections §1–§11)\
**Method:** Code inspection + Docker build/runtime verification (`make build`, `make up`,
`make check`, `make test`) + test execution\
**Deno Version:** 2.9.0 (Docker)\
**Test Results:** 45 passed, 0 failed, 316 steps

---

## Executive Summary

| Dimension                  | Score   | Notes                                                                                                             |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| **Database Schema**        | 95%     | Comprehensive, matches plan. Minor: `extractionYield` not stored.                                                 |
| **Backend API Structure**  | 85%     | All modules exist, routing correct. Validation partially unwired.                                                 |
| **Frontend Pages**         | 80%     | All planned pages exist. Key UI flows incomplete.                                                                 |
| **Shared Package**         | 90%     | Types, schemas, constants, utils, i18n all present.                                                               |
| **Validation Enforcement** | 60%     | Zod schemas present. Hard validation for dates wired. Brew-method compatibility and equipment validation unwired. |
| **Social Features**        | 85%     | Likes, comments, follows, feed implemented. Badge automation missing.                                             |
| **Infrastructure/Docker**  | 65%     | Multi-stage Dockerfile present. Critical build/runtime bugs found and fixed during audit.                         |
| **Tests**                  | 70%     | 45 unit tests pass. Thin integration coverage. Critical paths untested.                                           |
| **Overall Compliance**     | **78%** | Solid foundations, significant integration gaps.                                                                  |

**Critical Gaps Found:** 4\
**Major Gaps Found:** 8\
**Minor Gaps Found:** 6

---

## §1 Concept — Status: ✅ Implemented

The app structure supports recording brewing recipes, attaching tasting notes, and social sharing.

---

## §2 Drink Brewing Dive-In Properties

### §2.1 Coffee Identity — ✅ Implemented

- `productName`, `coffeeBrand`, `coffeeProcessing`, `vendorId` fields present in schema, API, and
  forms.
- Vendor CRUD module exists.

**Gap:** No autocomplete for vendor selection in recipe form. (Minor)

### §2.2 Date Tracking — ✅ Implemented

- `roastDate`, `packageOpenDate`, `grindDate`, `brewDate` fields present.
- Hard validation (`grindDate >= roastDate`) wired in `RecipeCreateSchema` via `.refine()`
  (confidence: 10/10).

**Gap:** Plain date inputs used instead of dedicated datepicker component. (Minor)

### §2.3 Brew Configuration — ✅ Partial

- `BrewMethod` and `DrinkType` enums present. `compatibleMethods` filtering works in UI.
- Drink type auto-adjusts when brew method changes in create form.

**Gap:** Brew-method/drink-type compatibility hard validation exists in `shared/utils/validation.ts`
but is NOT enforced in `RecipeCreateSchema` or API service. (Major)

### §2.4 Equipment — ✅ Partial

- `Equipment` model, CRUD API, `RecipeEquipment` pivot table exist.
- Setup model and API exist.

**Gap:** Recipe create/edit UI does NOT expose equipment selection. Setup auto-fill during recipe
creation is NOT wired. (Critical)

### §2.5 Yield Details — ✅ Implemented

- `extractionTimeSeconds`, `extractionVolumeMl` fields present.

### §2.6 Extraction Temperature — ✅ Implemented

- `temperatureCelsius` field present.

### §2.7 Additional Preparation Details — ✅ Partial

- Schema and API support `RecipeAdditionalPreparation`.

**Gap:** No UI fields in recipe create/edit for adding preparations. (Major)

### §2.8 Personal Tasting Notes — ✅ Implemented

- `personalNotes`, `rating` (1-10), `emojiTag`, `isFavourite` all present in schema and UI.

### §2.9 Photo Attachments — ✅ Partial

- `PhotoUpload` component with drag-drop and client-side canvas thumbnail exists.
- `Photo` and `RecipeVersionPhoto` models exist.

**Gap:** `RecipeVersionPhoto` junction is included in Drizzle queries but NEVER populated when a
recipe is created (photos linked to `Recipe` only). No gallery/carousel on detail page. No
server-side image resizing. (Major)

### §2.10 SCAA Taste Notes — ✅ Implemented

- `TasteNote` hierarchy imported from `files/scaa-2.json`.
- `TasteAutocomplete` component with debounce and hierarchical results.
- Admin CRUD page present.
- Deno KV caching with TTL and flush on admin changes.

**Gap:** Debounce is ~300ms (plan specifies 2 seconds). Uses custom autocomplete instead of BaseUI
Autocomplete. (Minor)

---

## §3 Core Features

### §3.1 User Setups (Auto-Fill) — ❌ Missing

- `Setup` model and API exist. Setup list page exists. Default-setup logic exists.

**Gap:** Recipe creation page has NO setup selector and does NOT auto-fill equipment fields from a
setup. (Critical)

### §3.2 My Equipment & My Beans — ✅ Implemented

- Full CRUD API and pages for both.

### §3.3 Autocomplete for Common Fields — ❌ Missing

**Gap:** Only taste notes have autocomplete UI. Grinder, machine, vendor, and equipment fields do
not. (Major)

### §3.4 Social Features — ✅ Implemented

- **Likes/Favourites:** Fully implemented with pivot table, counts, email notifications with
  opt-out.
- **Comments:** Implemented with pagination, OP badge, author-only reply restriction. Email
  notification on new comment.
- **Sharing/Featured:** Slug-based URLs exist. Feature toggle API exists.

**Gap:** No dedicated "Copy share link" button in UI. (Minor)

### §3.5 Follow Users — ✅ Implemented

- Follow/unfollow, follower/following lists, counts on profile, personalized feed (`/follow/feed`).
- Email notifications (new follower, followed-user posted) with preference opt-out.

### §3.6 Recipe Versioning & Edit History — ✅ Partial

- `RecipeVersion` table, `bumpVersion` flag on PATCH, immutable versions, `currentVersionId`
  tracked.

**Gap:** No UI to browse full version history (no version timeline or revert). (Major)

### §3.7 Forking / Remixing — ✅ Implemented

- Fork endpoint creates copy with `forkedFromId`, increments `forkCount`. Attribution link on detail
  page.

### §3.8 Visibility States — ✅ Implemented

- `draft`, `private`, `unlisted`, `public` fully supported in schema, API, and UI.

### §3.9 Comparison — ✅ Implemented

- `RecipeComparePage` with side-by-side parameter tables, taste notes, and equipment.

### §3.10 Search & Filtering — ✅ Partial

- `RecipeListPage` with full filter sidebar: search text, brew method, drink type, equipment, taste notes, sort order, visibility (admin).

**Gap:** No full-text search abstraction (`SearchProvider`). No URL-reflected filter state. No
dedicated browse pages grouped by grinder, bean, vendor, etc. (Major)

### §3.11 User Profiles — ✅ Partial

- Profile page with recipes, badges, follower/following counts, follow button.

**Gap:** "Featured recipes" section not visible on profile page. (Minor)

### §3.12 Derived Coffee Metrics — ✅ Partial

- `brewRatio` and `flowRate` computed server-side on create/update.

**Gap:** `extractionYield` utility exists but is NOT computed or stored. (Minor)

### §3.13 Achievement Badges — ❌ Missing Automation

- `Badge` and `UserBadge` models present. All plan badges seeded. `evaluateBadges` service exists.

**Gap:** Badge evaluation is NOT triggered automatically. Job scheduler has zero registered jobs.
Recipe/comment/fork/follow services do not call `evaluateBadges`. Users must be evaluated manually
via API endpoint. (Critical)

### §3.14 QR Code Generation — ✅ Implemented

- PNG/SVG generation supported. Visibility guard. `?from=qr` routing to unavailable page.

### §3.15 Brew Method Compatibility Matrix — ✅ Partial

- `BrewMethodEquipmentRule` model, seeded data, admin compatibility page exist.

**Gap:** Runtime validation in recipe creation is NOT enforced against the matrix. Matrix is NOT
cached in Deno KV. (Major)

### §3.16 User Preferences — ✅ Partial

- DB model and API for unit system, temperature unit, locale, timezone, date format, email toggles.
  Settings UI present.

**Gap:** Theme is NOT persisted in DB (only localStorage). Locale saved in DB but I18nContext reads
localStorage first. Timezone not auto-detected on first login. Unit preferences NOT consumed by
recipe display pages (always shows metric). (Major)

### §3.17 Recipe Print View & Focus Mode — ✅ Implemented

- Both dedicated pages exist. Print view auto-triggers `window.print()`. Focus mode strips
  navigation.

### §3.18 Onboarding Flow — ✅ Partial

- 5-step wizard exists, skippable, sets `onboardingCompleted` flag.

**Gap:** Steps are static informational cards with links; no inline equipment/beans form or guided
first-brew creation with tooltips. (Minor)

### §3.19 Cookie Consent & Privacy — ✅ Implemented

- `CookieConsent` banner, `PrivacyPage`, `TermsPage` all present.

---

## §4 Data Normalization & Scale Rules — ✅ Implemented

- All numeric values stored in canonical units (grams, ml, °C, seconds).
- Filterable fields reference normalized entities (IDs/enums).
- Equipment, beans, vendors, brew methods, drink types normalized into dedicated tables.
- Soft deletes (`deletedAt`) present on all major entities.
- Indexes on filterable fields confirmed in schema.

---

## §5 Validation Rules — ✅ Partial

### §5.1 General — ✅ Implemented

- Zod schemas used consistently in API and forms.

### §5.2 Hard Validation — ✅ Partial

- `grindDate >= roastDate`: ✅ Enforced in `RecipeCreateSchema` via `.refine()`.
- Required fields: ✅ Enforced by Zod schema.
- Numeric ranges: ✅ Enforced by Zod (`.positive()`, `.min()`, `.max()`).
- Brew method / equipment compatibility: ❌ NOT enforced.
- Recipe version immutability: ✅ Enforced (versions are created, not edited).

### §5.3 Soft Validation — ❌ Missing

- Soft warnings (ratio range, time range, temp range, milk-prep) exist in
  `shared/utils/validation.ts` but are NOT returned by API or shown in UI. (Major)

---

## §6 Technical Stack

### §6.1 Deno KV — ✅ Implemented

- `CacheProvider` abstraction with `DenoKVCacheProvider` and `InMemoryCacheProvider`.
- Taste notes taxonomy cache with TTL and flush.

**Gap:** Compatibility matrix not cached. Popular/trending recipes not cached. (Minor)

### §6.2 Abstraction Layers — ✅ Implemented

- `CacheProvider` interface properly abstracted.
- Drizzle ORM used as DB abstraction. No raw SQL found.

### §6.3 Docker Setup — ❌ Critical Gaps Found

- Multi-stage Dockerfile present using `denoland/deno:debian-2.9.0`.
- `compose.yml` includes app, postgres, mailpit, pgadmin.

**Gaps Found & Fixed During Audit:**

1. **Missing `.dockerignore`**: `COPY . .` overwrote Docker-installed `node_modules` with host's
   incomplete copy, causing `nodemailer` not found. (Critical — fixed by creating `.dockerignore`)
2. **Missing workspace `node_modules` copy**: Dockerfile only copied root `node_modules` from `deps`
   stage, missing `apps/api/node_modules` where `nodemailer@7.0.13` was installed. (Critical — fixed
   by adding `COPY --from=deps /app/apps/api/node_modules`)
3. **Missing `--unstable-sloppy-imports` in Dockerfile**: `deno check` and runtime CMD failed
   because Deno requires explicit extensions or sloppy-imports flag for the project's import style.
   (Critical — fixed by adding `.ts` extensions to all barrel files and removing the flag)
4. **Postgres 18+ volume mount incompatibility**: Volume mounted at `/var/lib/postgresql/data` but
   postgres:18-trixie requires `/var/lib/postgresql`. (Critical — fixed by changing mount path in
   `compose.yml`)
5. **pgadmin email validation rejected `.local` TLD**: `PGADMIN_DEFAULT_EMAIL` used `.local` which
   pgadmin rejects. (Minor — fixed by changing to `.dev`)

**Remaining Runtime Gap:**

- ~~RESOLVED: Migrated from Prisma to Drizzle ORM. This error no longer applies.~~

### §6.4 Monorepo Structure — ✅ Implemented

- Deno workspaces monorepo.
- `apps/api`, `apps/web`, `packages/shared`, `packages/db` all present.
- Dependency graph matches plan.

### §6.5 API Middleware Stack — ✅ Implemented

- CORS, requestId, rate limiting, error handler, auth middleware all present and wired.
- Response envelope helper (`success`, `error`, `paginated`) used consistently.

### §6.6 Authentication — ✅ Implemented

- JWT access/refresh tokens, password reset with token expiry, banned-user blocking, admin
  middleware.

### §6.7 Graceful Shutdown — ✅ Implemented

- `SIGTERM`/`SIGINT` handlers present in `main.ts`.

### §6.8 DB Connection Pooling — ✅ Implemented

- Configurable via `DATABASE_URL` query params. Documented in `.env.example`.

### §6.9 OpenAPI — ✅ Implemented

- `hono-openapi` with `describeRoute()` metadata covering all mounted route groups: `auth`,
  `recipe`, `admin`, `health`, `beans`, `badges`, `coffee-varieties`, `comments`, `contact`,
  `equipment`, `follow`, `photos`, `preferences`, `qrcode`, `reports`, `setups`, `taste-notes`,
  `users`, `vendors`, `share`, and `sitemap`.
- Typed request/response schemas: responses are described with `resolver()`; request bodies are
  described by converting the same Zod input schema to JSON Schema (Zod v4 `z.toJSONSchema` via the
  `jsonRequestBody` helper), since `hono-openapi` v1.3.0's `resolver()` only processes response
  schemas.
- Toggleable via `OPENAPI_ENABLED` env var.

### §6.10 Environment & Configuration — ✅ Implemented

- `.env.example` present. Zod-validated config module.

### §6.11 Deno Configuration — ✅ Implemented

- Minimal `deno.json` with compiler options, lint, fmt, test config. No import maps.

### §6.12 Makefile — ✅ Implemented

- All commands run through Docker. `run --rm` vs `exec` used correctly.

---

## §7 Authentication & Authorization — ✅ Implemented

Register, login, reset password, JWT strategy, email templates all present.

---

## §8 Admin Panel — ✅ Partial

- Dashboard, user ban/unban/admin-role, recipe visibility, equipment/taste-note/compatibility/badge
  CRUD, audit logging, cache flush all present.

**Gap:** Report moderation UI absent (API exists but no admin page). Analytics dashboard absent.
(Minor)

---

## §9 Frontend & UX

### §9.1 Architecture — ✅ Implemented

- React SPA with Vite. API client with automatic token refresh.

### §9.2 Design — ✅ Partial

- Three themes (light/dark/coffee) implemented via CSS variables.

**Gap:** Theme stored in localStorage only, not synced to DB preferences. (Major)

### §9.3 Landing Page — ✅ Implemented

- Navigation, footer, latest recipes, most starred recipes.

### §9.4 Error Pages — ✅ Implemented

- Custom 404, 500 pages.

### §9.5 SEO & Social Sharing — ❌ Critical Gap

- `SEOHead` and `JsonLd` components inject meta tags client-side.

**Gap:** Because this is a static SPA, Open Graph meta tags are injected via JavaScript and will NOT
be visible to social crawlers or search engines. The plan calls for SSR/pre-rendering or a
lightweight meta-tag service; neither is implemented. The `/recipes/meta/:slug` backend endpoint
exists but is not used for crawler-facing meta tags. (Critical)

### §9.6 Onboarding — ✅ Partial (see §3.18)

### §9.7 Cookie Consent — ✅ Implemented

---

## §10 API & Infrastructure

### §10.1 API Design — ✅ Implemented

- Versioned (`/api/v1/`). Rate limiting via Deno KV. Health/readiness probes. CORS. Request IDs.
  Consistent envelopes.

### §10.2 Caching & Performance — ✅ Partial

- Deno KV used for taste notes and rate limiting.

**Gap:** No background jobs registered. No popular/trending recipe caching. (Major)

### §10.3 Reporting & Moderation — ✅ Partial

- Content reporting API exists.

**Gap:** No moderation UI in admin panel. (Minor)

### §10.4 Analytics — ❌ Missing

- No analytics dashboard or usage stats endpoint. (Minor)

---

## §11 Deployment — ✅ Partial

- Dockerfile, compose.yml, Makefile, GitHub Actions CI workflows present.

**Gap:** No deployment job to Deno Deploy or GitHub Pages in workflows. CI is lint/test only.
(Minor)

---

## Prioritized Gap List

### 🔴 Critical (Blocks core functionality or build)

| #  | Gap                                                                                                     | Plan Ref   | Evidence                                                           |
| -- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| ~~C1~~ | ~~App container crashes at runtime: `import { Prisma } from '@prisma/client'` fails under Deno npm compat~~ — RESOLVED: Migrated to Drizzle ORM | §6.3       | ~~`docker compose logs app` shows `SyntaxError`~~                      |
| C2 | Recipe create/edit form has NO equipment selection or setup auto-fill                                   | §2.4, §3.1 | `RecipeCreatePage.tsx` lacks `equipmentIds`/`setupId` fields       |
| C3 | Badge evaluation never triggered automatically — gamification is dead code                              | §3.13      | `grep` shows `evaluateBadges` only called from manual API endpoint |
| C4 | OG tags invisible to crawlers — social sharing broken                                                   | §9.5       | `SEOHead.tsx` uses client-side `document.querySelector` injection  |

### 🟠 Major (Missing feature or incomplete implementation)

| #  | Gap                                                                    | Plan Ref   | Evidence                                                        |
| -- | ---------------------------------------------------------------------- | ---------- | --------------------------------------------------------------- |
| M1 | Brew-method/drink-type compatibility hard validation unwired           | §2.3, §5.2 | `validation.ts` has logic but not called in schema or service   |
| M2 | Brew-method/equipment compatibility validation unwired                 | §3.15      | Matrix data exists but no runtime check in recipe service       |
| M3 | Soft validation warnings not returned by API or shown in UI            | §5.3       | `validateSoftWarnings` exists but unused in API layer           |
| M4 | User preferences (units, theme, locale) not consumed by recipe display | §3.16      | Recipe pages show raw metric values always                      |
| M5 | `RecipeVersionPhoto` table exists but never populated                  | §2.9       | Model includes it in queries but create path never writes to it |
| M6 | Photo gallery/carousel absent from recipe detail page                  | §2.9       | No gallery component found in frontend                          |
| M7 | No version history browsing UI                                         | §3.6       | No version list/timeline page found                             |
| M8 | Search lacks dedicated browse pages                                     | §3.10      | Search removed; filtering consolidated in RecipeListPage with URL sync |

### 🟡 Minor (Polish, nice-to-have, or partially implemented)

| #  | Gap                                                                      | Plan Ref | Evidence                                    |
| -- | ------------------------------------------------------------------------ | -------- | ------------------------------------------- |
| N1 | Taste autocomplete debounce is ~300ms (plan: 2s); custom impl not BaseUI | §2.10    | `TasteAutocomplete.tsx`                     |
| N2 | No vendor autocomplete in recipe form                                    | §2.1     | RecipeCreatePage uses plain text input      |
| N3 | No grinder/machine autocomplete                                          | §3.3     | Plain text inputs used                      |
| N4 | Onboarding steps are static links, not inline forms                      | §3.18    | `OnboardingWizard.tsx`                      |
| N5 | Admin panel missing report moderation page                               | §8       | No `AdminReportsPage.tsx` found             |
| N6 | CI workflows lack deployment jobs                                        | §11      | `.github/workflows/ci.yml` only lints/tests |

---

## Fixes Applied During Audit

To enable the audit to proceed, the following minimal fixes were applied:

1. **Created `.dockerignore`** — excluded `node_modules`, `.git`, `.turbo`, `coverage`
2. **Updated `Dockerfile`** — added `COPY --from=deps /app/apps/api/node_modules`
3. **Updated `compose.yml`** — changed postgres volume mount from `/var/lib/postgresql/data` to
   `/var/lib/postgresql`; changed pgadmin email from `.local` to `.dev`

These fixes should be committed to the repo.

---

## Recommendations

1. ~~**Fix Prisma/Deno runtime compatibility** (C1)~~: RESOLVED. Migrated from Prisma to Drizzle ORM. This recommendation no longer applies.
2. **Wire validation** (M1, M2, M3): Add `.refine()` calls to `RecipeCreateSchema` for brew-method
   compatibility, and call `validateSoftWarnings` in the recipe service to return warnings in the
   API response.
3. **Trigger badge evaluation** (C3): Call `evaluateBadges(userId)` after recipe creation, comment
   posting, fork, and follow actions.
4. **Add equipment/setup to recipe form** (C2): Add equipment picker and setup selector to
   `RecipeCreatePage.tsx`.
5. **Fix OG tags** (C4): Create a lightweight backend endpoint (e.g., `/share/:slug`) that renders
   HTML with proper meta tags for crawlers, or implement SSR for public recipe pages.
6. **Consume preferences in UI** (M4): Read user preferences from API on app load and apply unit
   conversions in recipe display components.
7. **Populate `RecipeVersionPhoto`** (M5): When creating a recipe version, copy current recipe
   photos into `RecipeVersionPhoto` junction records.

---

_End of Report_
