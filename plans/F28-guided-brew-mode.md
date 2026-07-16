# F28 — Guided Brew Mode

> **Validation status (2026-07-13): ✅ Valid**
>
> - All 11 brew methods confirmed in `BREW_METHODS` / `BREW_METHOD_VALUES` (`packages/shared/src/constants/brew-methods.ts:1-89`) — the exhaustive `Record<BrewMethodValue, …>` template is well-founded. `recipeVersions` supplies every field a session needs (`schema.ts:176-239`, cited 175-238).
> - `RecipeFocusModePage` confirmed: `recipeApi.get(slug)` in `useEffect`, renders StatCards/BeanSection/BrewTimeline/EquipmentSection/TastingNotesSection from `recipe.currentVersion` (`RecipeFocusModePage.tsx:42,131-194`). `GET /recipes/:slugOrId` returns `currentVersion` (`recipe/index.ts:326,340`). F02 remains an integration point only.
> - Correction: the focus route is now at `router.tsx:161` (`{ path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> }`), not :104 (drifted after F01/collections). Add the `recipes/:slug/brew` loader route beside it. Loader pattern is used widely (homeLoader/detailLoader/etc.); the `HomePage.tsx:18` line may have drifted but the pattern holds.

## Summary

An interactive, step-by-step brew session view at `/recipes/:slug/brew`: per-brew-method step templates hydrated with the recipe version's actual numbers (dose, temperature, pre-infusion, extraction time), live countdown timers, screen wake-lock, and a completion summary. Builds on the existing distraction-free `RecipeFocusModePage` and the `BrewTimeline` visualisation. Defines — but does not depend on — a completion hook for the future brew journal (F02).

## Motivation

FEATURE_SUGGESTIONS §1.6 (guided brews) is the natural next step after focus mode: focus mode shows the recipe *at a glance*; guided mode walks you through it *in real time* with your hands wet and your phone propped against the kettle. All required data (timings, dose, temperature) is already captured on every recipe version — no new data entry is needed.

## Current state (verified)

- `RecipeFocusModePage` (`apps/web/src/pages/recipes/RecipeFocusModePage.tsx`) renders `StatCards`, `BeanSection`, `BrewTimeline`, `EquipmentSection`, `TastingNotesSection` from `recipe.currentVersion`. It fetches with `recipeApi.get(slug)` in `useEffect` (no loader). Route: `recipes/:slug/focus` (`apps/web/src/router.tsx:161`).
- `BrewTimeline` (`apps/web/src/components/recipe/BrewTimeline.tsx`) takes `extractionTimeSeconds`, `preInfusionTimeSeconds`, `flowRate` and renders a static SVG pre-infusion/extraction curve.
- `recipeVersions` (`packages/db/src/schema.ts:175-238`) provides everything a session needs: `brewMethod` (`brewMethodEnum`), `groundWeightGrams`, `extractionTimeSeconds`, `preInfusionTimeSeconds`, `temperatureCelsius`, `extractionVolumeMl`, `brewRatio`, `grindSize`, `preparationNotes` (notNull).
- Brew methods are single-sourced: `BREW_METHODS` / `BREW_METHOD_VALUES` in `packages/shared/src/constants/brew-methods.ts` (11 methods, each with `equipmentTypes`), per D07.
- `GET /api/v1/recipes/:slugOrId` (`apps/api/src/modules/recipe/index.ts:301`) already returns the full recipe with `currentVersion` — no new API surface required for phase 1.
- F02 (brew journal) is a separate plan with no implementation yet.

## Proposed design

### DB schema

**None in phase 1.** Guided brew is a pure client-side experience over existing recipe data. The completion payload is defined now (shared schema) so F02 can persist it later without reshaping.

### Step templates (shared, single-sourced)

New `packages/shared/src/constants/brew-steps.ts`, keyed by `BrewMethodValue` so templates can never drift from `BREW_METHOD_VALUES` (D07):

```ts
import type { BrewMethodValue } from './brew-methods.ts';

export type BrewStepKind = 'prepare' | 'timed' | 'action' | 'finish';

export interface BrewStepTemplate {
  key: string;                    // i18n suffix: recipe.guidedBrew.steps.<method>.<key>
  kind: BrewStepKind;
  /** Resolve duration (seconds) from the recipe version; null = untimed step. */
  duration: (v: BrewVersionParams) => number | null;
}

export interface BrewVersionParams {
  preInfusionTimeSeconds: number | null;
  extractionTimeSeconds: number | null;
  groundWeightGrams: number | null;
  temperatureCelsius: number | null;
  extractionVolumeMl: number | null;
}

export const BREW_STEP_TEMPLATES: Record<BrewMethodValue, BrewStepTemplate[]> = {
  v60: [
    { key: 'rinseFilter', kind: 'prepare', duration: () => null },
    { key: 'addCoffee', kind: 'prepare', duration: () => null },
    { key: 'bloom', kind: 'timed', duration: (v) => v.preInfusionTimeSeconds ?? 30 },
    { key: 'pour', kind: 'timed', duration: (v) =>
        v.extractionTimeSeconds != null
          ? v.extractionTimeSeconds - (v.preInfusionTimeSeconds ?? 0)
          : null },
    { key: 'drawdown', kind: 'finish', duration: () => null },
  ],
  espresso_machine: [ /* prepare portafilter, tamp, pre-infusion, extraction, finish */ ],
  // ... one entry per BREW_METHOD_VALUES member; exhaustiveness enforced by Record type
};
```

