# F07 — Batch / Scale Recipe Calculator

> **Validation status (2026-07-13): ⚠️ Outdated — minor corrections below (design valid)**
>
> - Core still valid: pure client-side. `useUnitSystem` (hooks/useUnitSystem.ts:20), `formatWeight`/`formatVolume`/`formatTemperature` (conversion.ts:34/42/50), `computeBrewRatio` (metrics.ts:2), `convertGramsToOunces`/`convertMlToFlOz` all exist. `scaleRecipe`/`suggestGrindAdjustment`/`scaleExtractionTime` are net-new as intended.
> - Correction: the new functions must ALSO be added to the utils barrel `packages/shared/src/utils/index.ts` (the metrics export block), not just metrics.ts — `@brewform/shared/utils` resolves through the barrel.
> - Correction (the test snippet is broken): the plan imports `assertEquals, assertStrictEquals` from `jsr:@std/testing/bdd` and uses `Deno.test(...)`. Repo convention (metrics.test.ts) is `import { describe, it } from 'jsr:@std/testing/bdd'` + `import { expect } from 'jsr:@std/expect'` with `describe/it/expect`; `assertEquals` isn't exported by bdd. Rewrite tests in the expect style.
> - NEW — D40 i18n: `BatchCalculator` hardcodes English ("Batch Calculator", "Target Yield", "Scaled Dose", …) — route through `t()` and add keys to both en.json + tr.json (strict parity test). `suggestGrindAdjustment` returns English sentences from a shared util — return a key/enum and translate client-side instead.

## Overview

A recipe scaling calculator that lives on the RecipeDetailPage and RecipeCreatePage. Users input a desired yield, and the calculator auto-scales dose, water volume, and brew ratio. No new database tables — this is a pure UI + utility feature extending existing shared utilities.

## Goals

- Let users quickly scale a recipe to a different output volume/weight
- Support metric/imperial toggle via the existing `useUnitSystem` hook
- Keep the calculator lightweight: no new tables, no new API endpoints
- Extend `packages/shared/src/utils/metrics.ts` with reusable scaling functions

## User Stories

1. **As a user**, I want to enter a target yield on a recipe and see the scaled dose, water, and brew ratio so I can brew a different amount without mental math.
2. **As a user**, I want the calculator to respect my metric/imperial preference.
3. **As a user**, I want to use the calculator on both existing recipes and while creating new ones.
4. **As a user**, I want to see grind time adjustments (qualitative suggestions) based on dose changes.

## Technical Design

### Utility Functions

Extend `packages/shared/src/utils/metrics.ts`:

```ts
/**
 * Scale a recipe's parameters to a target yield.
 *
 * Maintains the original brew ratio. Returns computed values
 * for dose, water volume, and the new brew ratio (which is identical
 * to the original unless rounding differs).
 *
 * @param currentDose - Current dose in grams
 * @param currentYield - Current yield in ml/g
 * @param targetYield - Desired yield in ml/g
 * @returns Scaled parameters
 */
export function scaleRecipe(
  currentDose: number,
  currentYield: number,
  targetYield: number,
): {
  dose: number;
  water: number;
  brewRatio: number;
  extractionTimeSeconds: number | null;
} | null {
  if (!currentDose || !currentYield || !targetYield || currentDose <= 0 || currentYield <= 0 || targetYield <= 0) {
    return null;
  }

  const scaleFactor = targetYield / currentYield;
  const dose = currentDose * scaleFactor;
  const water = targetYield;
  const brewRatio = water / dose;

  return {
    dose: Math.round(dose * 10) / 10,
    water: Math.round(water * 10) / 10,
    brewRatio: Math.round(brewRatio * 100) / 100,
    extractionTimeSeconds: null, // Caller can adjust if needed
  };
}

/**
 * Get qualitative grind adjustment suggestion based on dose change direction.
 *
 * This is advisory only — actual grind changes depend on many factors.
 *
 * @param originalDose - Original dose in grams
 * @param scaledDose - Scaled dose in grams
 * @returns Adjustment suggestion string
 */
export function suggestGrindAdjustment(
  originalDose: number,
  scaledDose: number,
): string {
  if (scaledDose > originalDose * 1.1) {
    return 'Consider slightly coarser grind for larger dose';
  }
  if (scaledDose < originalDose * 0.9) {
    return 'Consider slightly finer grind for smaller dose';
  }
  return 'Grind size likely unchanged';
}

/**
 * Scale extraction time proportionally to dose change.
 * Larger doses typically need slightly longer extraction.
 */
export function scaleExtractionTime(
  currentTimeSeconds: number | null,
  scaleFactor: number,
): number | null {
  if (!currentTimeSeconds || currentTimeSeconds <= 0) return null;
  // Time scales sub-linearly (square root relationship)
  const adjusted = currentTimeSeconds * Math.sqrt(scaleFactor);
  return Math.round(adjusted);
}
```

