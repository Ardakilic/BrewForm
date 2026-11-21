### Chart and visualization bounds (t6-charts)

**Context**

The web app has two hand-rolled SVG charts (`ScaaRadarChart`, `BrewTimeline`), one SVG meter and
input (`StarRating`), one dot meter (`IntensityDots`), and several stat tiles. None of them share
geometry, clamping or formatting code. Every claim from the audit was validated against the code.
Full numbers are in `audit/t6-charts.md`.

- **Radar** (`components/recipe/ScaaRadarChart.tsx`)
  - The viewBox equals the plot (`:101-107`), with a fixed `width={size}`, `overflow: 'visible'`,
    `MAX_RADIUS = size/3`, labels at 1.15·R (`:21-23`), a fixed 10px font, and raw English
    `{cat}` (`:150-159`, `utils/radar-chart-data.ts:6-16`).
  - Measured with the real fallback font (SF Pro; Inter is not loaded, `index.html:57`), labels
    overflow by **−52.8 / +26.2px at size 200** and **−57.7 / +32.9px at size 160**. On a 375px
    phone that is 8.7px off-screen. The audit's −55/−63 figures are slightly overstated; the
    overflow is real.
  - It is rendered twice, toggled by CSS (`TastingNotesSection.tsx:114-120`).
  - A `NaN` value blanks the whole polygon (`Math.max` gives `NaN`), and a caller `maxValue`
    below the data throws vertices outside the plot.
- **Timeline** (`components/recipe/BrewTimeline.tsx`)
  - `<text>` sits inside a `preserveAspectRatio="none"` 1000×120 SVG at 80px tall (`:142-147,
    199-244`). On the recipe detail page glyphs render at **33% (222px)**, **41.5% (277px)** and
    **76% (507px)** of their natural width.
  - The axis loop has no count limit (`:9-25`). The seeded `blue-mountain-cold-brew` (43,200s,
    `seed-users-recipes.ts:1133`) gets **1,441 labels**. 3,568 of the totals between 1 and
    3,600 have at least one overlapping label pair at 222px.
  - **New:** `extraction_time_seconds` is an unbounded `integer` (`recipe.ts:41`,
    `schema.ts:233`), so a public recipe saved with 2,147,483,647 makes viewers' tabs try to
    render about 71.6M `<div>`s.
  - `pre ≥ total` (reachable through PATCH; t1/W6 owns the schema fix) gives negative widths and
    `-3s` labels.
  - The flow rate is unrounded (`1.2857143 ml/s`, `:113-116`).
  - Tick text uses `--text-tertiary`, at 2.31:1 in the light theme.
- **StarRating** (`components/recipe/StarRating.tsx`)
  - A keyboard click has `clientX = 0`, so it always submits a half star (`:61-65`).
  - The read-only display is 5 disabled buttons (`:83-95`).
  - The fill colour is hardcoded `#f5a623` at 1.86:1 in light (`:43,46`).
  - The fill rounds down while the label rounds to nearest, so 7.9 shows 3.5 stars next to
    "4.0★".
  - `NaN★` and `5.5★` are reachable.
  - The busy state sets `disabled`, which drops focus (`RecipeDetailPage.tsx:385`).
- **Other displays**
  - Unrounded `brewRatio` `1:2.2222223` is 142.7px in a ≈100px md stat card, so it overflows
    about 43px into the next card (`stat-cards.ts:69`).
  - Raw seconds appear in stat cards, the diff page and the versions page.
  - `RecipeCard.tsx:89` shows the 1–10 value next to a star.
  - `IntensityDots` does not clamp its input.
  - `utils/format.ts:16` `formatNumber` exists but has zero call sites, so the archived i18n
    "Decimals localize" requirement is unimplemented drift.

**Decisions**

1. **Keep hand-rolled SVG and add one small shared primitives module (`apps/web/src/utils/chart/`); add no chart dependency.**
   - Alternatives considered:
     - Recharts. It is about 100KB+ gzipped, and its `ResponsiveContainer` depends on
       `ResizeObserver`. Its radar labels still need a custom tick renderer to stay in bounds.
     - visx. It is modular, but it would add several packages for two charts.
     - d3-array/d3-scale for ticks only.
   - Rationale: both charts are static and print-oriented, and their tests exist. The missing
     pieces (clamp, nice ticks, width estimate, box math) total about 200 lines of pure,
     unit-testable code. The algorithms follow d3 conventions: numeric ticks at 10^k×{1,2,5}
     (`d3.ticks`), and the duration ladder follows d3-time's 1/5/15/30 s, 1/5/15/30 min,
     1/3/6/12 h, plus 2s/10s/2min/10min/2h for density.
   - Module layout:
     - `scale.ts`: `sanitizeNumber`, `clamp`, `clampPct`, `safeRatio`.
     - `ticks.ts`: `niceTicks`, `durationTicks`.
     - `text.ts`: `estimateTextWidth`, `wrapLabel`.
     - `layout.ts`: `Box`, `labelBox`, `unionBox`, `isInside`, `overlaps`, `fitViewBox`.
     - `index.ts`: barrel with a JSDoc header stating the rules.
     - `measured-widths.fixture.ts`.