A small resolver `buildBrewSession(brewMethod, version)` (colocated, pure, unit-tested) maps templates → concrete steps with resolved durations, skipping timed steps whose duration resolves to `null`/`<= 0`.

### Completion hook (F02 integration point — designed, not depended on)

New `packages/shared/src/schemas/brew-session.ts`:

```ts
export const BrewSessionResultSchema = z.object({
  recipeId: z.string(),
  recipeVersionId: z.string(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  stepsCompleted: z.number().int().min(0),
  stepsTotal: z.number().int().min(1),
  actualExtractionSeconds: z.number().int().min(0).nullable(),
  abandoned: z.boolean(),
});
export type BrewSessionResult = z.infer<typeof BrewSessionResultSchema>;
```

The page calls an injected `onSessionComplete(result: BrewSessionResult)` prop/callback. Phase 1 implementation: log via web logger and offer "Rate this brew" linking to the existing recipe rating flow. When F02 lands, the same callback POSTs to the journal endpoint — no UI rework.

### API endpoints

None. The existing `GET /api/v1/recipes/:slugOrId` supplies all data. (If F02 later adds `POST /api/v1/journal`, it plugs into the completion hook above.)

### Frontend (loader-based)

- New route in `apps/web/src/router.tsx`, beside the focus route:

```tsx
{ path: 'recipes/:slug/brew', element: <GuidedBrewPage />, loader: guidedBrewLoader },
```

- `apps/web/src/pages/recipes/GuidedBrewPage.tsx`:

```ts
import { useLoaderData } from 'react-router'; // never react-router-dom

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const recipe = await recipeApi.get(params.slug!); // api client, apps/web/src/api
  return { recipe };
};
```

  (Unlike `RecipeFocusModePage`'s `useEffect` fetch, this page uses the loader pattern from day one, matching `HomePage.tsx:18`.)
- New components in `apps/web/src/components/brew/`:
  - `BrewStepper.tsx` — current step card, big countdown, next/previous, progress dots.
  - `BrewCountdown.tsx` — `requestAnimationFrame`-driven timer computing remaining time from a start timestamp (robust to background-tab throttling); optional vibration/`AudioContext` beep on step end.
  - `BrewSessionSummary.tsx` — steps done, actual vs. target time (reusing `BrewTimeline` with the recorded actual extraction overlaid), completion hook trigger.
- Wake lock: `useWakeLock()` hook in `apps/web/src/hooks/` — `navigator.wakeLock?.request('screen')` on session start, re-acquire on `visibilitychange`, release on unmount; feature-detect and degrade silently (Safari < 16.4).
- Entry points: "Start guided brew" button on `RecipeDetailPage` and `RecipeFocusModePage` (shown only when `currentVersion.extractionTimeSeconds != null` or the method template has untimed steps).

### i18n & logging

- Keys `recipe.guidedBrew.*` (`start`, `next`, `previous`, `pause`, `resume`, `finish`, `stepXofY`, `summary.*`) plus per-method step names `recipe.guidedBrew.steps.<method>.<key>` in `packages/shared/src/i18n/en.json` and `tr.json`. Step templates carry only i18n key suffixes — no hardcoded English strings.
- Web: `createLogger('GuidedBrewPage')` (pattern from `RecipeFocusModePage.tsx:13`) — session start, step transitions (debug), completion/abandon (info), wake-lock failures (warn).

## Test plan

- `packages/shared/src/constants/brew-steps.test.ts`: every `BREW_METHOD_VALUES` member has a template; `buildBrewSession` resolves durations correctly (pre-infusion subtracted from pour; null extraction ⇒ timed steps skipped); no negative durations.
- `packages/shared/src/schemas/brew-session.test.ts`: `BrewSessionResultSchema` accepts/rejects fixtures.
- Web: `BrewStepper.test.tsx` (step navigation, a11y roles), `BrewCountdown.test.tsx` (fake timers: completion fires once), `GuidedBrewPage.test.tsx` (loader data render, completion hook invoked with valid payload), `useWakeLock.test.ts` (feature-detection fallback).

## Acceptance criteria

- [ ] `/recipes/:slug/brew` walks through method-specific steps with recipe-derived timings
- [ ] All 11 brew methods have step templates (type-enforced exhaustive `Record`)
- [ ] Countdown survives tab-throttling (timestamp-based) and signals step end
- [ ] Screen stays awake during a session on supporting browsers; graceful no-op otherwise
- [ ] Completion produces a `BrewSessionResult` validated by the shared schema (F02-ready)
- [ ] Page fetches via loader + `useLoaderData` from `'react-router'`
- [ ] Works for recipes missing optional timings (untimed steps still guided)
- [ ] en + tr i18n keys present; `make check && make lint && make test` pass

## Effort

**M–L** (4–5 days): 11 step templates with review, 3 components + hook + page, timer edge cases, tests. No backend/migration work.

## Priority

**Medium** — differentiating UX feature; ship after F27 since it is frontend-heavy and independent.

## Dependencies

- Existing recipe GET endpoint and `recipeVersions` fields (verified above)
- `BREW_METHODS` constants (D07 single source)
- `BrewTimeline`, `RecipeFocusModePage` as design substrate
- F02 (brew journal): **integration point only** — this plan must land and function without it