Add tests to `packages/shared/src/utils/metrics.test.ts`:

```ts
import { assertEquals, assertStrictEquals } from 'jsr:@std/testing/bdd';
import { scaleRecipe, suggestGrindAdjustment, scaleExtractionTime } from './metrics.ts';

Deno.test('scaleRecipe', () => {
  // Double the yield → double the dose
  const result = scaleRecipe(18, 36, 72);
  assertEquals(result?.dose, 36);
  assertEquals(result?.water, 72);
  assertEquals(result?.brewRatio, 2.0);
});

Deno.test('scaleRecipe returns null for invalid inputs', () => {
  assertEquals(scaleRecipe(0, 36, 72), null);
  assertEquals(scaleRecipe(18, 0, 72), null);
  assertEquals(scaleRecipe(18, 36, 0), null);
});

Deno.test('suggestGrindAdjustment', () => {
  assertEquals(suggestGrindAdjustment(18, 36).toLowerCase().includes('coarser'), true);
  assertEquals(suggestGrindAdjustment(18, 10).toLowerCase().includes('finer'), true);
  assertEquals(suggestGrindAdjustment(18, 18), 'Grind size likely unchanged');
});

Deno.test('scaleExtractionTime', () => {
  assertEquals(scaleExtractionTime(25, 2), 35); // sqrt(2) * 25 ≈ 35
  assertEquals(scaleExtractionTime(null, 2), null);
});
```

### Unit Conversion Integration

Use existing functions from `packages/shared/src/utils/conversion.ts`:

- `formatWeight(grams, system)` — for dose display
- `formatVolume(ml, system)` — for yield display
- `convertGramsToOunces` / `convertOuncesToGrams` — for imperial input
- `convertMlToFlOz` / `convertFlOzToMl` — for imperial input

### Frontend Component

#### `BatchCalculator` component

```tsx
// apps/web/src/components/recipe/BatchCalculator.tsx
import { useState, useMemo } from 'react';
import { useUnitSystem } from '../../hooks/useUnitSystem.ts';
import { scaleRecipe, suggestGrindAdjustment, scaleExtractionTime } from '@brewform/shared/utils';
import { formatWeight, formatVolume } from '@brewform/shared/utils';

interface BatchCalculatorProps {
  currentDose: number | null;
  currentYield: number | null;
  currentTime: number | null;
  onScale?: (scaled: {
    dose: number;
    water: number;
    brewRatio: number;
    extractionTimeSeconds: number | null;
  }) => void;
}

export function BatchCalculator({
  currentDose,
  currentYield,
  currentTime,
  onScale,
}: BatchCalculatorProps) {
  const unitSystem = useUnitSystem();
  const [targetYield, setTargetYield] = useState('');

  const targetYieldNum = parseFloat(targetYield);

  const scaled = useMemo(() => {
    if (!currentDose || !currentYield || !targetYieldNum) return null;
    return scaleRecipe(currentDose, currentYield, targetYieldNum);
  }, [currentDose, currentYield, targetYieldNum]);

  const grindSuggestion = useMemo(() => {
    if (!scaled || !currentDose) return null;
    return suggestGrindAdjustment(currentDose, scaled.dose);
  }, [scaled, currentDose]);

  const scaledTime = useMemo(() => {
    if (!scaled || !currentTime || !currentYield) return null;
    const scaleFactor = targetYieldNum / currentYield;
    return scaleExtractionTime(currentTime, scaleFactor);
  }, [scaled, currentTime, currentYield, targetYieldNum]);

  function handleApply() {
    if (scaled && onScale) {
      onScale({
        ...scaled,
        extractionTimeSeconds: scaledTime,
      });
    }
  }

  if (!currentDose || !currentYield) {
    return null;
  }

  return (
    <div className="card">
      <h3 className="text-sm font-semibold uppercase tracking-widest mb-3"
          style={{ color: 'var(--text-tertiary)' }}>
        Batch Calculator
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1"
                 style={{ color: 'var(--text-secondary)' }}>
            Target Yield ({unitSystem === 'imperial' ? 'fl oz' : 'ml'})
          </label>
          <input
            type="number"
            value={targetYield}
            onChange={(e) => setTargetYield(e.target.value)}
            className="input-field"
            placeholder={unitSystem === 'imperial'
              ? `${(currentYield * 0.0338).toFixed(1)}`
              : `${currentYield}`}
            min="0"
            step="0.1"
          />
        </div>

        {scaled && (
          <div className="rounded-lg p-3 space-y-2"
               style={{ backgroundColor: 'var(--bg-secondary)' }}>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Scaled Dose</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {formatWeight(scaled.dose, unitSystem)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Water Volume</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {formatVolume(scaled.water, unitSystem)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Brew Ratio</span>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                1:{scaled.brewRatio}
              </span>
            </div>
            {scaledTime && (
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Est. Time</span>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {Math.floor(scaledTime / 60)}:{(scaledTime % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
            {grindSuggestion && (
              <p className="text-xs pt-2 border-t"
                 style={{ borderColor: 'var(--border-primary)', color: 'var(--text-tertiary)' }}>
                {grindSuggestion}
              </p>
            )}
          </div>
        )}

        {scaled && onScale && (
          <button
            type="button"
            onClick={handleApply}
            className="btn-primary w-full text-sm"
          >
            Apply Scaled Values
          </button>
        )}
      </div>
    </div>
  );
}
```