2. **Radar: fitted viewBox with uniform scaling.**
   - The plot radius is R = 100 viewBox units with labels at R + 10. Labels are wrapped after `/`
     into `<tspan>` lines at 1.2 line height, with anchors start (right), end (left) or middle
     (top and bottom).
   - The viewBox is `fitViewBox(union(plot, labelBoxes), margin 4)`, with horizontal padding
     made symmetric for balance. The SVG renders at `width="100%"`, `max-width: 280px`, with no
     `overflow` override.
   - With font = 18 viewBox units, labels render at **10.2px at 222px** and **12.9px at 280px**
     (en; 10.1/12.8 tr). The plot radius is 57–72px, against 66.7px on desktop today.
   - It renders a single instance. `TastingNotesSection` becomes a `@container` with
     `@min-[520px]:flex-row`, so it stacks in the 422px md column and goes side by side in the
     507px lg column.
   - Labels and chip headings come from `t('taste.category.<slug>')`, using a slug map added to
     `radar-chart-data.ts`.
   - Values pass through `clamp(sanitizeNumber(v), 0, effectiveMax)`. `effectiveMax` is the
     larger of a finite `maxValue` and 1, or else the larger of the data max and 3.
   - Vertex circles are drawn when only 1–2 categories are non-zero. No polygon is drawn when all
     values are zero.
   - Alternatives considered:
     - HTML labels around a px-padded square. The geometry is equivalent but it needs more DOM.
     - Scaling the font with the `size` prop. This is the status quo and it still overflows.
     - Abbreviated labels. These lose meaning.
     - Keeping two sized instances. This duplicates the DOM and still has no fit guarantee.
3. **Timeline: shapes in a stretched SVG, text in HTML.**
   - The area and stroke paths stay in the `preserveAspectRatio="none"` SVG. The stroke and the
     divider get `vector-effect="non-scaling-stroke"` (MDN: stroke width stays physical under
     non-uniform scaling).
   - Phase titles and values become HTML boxes `style={{ width: pct% }}` over the SVG.
   - `layoutPhaseLabels(model, widthPx, locale)` decides title and value visibility from
     `estimateTextWidth` (title 11px semibold uppercase with 0.05em tracking; value 18px bold;
     6px padding). Hidden values move to a caption row below the chart, so no value is ever
     lost.
   - Width comes from a new `useElementWidth` hook (`ResizeObserver`, measured in
     `useLayoutEffect`, so there is no visible flash in the SPA). When it is not available
     (jsdom, the first render), the 200px minimum is used.
   - Alternatives considered:
     - Uniform `meet` scaling. This letterboxes or makes the height track the width.
     - CSS container queries plus ellipsis. Truncated numbers like "4 dk…" are misleading, and
       container-query thresholds cannot depend on per-label widths.
     - Measuring text with `getBBox`. jsdom does not support it, and it is not deterministic.
4. **Axis: `durationTicks` computed once at the 200px minimum width.**
   - It walks the ladder from the first step that yields ≤ 8 ticks and stops at the first step
     whose labels fit with a 6px gap. The first label is left-anchored, the last right-anchored,
     the rest centred.
   - Labels use the step's unit (en `{n}s/{n}m/{n}h`, tr `{n} sn/{n} dk/{n} sa`). The end label is
     the compact total. The last nice tick is dropped when it collides with the end label.
   - Beyond one day, steps are computed in closed form as `86400 × {2,5,10}·10^k`, so work stays
     O(ladder × 8) even at the int32 maximum.
   - Monotonicity proof (fixed-px labels, so edge gaps grow linearly with width): ticks that fit
     at 200px fit at every wider width. That allows a pure render with no measurement and stable
     ticks on resize.
   - Simulated over 1–86,400s plus the extremes, in en and tr, at 200, 222, 277, 507 and 670px:
     **0 failures, ≤ 8 ticks, ≥ 2 ticks**.
   - The step formula `total>120 ? 30 : …` is retired. The existing property tests that encode
     it (`BrewTimeline.test.tsx` Property 5) are replaced by the new invariants, which keep
     "includes 0 and total" and "strictly ascending".
