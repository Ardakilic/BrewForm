### Charts: shared primitives (apps/web/src/utils/chart)

- [ ] Write failing tests `apps/web/src/utils/chart/scale.test.ts` for `sanitizeNumber`, `clamp`, `clampPct` and `safeRatio`. Cover `NaN`, `±Infinity`, `null`, `undefined`, strings, reversed `min`/`max`, and denominators of 0 or `NaN`. Add a fast-check property asserting that `clamp` output always lies in `[min, max]`.
- [ ] Implement `apps/web/src/utils/chart/scale.ts` (pure, explicit `.ts` imports, JSDoc on every export) until the tests pass.
- [ ] Add `apps/web/src/utils/chart/measured-widths.fixture.ts` with the SF Pro measurements from `audit/t6-charts.md` §8 (string, font px, weight, letter-spacing, measured px).
- [ ] Write failing tests `apps/web/src/utils/chart/text.test.ts`: `estimateTextWidth` ≥ measured for every fixture row; `wrapLabel` splits after `/` (keeping the slash on the first line) and at whitespace; an unbreakable label returns a single line.
- [ ] Implement `apps/web/src/utils/chart/text.ts` (narrow 0.34em / wide and uppercase 0.80em / digits 0.62em / other 0.60em, plus letter-spacing; ×1.1 safety; ×1.06 bold).
- [ ] Write failing tests `apps/web/src/utils/chart/layout.test.ts` for `labelBox` (start/middle/end × top/middle/bottom, multi-line), `unionBox`, `isInside`, `overlaps` and `fitViewBox` (margin, symmetric-x option).
- [ ] Implement `apps/web/src/utils/chart/layout.ts`.
- [ ] Write failing tests `apps/web/src/utils/chart/ticks.test.ts`:
  - `niceTicks(min, max, maxCount)`: steps of 10^k×{1,2,5}, ≤ maxCount, inside bounds.
  - `durationTicks` examples: 27s, 59s, 290s, 1800s, 43200s → `0 2h 4h 6h 8h 12h` (en) / `… 12 sa` (tr), and 86400s.
  - `durationTicks` property: totals 1–86,400 plus 172,800, 10^6 and 2,147,483,647, for en/tr at 200/222/277/507/670px. Assert 2–8 ascending ticks, 0 and the total included, no box overlap (6px gap), no box outside `[0, width]`, and each call under 5 ms.
- [ ] Implement `apps/web/src/utils/chart/ticks.ts`: time ladder `1,2,5,10,15,30s / 1,2,5,10,15,30min / 1,2,3,6,12h / 1d`, then closed-form `86400×{2,5,10}·10^k`; unit-consistent labels via an injected formatter; the end label is the compact total; the last nice tick is dropped on collision with the end label.
- [ ] Add `apps/web/src/utils/chart/index.ts` barrel with a module JSDoc stating the chart rules: in-bounds, no `<text>` in stretched SVGs, sanitize via `clamp`, tokens only, geometry tests required, reuse by F17/F03.

### Charts: formatters, locale and i18n

- [ ] Extend `apps/web/src/utils/format.test.ts` with failing cases:
  - `formatDecimal(2.2222223, 'en', 1)` → `2.2` and `'tr'` → `2,2`.
  - `formatDuration`: 45 → `45s` / `45 sn`; 270 → `4m 30s` / `4 dk 30 sn`; 43200 → `12h` / `12 sa`; 5400 → `1h 30m`; at most two units; rounds to whole seconds.
  - `formatDurationTick(7200, 7200, 'en')` → `2h`.
  - `formatNumber(12345, 'tr')` → `12.345`.