### Integration Points

#### On `RecipeDetailPage`

Add `BatchCalculator` to the sidebar, below the rating card:

```tsx
// In RecipeDetailPage.tsx sidebar section:
<BatchCalculator
  currentDose={v.groundWeightGrams}
  currentYield={v.extractionVolumeMl}
  currentTime={v.extractionTimeSeconds}
/>
```

#### On `RecipeCreatePage`

Add `BatchCalculator` below the brew parameters section, only shown when dose + yield are filled:

```tsx
// In RecipeCreatePage.tsx:
{groundWeightGrams && extractionVolumeMl && (
  <BatchCalculator
    currentDose={Number(groundWeightGrams)}
    currentYield={Number(extractionVolumeMl)}
    currentTime={extractionTimeSeconds ? Number(extractionTimeSeconds) : null}
    onScale={(scaled) => {
      setGroundWeightGrams(String(scaled.dose));
      setExtractionVolumeMl(String(scaled.water));
      if (scaled.extractionTimeSeconds) {
        setExtractionTimeSeconds(String(scaled.extractionTimeSeconds));
      }
    }}
  />
)}
```

## API Endpoints

None — this is a pure client-side feature.

## Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| `BatchCalculator` | `apps/web/src/components/recipe/BatchCalculator.tsx` | Standalone calculator card |

## Modifications to Existing Files

| File | Change |
|------|--------|
| `packages/shared/src/utils/metrics.ts` | Add `scaleRecipe`, `suggestGrindAdjustment`, `scaleExtractionTime` |
| `packages/shared/src/utils/metrics.test.ts` | Add tests for new functions |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | Add `BatchCalculator` to sidebar |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | Add `BatchCalculator` below brew params |

## Acceptance Criteria

- [ ] `scaleRecipe` function correctly scales dose and water proportionally
- [ ] `suggestGrindAdjustment` provides meaningful guidance
- [ ] `scaleExtractionTime` uses square-root scaling
- [ ] Calculator handles both metric and imperial units
- [ ] Calculator displays correctly when current dose/yield are null (hidden)
- [ ] "Apply Scaled Values" button updates form state on RecipeCreatePage
- [ ] Calculator appears in sidebar on RecipeDetailPage
- [ ] Unit tests pass for all new utility functions
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)

## Implementation Steps

1. Add `scaleRecipe`, `suggestGrindAdjustment`, `scaleExtractionTime` to `packages/shared/src/utils/metrics.ts`
2. Add unit tests to `packages/shared/src/utils/metrics.test.ts`
3. Create `apps/web/src/components/recipe/BatchCalculator.tsx`
4. Integrate `BatchCalculator` into `RecipeDetailPage` sidebar
5. Integrate `BatchCalculator` into `RecipeCreatePage` brew parameters section
6. Run `make check && make lint && make test`

## Dependencies

- Existing: `useUnitSystem` hook from `apps/web/src/hooks/useUnitSystem.ts`
- Existing: `formatWeight`, `formatVolume` from `@brewform/shared/utils`
- Existing: `computeBrewRatio` from `@brewform/shared/utils`
- Existing: `input-field`, `btn-primary`, `card` CSS classes
