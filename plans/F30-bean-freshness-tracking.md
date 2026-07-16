# F30 — Bean Roast-Date Freshness Tracking

> **Validation status (2026-07-13): ✅ Valid**
>
> - Verified. `recipeVersions.roastDate` / `packageOpenDate` / `grindDate` / `brewDate` present (`schema.ts:176-239`, cited 175-238); `brewDate` is notNull default now. The `beans` table still has NO roast date (`schema.ts:386-414`) — the plan correctly flags any `beans.roastDate` assumption as wrong.
> - `brewMethod` enum sourced from `BREW_METHOD_VALUES`; `espresso_machine` and `cold_brew` both exist for the method-specific windows. `BeanSection` receives `roastDate`/`packageOpenDate`/`grindDate`/`brewDate` props (`RecipeFocusModePage.tsx:134-145`, exact). Shared `utils/` + `constants/` dirs follow the `*_VALUES` convention.
> - Phase-2 note: F04 has landed an in-app notification substrate (`notifications` table + `apps/api/src/modules/notification/`). The phase-2 "approaching past peak" nudge could ride that (in-app) in addition to email, gated by a `userPreferences` flag.

## Summary

Derive a coffee-freshness status from the roast date already captured on recipe versions and surface it as a badge on recipe pages ("Peak freshness", "Degassing", "Past peak"), plus an optional gentle "past peak" nudge in the recipe form. Phase 1 is **pure derivation** — a shared, unit-tested utility and UI components, zero schema or API changes. An optional phase 2 (roast date on the `beans` table + email nudge) is sketched but explicitly out of scope.

## Motivation

Roast date is the single biggest quality variable users already record, but the app treats it as an inert timestamp. Coffee has a well-understood freshness arc (degassing → peak → decline), and espresso is more sensitive to it than immersion methods. Turning the existing timestamp into an at-a-glance status makes recipes more trustworthy ("this god-shot was pulled at day 12") and helps users brew their own beans at the right time — for free, since the data is already there.

## Current state (verified)

- **Roast date lives on recipe versions only.** `recipeVersions.roastDate` (`roast_date`, nullable `timestamp withTimezone`, `packages/db/src/schema.ts:175-238`), alongside `packageOpenDate`, `grindDate`, and `brewDate` (notNull, default now).
- **The `beans` table has no roast date.** Its columns (`packages/db/src/schema.ts:379-407`): `name`, `brand`, `vendorId`, `roaster`, `roastLevel` (varchar — the roast *darkness*, not a date), `processing`, `origin`, `userId`, timestamps. Any plan assuming `beans.roastDate` is wrong today.
- `recipeVersions.brewMethod` is a `brewMethodEnum` sourced from `BREW_METHOD_VALUES` (`packages/shared/src/constants/brew-methods.ts`, D07) — lets freshness windows vary by method (espresso vs. filter vs. cold brew).
- The recipe API already returns `roastDate` and `brewDate` on `currentVersion`; `BeanSection` (`apps/web/src/components/recipe/BeanSection.tsx`) receives `roastDate`, `packageOpenDate`, `grindDate`, `brewDate` props (see usage in `apps/web/src/pages/recipes/RecipeFocusModePage.tsx:134-145`).
- Shared utils live in `packages/shared/src/utils` (e.g. `escapeHtml`); shared constants in `packages/shared/src/constants` with the `*_VALUES` tuple convention.

## Proposed design (phase 1 — pure derivation)

### DB schema

**None.** Freshness is computed from `roastDate` relative to `brewDate` (for historical recipes: "how fresh was the coffee *when brewed*") or to now (for the nudge in the create/edit form).

### Shared constants — `packages/shared/src/constants/freshness.ts`

Follow the D07 pattern (rich objects + derived `_VALUES` tuple) so a future persisted enum (`pgEnum('freshness_status', [...FRESHNESS_STATUS_VALUES])`) and `z.enum(FRESHNESS_STATUS_VALUES)` share one source:

```ts
export const FRESHNESS_STATUSES = [
  { value: 'degassing', label: 'Degassing' },   // too fresh, still off-gassing CO2
  { value: 'peak', label: 'Peak freshness' },
  { value: 'good', label: 'Still good' },
  { value: 'past_peak', label: 'Past peak' },
  { value: 'stale', label: 'Stale' },
] as const;

export type FreshnessStatusValue = (typeof FRESHNESS_STATUSES)[number]['value'];
export const FRESHNESS_STATUS_VALUES = FRESHNESS_STATUSES.map((s) => s.value) as [
  FreshnessStatusValue, ...FreshnessStatusValue[],
];
```

### Shared util — `packages/shared/src/utils/freshness.ts`

