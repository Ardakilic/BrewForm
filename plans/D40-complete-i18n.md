# D40 — Complete i18n Coverage (Admin, Legal, Compare & Auxiliary Pages)

**Severity:** Low
**Status:** Open (2026-07-04)
**Relationship:** Gives `TECHNICAL_DEBT.md` §4.5 its dedicated plan. The i18n infrastructure (`contexts/I18nContext`, `useTranslation`, en/tr locale files) is in place and used across the main product surface — this plan finishes the tail.

---

## Problem

A July 2026 sweep found 20 pages that render hardcoded English despite `t()` being available:

### Zero `t()` calls (fully hardcoded)

**All 15 admin pages** (`apps/web/src/pages/admin/`):
`AdminAuditLogPage`, `AdminBadgesPage`, `AdminCachePage`, `AdminCoffeeVarietiesPage`, `AdminCompatibilityPage`, `AdminDashboard`, `AdminEquipmentPage`, `AdminLayout`, `AdminRecipesPage`, `AdminTasteNotesPage`, `AdminUserCreatePage`, `AdminUserDetailPage`, `AdminUserEditPage`, `AdminUsersPage`, `AdminVendorsPage`

**5 user-facing pages**:
- `apps/web/src/pages/recipes/RecipeComparePage.tsx`
- `apps/web/src/pages/auth/VerifyEmailPage.tsx`
- `apps/web/src/pages/PrivacyPage.tsx`
- `apps/web/src/pages/TermsPage.tsx`
- `apps/web/src/pages/NotFoundPage.tsx`

### Partial (2 `t()` calls each — section titles, labels, placeholders still hardcoded)

- `apps/web/src/pages/recipes/RecipeCreatePage.tsx`
- `apps/web/src/pages/recipes/RecipeEditPage.tsx`

A Turkish-locale user hits English on every admin screen, the compare view, email verification, legal pages, and 404s.

---

## Proposed Fix

1. **Establish key namespaces** in the en/tr locale files: `admin.*` (with per-page sub-namespaces like `admin.users.*`, `admin.dashboard.*`, plus `admin.common.*` for shared table headers/actions), `compare.*`, `verifyEmail.*`, `legal.privacy.*`, `legal.terms.*`, `notFound.*`. Extend the existing `recipe.create.*`/`recipe.edit.*` namespaces for the partial pages.
2. **User-facing pages first** (higher visibility, small): `NotFoundPage` (~3 strings; coordinate with D37, which may move this component into `ErrorPage.tsx` — land D37 first or apply keys in the consolidated module), `VerifyEmailPage`, `RecipeComparePage`, then `PrivacyPage`/`TermsPage`. For the legal pages decide explicitly: translate fully, or keep the legal body in English with a translated header/notice — record the decision; do not leave them silently hardcoded.
3. **Finish the partial recipe pages**: sweep `RecipeCreatePage.tsx` / `RecipeEditPage.tsx` for remaining literals (section titles rendered via the `Section` helper, field labels, placeholders, validation/toast messages). If D36 has extracted `Section`/`Field`, pass already-translated strings as props.
4. **Admin pages**: convert per page, starting with `AdminLayout` (nav labels appear on every admin screen) and `AdminDashboard`, then the CRUD pages. Extract shared admin vocabulary (Save/Cancel/Delete/Search/Status columns) into `admin.common.*` to avoid 15 copies. Coordinate with D36 so `BanDialog` is translated once.
5. **Turkish translations**: fill `tr` for every new key — no key may fall back to English silently. If the project has a fallback mechanism, still require the `tr` entry (machine-draft + review is acceptable; mark drafts for review).
6. **Guardrail**: add a locale-parity test (if not already present) asserting en/tr key sets are identical, so future keys can't ship half-translated.
7. Run `make ci`.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/web/src/pages/admin/*.tsx` (15 files) | Replace literals with `t()` |
| `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Full conversion |
| `apps/web/src/pages/auth/VerifyEmailPage.tsx` | Full conversion |
| `apps/web/src/pages/PrivacyPage.tsx`, `TermsPage.tsx` | Conversion per legal-content decision |
| `apps/web/src/pages/NotFoundPage.tsx` (or consolidated `ErrorPage.tsx` after D37) | Full conversion |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx`, `RecipeEditPage.tsx` | Finish partial conversion |
| Locale files (en/tr) under the i18n package/directory | New namespaces + parity |
| Locale-parity test file | **New** (if absent) |

---

## Test Plan

- Locale-parity test: en and tr expose identical key sets.
- Per converted page: render under the tr locale in a component test and assert at least one known Turkish string appears (spot-check, not exhaustive).
- Grep gate per converted file: no user-visible string literals remain in JSX outside `t()` calls (reviewer check; aria-labels and alt text included).
- Manual: switch language to Turkish, walk the admin nav and the five user-facing pages.

---

## Acceptance Criteria

- [ ] Zero pages with zero `t()` calls remain under `apps/web/src/pages/`.
- [ ] RecipeCreatePage/RecipeEditPage fully converted.
- [ ] Every new key exists in both en and tr; parity test enforces this.
- [ ] Legal-pages translation decision recorded in the implementing change.
- [ ] `make ci` passes.

---

## Effort Estimate

**Medium–High** — 2–3 days spread over multiple PRs (admin pages are numerous but formulaic). Recommended split: (1) user-facing five + recipe pages, (2) AdminLayout/Dashboard + admin.common, (3) remaining admin CRUD pages.