5. **Clamp semantics: `pre ≥ total` means no split; do not clamp to `total−1`.**
   - A fabricated 27s/1s split misrepresents inconsistent data. A single extraction phase with
     the true total is honest.
   - The component logs a `warn` once per mount from `useEffect` (numeric values only, no PII,
     `createLogger('BrewTimeline')`).
   - A total that is missing, non-finite or ≤ 0 renders nothing.
   - Validation belongs to t1 (`RecipeUpdateSchema` merged-value refinement). The chart stays
     defensive regardless.
6. **StarRating: a single `role="slider"` control with whole-star arrows, Shift for halves, and explicit commit.**
   - Keys:
     - Arrow keys move ±1 star (±2 on the 1–10 scale). Shift+arrow moves ±½ star.
     - Digits 1–5 select that whole star. Home/End select ½ and 5 stars.
     - Enter/Space commit. Escape reverts. Blur with an uncommitted pending value commits once.
   - Pointer hover previews, and a click on a half commits, as today.
   - `aria-valuetext` reads "3.5 of 5 stars". `aria-describedby` points at a localized key hint.
     The busy state uses `aria-disabled`, not `disabled`, so focus survives the fetcher
     round-trip. The parent prop becomes `busy` alongside `interactive`.
   - Read-only mode is `<div role="img" aria-label="Rated 3.5 out of 5 stars">` with
     `aria-hidden` star SVGs and no buttons.
   - The value is `clamp(round(sanitize(v)), 1, 10)`, with ≤ 0, `NaN` and `null` meaning not
     rated. The fill and the label come from the same rounded value, and the label uses
     `formatDecimal`.
   - Alternatives considered:
     - The minimal `e.detail === 0` fix. Half stars stay mouse-only, which fails WCAG 2.1.1.
     - A native radio group of 10. Arrow navigation checks each radio, which would submit on
       every keypress through the auto-submitting fetcher form.
     - APG's half-step arrows. These contradict the user decision "keyboard input selects whole
       stars". The deviation is documented in the hint text.
7. **Colour tokens.**
   - Add `--rating-star` to `:root`, `.dark` and `.coffee` (`#b45309` / `#f59e0b` / `#fbbf24`;
     4.60 / 7.06 / 7.11:1 against `--bg-secondary`; ≥ 4.0:1 against the empty-star fill).
   - Timeline ticks switch to `--text-secondary` (≥ 6.0:1 in every theme).
   - A small contrast unit test parses `globals.css` theme blocks so regressions fail CI.
   - Guides stay decorative.
8. **Formatting goes through `utils/format.ts` with i18n unit keys, not `Intl.DurationFormat`.**
   - Add `formatDecimal(value, locale, maxFractionDigits)`, built on `Intl.NumberFormat`.
   - Add `formatDuration(seconds, locale)`: at most two units, unit text from
     `chart.duration.{seconds,minutes,hours}`.
   - Add `formatDurationTick(value, step, locale)`.
   - `Intl.DurationFormat` is Baseline 2025 ("newly available"). Its tr narrow output for
     12h30m is `12s 30d` (verified on Node 26.13 ICU), which reads as seconds/days. Its short
     style adds dots and commas (`12 sa. 30 dk.`) that do not fit tick labels.
   - Locale comes from `useTranslation().locale`. Presentational components rendered without a
     provider use a new `useSafeLocale()` next to `useSafeT()` in `utils/safe-translation.ts`.
9. **Width estimate.**
   - Per character: 0.34em for narrow glyphs (`iljtfrıI.,:;'|!/ ()[]-`); 0.80em for uppercase,
     `m`/`w` and Turkish capitals; 0.62em for digits; 0.60em otherwise. Letter-spacing is added
     per character, then the total is multiplied by 1.1 safety and by 1.06 for bold.
   - It was calibrated against CoreText-measured SF Pro. The fixture test asserts
     estimate ≥ measured for every en/tr label, tick, value and stat string (raw ratio
     0.98–1.21; 1.08–1.33 with the safety factor).
   - Roboto (Android) is narrower than SF Pro. Segoe UI is comparable.