```ts
import type { BrewMethodValue } from '../constants/brew-methods.ts';

interface FreshnessWindow {
  degassingUntilDays: number; // exclusive upper bound of 'degassing'
  peakUntilDays: number;
  goodUntilDays: number;
  pastPeakUntilDays: number;  // beyond ⇒ 'stale'
}

/** Espresso is most sensitive; immersion/cold brew most forgiving. */
const DEFAULT_WINDOW: FreshnessWindow = {
  degassingUntilDays: 4, peakUntilDays: 21, goodUntilDays: 35, pastPeakUntilDays: 60,
};
const METHOD_WINDOWS: Partial<Record<BrewMethodValue, FreshnessWindow>> = {
  espresso_machine: { degassingUntilDays: 7, peakUntilDays: 21, goodUntilDays: 30, pastPeakUntilDays: 45 },
  cold_brew: { degassingUntilDays: 2, peakUntilDays: 30, goodUntilDays: 45, pastPeakUntilDays: 75 },
  // others fall through to DEFAULT_WINDOW
};

export interface FreshnessResult {
  status: FreshnessStatusValue;
  daysSinceRoast: number;
}

export function computeFreshness(
  roastDate: Date | string,
  referenceDate: Date | string, // brewDate on recipe views; `new Date()` in forms
  brewMethod?: BrewMethodValue,
): FreshnessResult | null; // null when roast date is in the future of the reference
```

Pure function, no I/O, fully unit-testable in the shared package; the API can reuse it later (phase 2) without duplication.

### API endpoints

**None.** `roastDate`, `brewDate`, and `brewMethod` are already in recipe payloads; the client derives status locally. This avoids schema/API churn and keeps historical correctness (freshness *at brew time*) trivially right.

### Frontend

- New `apps/web/src/components/recipe/FreshnessBadge.tsx`:
  - Props: `roastDate`, `referenceDate`, `brewMethod`; calls `computeFreshness` from `@brewform/shared/utils`; renders nothing when `roastDate` is null or result is null.
  - Colour-codes by status using existing CSS variables (`--accent-primary` for peak, `--text-tertiary` for stale, etc.) and shows `daysSinceRoast` in a tooltip/`aria-label` ("Roasted 12 days before brewing").
- Placement:
  - `BeanSection` (recipe detail + focus mode) next to the roast-date row — both pages already pass the needed props (`RecipeFocusModePage.tsx:134-145`).
  - Recipe cards on lists **only if** `roastDate` is already present in the list payload — no payload widening for this feature.
- "Past peak" nudge: in the recipe create/edit form, when the entered `roastDate` computes (against today) to `past_peak`/`stale`, show a dismissible inline hint under the field — informational, never blocking submission. Reuses `computeFreshness` with `referenceDate = new Date()`.
- No new data fetching, so no loader changes; pages keep their current loader/`useLoaderData` or `api`-client flows.

## Phase 2 (optional, explicitly out of scope for this PRD)

- Add nullable `roastDate` to the `beans` table so a bean in the user's library carries its own freshness independent of recipes; migration via `make db-generate`.
- Opt-in "your bean is approaching past peak" email through `utils/notify` + a `Deno.cron` entry (pattern: `apps/api/src/utils/jobs/cron.ts`), gated by a new `userPreferences` flag — coordinate with F29's preference-group UI.
- If freshness is ever persisted/filterable server-side, the enum comes from `FRESHNESS_STATUS_VALUES` (already single-sourced above).

## i18n & logging

- Keys `recipe.freshness.degassing|peak|good|pastPeak|stale`, `recipe.freshness.daysSinceRoast` (with count interpolation as used elsewhere), and `recipeForm.freshnessNudge` in `packages/shared/src/i18n/en.json` and `tr.json`.
- Web: no dedicated logger needed — the badge is pure render; the form nudge logs nothing (D26 applies to modules with behaviour, not presentational derivation).

## Test plan

- `packages/shared/src/utils/freshness.test.ts` (`@std/testing/bdd` + `@std/expect`):
  - Boundary days for each status per window (day 0, 4, 21, 35, 60 ± 1) for default, espresso, cold-brew windows.
  - Unknown/undefined brew method falls back to `DEFAULT_WINDOW`.
  - Future roast date (roast after reference) → `null`; string and `Date` inputs equivalent; timezone-safe day math (UTC-based, whole-day floor).
- `apps/web/src/components/recipe/FreshnessBadge.test.tsx`: renders nothing without roastDate; correct label + `aria-label` per status; uses brewDate (not now) as reference.
- Recipe form test: nudge appears for a 90-day-old roast date, absent for a 10-day-old one, and does not block submit.

## Acceptance criteria

- [ ] Freshness derived from `recipeVersions.roastDate` vs. `brewDate` — no schema or API changes in phase 1
- [ ] Method-aware windows (espresso stricter, cold brew looser), single-sourced constants per D07
- [ ] Badge shown in BeanSection on recipe detail and focus mode when roast date present
- [ ] Non-blocking "past peak" nudge in the recipe form
- [ ] Shared util is pure and covered at status boundaries
- [ ] en + tr i18n keys present
- [ ] `make check && make lint && make test` pass

## Effort

**S** (1–2 days): one util + constants file, one component, form hint, tests.

## Priority

**Medium-high** — smallest effort-to-delight ratio in this batch; safe to ship first.

## Dependencies

- `recipeVersions.roastDate` / `brewDate` / `brewMethod` (verified in `packages/db/src/schema.ts`)
- `BeanSection` and recipe payloads already carrying these fields
- D07 constants convention; none on F27–F29/F31