- [ ] Implement `formatDecimal`, `formatDuration` and `formatDurationTick` in `apps/web/src/utils/format.ts`, taking unit strings from `chart.duration.*` via the shared `t` (append only; do not change `formatDate`/`formatNumber`).
- [ ] Add `useSafeLocale()` to `apps/web/src/utils/safe-translation.ts` (returns the context locale or `'en'` outside a provider), with a unit test.
- [ ] Add i18n keys to **both** `packages/shared/src/i18n/en.json` and `tr.json`:
  - `taste.category.{floral,fruity,sweet,nuttyCocoa,spices,roasted,greenVegetative,sourFermented,other}`; tr: Çiçeksi, Meyvemsi, Tatlı, Fındıksı/Kakao, Baharatlı, Kavrulmuş, Yeşil/Bitkisel, Ekşi/Fermente, Diğer; native-speaker review is pending.
  - `chart.duration.{seconds,minutes,hours}` (en `{n}s`/`{n}m`/`{n}h`; tr `{n} sn`/`{n} dk`/`{n} sa`).
  - `a11y.rating.{value,notRated,slider,keyboardHint}`.
  - `a11y.scaaRadarChartValues`, `a11y.scaaRadarChartEmpty`, `recipe.brewTimeline.flowRate`.
  - Change `a11y.brewTimeline` and `a11y.brewTimelineNoPreInfusion` to take formatted durations, with no `s`/`sn` suffix.
- [ ] Run `packages/shared/src/i18n/i18n.test.ts` (key parity) via `make test-shared`.

### Charts: SCAA radar

- [ ] Add `SCAA_CATEGORY_SLUGS` and `scaaCategoryLabelKey(category)` to `apps/web/src/utils/radar-chart-data.ts`, with tests in `radar-chart-data.test.ts` (the 9 slugs map 1:1; unknown names → `null`).
- [ ] Write failing geometry tests `apps/web/src/utils/radar-layout.test.ts` for `computeRadarLayout({ labels, values, maxValue, fontSize: 18, maxWidthPx: 280 })`:
  - Label sets: en labels, tr labels, and a synthetic set of 24-character single words.
  - Every label line box is inside the viewBox, with no label-label overlap.
  - `fontSize×222/viewBox.width ≥ 10` and `fontSize×280/viewBox.width ≤ 14`.
  - Value clamping: `NaN`, negative, `Infinity`, `maxValue` < data.
  - Empty profile → no polygon; 1 or 2 non-zero → vertex markers; all vertices inside the outer guide.
  - On failure, the assertion message names the label and the overflow in px.
- [ ] Implement `apps/web/src/utils/radar-layout.ts` (pure; uses `utils/chart`).
- [ ] Write failing component tests in `apps/web/src/components/recipe/ScaaRadarChart.test.tsx`:
  - The root `<svg>` has `width="100%"` and an inline `max-width`, and no `overflow` style.
  - One `role="img"` whose name lists the non-zero translated categories and values (en/tr); the empty-profile name.
  - Label `<tspan>` splitting.
  - Remove the old `width/height = size` and `viewBox = 0 0 size size` assertions.
- [ ] Rewrite `apps/web/src/components/recipe/ScaaRadarChart.tsx` on `computeRadarLayout`: translated labels via `useSafeT`, `aria-hidden` internals, tokens only, `size` prop replaced by `maxWidthPx` (default 280).
- [ ] Update `apps/web/src/components/recipe/TastingNotesSection.tsx`: render a single chart instance; make the card a `@container` with `flex-col @min-[520px]:flex-row`; translate chip-group headings that map to an SCAA category. Update `TastingNotesSection.test.tsx`.

### Charts: brew timeline

- [ ] Write failing tests `apps/web/src/utils/brew-timeline.test.ts`:
  - `computeTimelineModel`: normal 5/28 → 17.857/82.143%; `pre ≥ total` → single phase plus an `inconsistent` flag; total 0, −5 or `NaN` → `null`; negative or `NaN` pre → no split; property: widths in `[0,100]` and summing to 100.
  - `layoutPhaseLabels` at 200/222/277/507/670px, en/tr: the 3/28 case → pre value goes to the caption; every visible label box sits inside its phase.