10. **Testing strategy.**
    - Geometry is tested on pure functions, because jsdom has no layout or `getBBox`. Component
      tests cover DOM and ARIA. fast-check properties (already a devDependency) cover ticks and
      clamping.
    - A chart guard test greps chart sources for `overflow` visible, `<text>` inside
      `preserveAspectRatio="none"`, and hex colours.
    - No Playwright: it is not in the repo, and adding a browser runner is a separate
      infra decision. Visual verification is a manual checklist (viewports × themes × locales ×
      seeded recipes × print × keyboard × VoiceOver). Playwright screenshot tests are proposed
      as a deferred follow-up.
11. **Reuse for F17 (admin analytics, 5 endpoints with no UI) and F03 (profile stats).**
    - Those charts must import `utils/chart`:
      - `niceTicks` for count axes;
      - `durationTicks` for brew-time histograms;
      - `fitViewBox` with `labelBox` for bar and line label padding;
      - `clamp`/`clampPct` for bars and progress;
      - `estimateTextWidth` and `wrapLabel` for category axes;
      - `formatDecimal`, `formatNumber` and `formatDuration` for values.
    - The chart guard test's glob covers `apps/web/src/components/charts/**`, so new charts
      inherit the in-bounds and no-stretched-text rules automatically.
    - A generic `<ChartFrame>` component is deliberately not built until a third chart exists.

**Risks / Trade-offs**

- [Fallback fonts differ by platform (SF Pro, Roboto, Segoe UI, DejaVu)] → The estimate carries a
  1.1 safety factor, a 4-unit viewBox margin and a 6px tick gap. The fixture test pins it at or
  above SF Pro, the widest common fallback measured.
- [The radar footprint grows at sm+ (about 280px instead of 200px plus spill), so chips get less
  room] → The container query stacks chart and chips under 520px of card width. The plot radius
  stays about the same as today.
- [The pre-infusion title is hidden more often on phones] → The duration is always visible
  (inside the phase or in the caption row), and the accessible name always carries both phases.
- [Existing tests encode old behaviour: radar `width/height = size`, the 5/15/30s step formula,
  StarRating buttons, "★ 4" in `RecipeCard.test.tsx:149` and
  `CoffeeVarietyDetailPage.test.tsx:311`] → They are rewritten in the same tasks. The changed
  property invariants are called out in the PR.
- [StarRating blur-commit could surprise a user who tabs away mid-choice] → Escape reverts before
  blur, the hint text documents the behaviour, and one commit happens per interaction, so there
  is no submit spam.
- [Shared files edited by other tracks: `utils/format.ts`, `globals.css`, `en.json`/`tr.json`,
  `AGENTS.md`] → This track only appends functions, keys and tokens and does not rename existing
  ones. It rebases on the i18n and design-token tracks if they land first.
- [`ResizeObserver` is missing in jsdom and old browsers] → It is feature-detected, and the
  fallback is the 200px layout, which is in-bounds by construction.
- [Turkish category translations are proposals] → They go through native-speaker review before
  merge (open question).

**Migration / Rollout**

- No DB migration, no API change, no new env vars, no new dependencies.
- i18n:
  - New keys in **both** `packages/shared/src/i18n/en.json` and `tr.json`:
    - `taste.category.{floral,fruity,sweet,nuttyCocoa,spices,roasted,greenVegetative,sourFermented,other}`
    - `chart.duration.{seconds,minutes,hours}`
    - `a11y.rating.{value,notRated,slider,keyboardHint}`
    - `a11y.scaaRadarChartValues`, `a11y.scaaRadarChartEmpty`
    - `recipe.brewTimeline.flowRate`
  - Value changes to `a11y.brewTimeline` and `a11y.brewTimelineNoPreInfusion` (the hardcoded
    `s`/`sn` suffixes are removed because the placeholders now receive formatted durations).
  - The existing `packages/shared/src/i18n/i18n.test.ts` parity check guards both files.
- CSS: add `--rating-star` to the three theme blocks in `apps/web/src/styles/globals.css`.
- Rollback: revert the web commits. The data is untouched.
- Cross-track: depends on t1 (recipe-write) for the API-side `pre < extraction` check on merged
  PATCH values. It is independent of other tracks, and the chart is safe without t1.
- Docs:
  - Add an AGENTS.md "Charts" bullet (use `apps/web/src/utils/chart` primitives; no `<text>` in
    stretched SVGs; geometry tests required), coordinated with the docs track.
  - Note for the docs track: `make test-specific` does not run web tests (Makefile:138-142).
  - The archived i18n "Decimals localize" requirement becomes satisfied when this lands.