- [ ] Implement `apps/web/src/utils/brew-timeline.ts` (pure; uses `utils/chart` and the format helpers).
- [ ] Add `apps/web/src/utils/useElementWidth.ts` (`ResizeObserver` measured in `useLayoutEffect`, feature-detected, fallback width argument) with `useElementWidth.test.ts` covering the jsdom fallback and a stubbed observer.
- [ ] Rewrite `apps/web/src/components/recipe/BrewTimeline.tsx`:
  - The SVG holds shapes only (`preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"` on the stroke and the divider).
  - Phase labels are HTML boxes (`width: clampPct(pct)%`), with a caption row for hidden durations.
  - The axis comes from `durationTicks` at 200px, with `--text-secondary` ticks.
  - One `role="img"` wrapper with a formatted-duration `aria-label`; the invisible test-only flex div is removed.
  - Header uses `flex flex-wrap gap-x-3`; flow rate via `formatDecimal(flowRate, 1)` and `recipe.brewTimeline.flowRate`.
  - Returns `null` for an invalid total.
  - `createLogger('BrewTimeline')` emits `log.warn({ extractionTimeSeconds, preInfusionTimeSeconds }, 'inconsistent pre-infusion ignored')` once per mount from `useEffect`.
- [ ] Rewrite `apps/web/src/components/recipe/BrewTimeline.test.tsx`:
  - Keep the segment-width property (now on the phase boxes).
  - Replace the Property 5 step-formula tests with the new invariants (≤ 8 ticks, includes 0 and total, ascending).
  - Add cases for 43200s (`0 … 12h`), 2,147,483,647 (renders ≤ 8 ticks quickly), and `pre ≥ total` (no minus sign, one warn log via the `vi.hoisted` logger mock).
  - Assert there is no `<text>` inside the stretched SVG.
  - Add a property that every inline `width`/`left` percentage is finite and in `[0,100]`, for fast-check inputs in `[-10, 100000]` plus `NaN`.
- [ ] Verify `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` and `RecipeDetailPage.tsx` need no prop changes, and that `RecipeFocusModePage.test.tsx` and `RecipeDetailPage.test.tsx` still pass.

### Charts: ratings and meters

- [ ] Add `--rating-star` to `:root`, `.dark` and `.coffee` in `apps/web/src/styles/globals.css` (`#b45309` / `#f59e0b` / `#fbbf24`).
- [ ] Add a contrast test `apps/web/src/utils/chart/contrast.test.ts` that parses the three theme blocks in `globals.css` and asserts chart text pairs ≥ 4.5:1 (`--text-secondary` on `--bg-secondary`) and mark pairs ≥ 3:1 (`--accent-primary` and `--rating-star` on `--bg-secondary`).
- [ ] Write failing tests in `apps/web/src/components/recipe/StarRating.test.tsx`:
  - Read-only: a single `role="img"` named "Rated 3.5 out of 5 stars", no buttons, tr "3,5"; 7.9 → 4 stars and label 4; 11 → 5; −1 and `NaN` → "Not rated".
  - Interactive keys: ArrowRight×3 + Enter → `onRate(6)`; Shift+ArrowRight → odd values; digit keys 1–5; Home/End; Escape revert; blur commits once.
  - Pointer: the left half of star 3 → 5.
  - Busy state: `aria-disabled` and focus retained.
  - `aria-valuetext` and `aria-describedby` hint.
- [ ] Rewrite `apps/web/src/components/recipe/StarRating.tsx`:
  - Read-only branch is `role="img"`; interactive branch is `role="slider"` with keyboard and pointer handling.
  - New `busy` prop.
  - Fill uses `var(--rating-star)`; drop the `overflow-visible` class on the star SVG.
  - Numeric label via `formatDecimal`.
- [ ] Update the rating form in `apps/web/src/pages/recipes/RecipeDetailPage.tsx` to pass `busy={ratingFetcher.state !== 'idle'}` instead of toggling `interactive`; keep the hidden `rating` input and `requestSubmit` flow.
- [ ] Update `apps/web/src/components/recipe-list/RecipeCard.tsx` to show `★ {formatDecimal(rating / 2, locale, 1)}`. Update `RecipeCard.test.tsx:149` and `pages/coffee-varieties/__tests__/CoffeeVarietyDetailPage.test.tsx:311` (expect `★ 2` for rating 4) and add a 7 → `★ 3.5` case.
- [ ] Clamp and round `intensity` to `[0,3]` in `apps/web/src/components/recipe/IntensityDots.tsx`, for both the fill and the label. Add 5, `NaN` and 2.4 cases to `IntensityDots.test.tsx`.
- [ ] Format `avgBrewRating` with `formatDecimal(…, 1)` + `/10` in `apps/web/src/components/brew-log/RecipeBrewStats.tsx`, and update `RecipeBrewStats.test.tsx` (en `7.5/10`, tr `7,5/10`).

### Charts: derived metric displays

- [ ] Update `apps/web/src/utils/stat-cards.ts` (`buildStatCards(version, unitSystem, locale)`): time via `formatDuration`; ratio `1:` + `formatDecimal(ratio, 1)`; EY via `formatDecimal(ey, 1)`.
- [ ] Update `stat-cards.test.ts` and `StatCards.test.tsx`: 43200 → `12h`/`12 sa`; 2.2222223 → `1:2.2`/`1:2,2`. Add a geometry assertion that every formatted card value at 24px bold estimates ≤ 100px.
- [ ] Update `apps/web/src/pages/recipes/RecipeComparePage.tsx` (ratio and duration formatters), `VersionDiffPage.tsx` (duration, ratio and flow-rate formatters) and `RecipeVersionsPage.tsx:141` (duration) to use the shared formatters, and extend their tests with one rounded-ratio and one long-duration case each.
- [ ] Render `apps/web/src/pages/admin/AdminDashboard.tsx` stat tile values via `formatNumber(value, locale)`, and update its test.

### Charts: guards and docs

- [ ] Add `apps/web/src/utils/chart/chart-guards.test.ts`. It reads `ScaaRadarChart.tsx`, `BrewTimeline.tsx`, `StarRating.tsx`, `IntensityDots.tsx` and `apps/web/src/components/charts/**/*.tsx`, and asserts:
  - no `overflow: 'visible'`, `overflow-visible` or `overflow="visible"`;
  - no `<text`/`<tspan` inside an `<svg` that has `preserveAspectRatio="none"`;
  - no hex colour literals.
- [ ] Add the AGENTS.md "Charts" bullet under Code style: use `apps/web/src/utils/chart` primitives; no `<text>` in `preserveAspectRatio="none"` SVGs; colours from tokens; geometry tests required. Run single web tests with `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run <path>`, because `make test-specific` skips web. Coordinate wording with the docs track's AGENTS.md edits.

### Charts: verification

- [ ] Run `make check-web`, `make lint`, `make test-web` and `make test-shared` (for i18n parity), then `make fmt` and confirm `make fmt-check` is clean.
- [ ] Manual visual check on `make dev` (seeded DB) at viewports 320, 375, 768, 1024 and 1280px × themes light, dark and coffee × locales en and tr:
  - `/recipes/blue-mountain-cold-brew`: axis ≤ 8 labels, `12h` stat card, no stretched text.
  - The espresso recipes with 28s/5s and 27s/6s pre-infusion: phase labels inside their phase or in the caption.
  - A recipe whose taste notes cover all 9 SCAA categories: radar labels inside the card, Turkish labels under tr, chips stacking under 520px of card width.
  - A recipe with a single category: vertex marker visible.
  - Focus mode for the same recipes.
  - Print preview of a recipe detail page.
  - Keyboard-only rating (Tab, arrows, Shift+arrow, Enter, Escape) with focus retained during submit.
  - VoiceOver reading the read-only author and community ratings, the radar values and the timeline durations.
  - Record deviations in the PR description.
