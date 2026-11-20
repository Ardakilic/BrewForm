# t6-charts: chart and visualization bounds (research and validation notes)

Track owner: t6-charts. Capability: `chart-rendering` (new).
User decision (verbatim): "Address all of these out of bounds charts and fix them all."

All numbers below were computed on 2026-11-18 from the code at `main` (`ada9f6e`). Text widths
were measured with CoreText using the macOS system UI font (SF Pro), because Inter is **not**
loaded: the Google Fonts links in `apps/web/index.html:57-59` are commented out, so
`--font-sans: "Inter", system-ui, …` (`globals.css:11`) falls back to the platform UI font
(SF Pro on Apple, Roboto on Android, Segoe UI on Windows). Measurement scripts were kept in the
session scratchpad. The fixture table in §8 is what the implementation's width-estimate test
must use.

## 1. Inventory: every chart, meter and visual value display in `apps/web/src`

Found with `grep -rn viewBox`, `grep -rn "style={{"` and `%` widths, plus `intensity`/`rating`/`stat` greps.

| Component | File | Kind | In scope? |
|-----------|------|------|-----------|
| SCAA radar chart | `components/recipe/ScaaRadarChart.tsx` + `utils/radar-chart-data.ts` | SVG chart | yes, broken |
| Brew timeline | `components/recipe/BrewTimeline.tsx` (used by `RecipeDetailPage.tsx:287` and `RecipeFocusModePage.tsx:159`) | SVG area + HTML axis | yes, broken |
| Star rating | `components/recipe/StarRating.tsx` (`RecipeDetailPage.tsx:354,362,384`) | SVG meter + input | yes, broken |
| Intensity dots | `components/recipe/IntensityDots.tsx` (chips, `TasteAutocomplete.tsx:267`) | 3-slot meter | yes, no clamping |
| Stat cards | `components/recipe/StatCards.tsx` + `utils/stat-cards.ts` | stat tiles | yes, overflow from unrounded values |
| Brew-log stats | `components/brew-log/RecipeBrewStats.tsx` | text stat | yes, decimal not localized |
| Recipe card rating strip | `components/recipe-list/RecipeCard.tsx:89` | star glyph and value | yes, wrong scale |
| Compare / version diff / versions pages | `RecipeComparePage.tsx:265-267`, `VersionDiffPage.tsx:138-140`, `RecipeVersionsPage.tsx:141` | ratio and duration text | yes, raw floats and raw seconds |
| Admin dashboard tiles | `pages/admin/AdminDashboard.tsx:58-77` | stat tiles | minor (no locale grouping) |
| Profile counts | `pages/users/UserProfilePage.tsx:206-212` | inline counts | no visual-bounds issue (profile tab overflow belongs to the responsive track) |
| Skeleton widths | `components/ui/Skeleton.tsx:41-48` | constant % widths | no issue (constants) |
| Chevron and check icons | `TasteNotesFilter.tsx`, `Navbar.tsx`, `LanguageSelector.tsx`, `NotificationItem.tsx` | icons | no issue |

There are no other SVG charts, `<meter>`/`<progress>` elements, or data-driven `%` bars. The
compare and diff pages render text only, with no visual bars. Only two places drive a style from
data: `BrewTimeline.tsx:137-138,257` (`width`/`left` in %).

## 2. Container widths (the real geometry the charts live in)

The `.card` class is `padding: 1.5rem` plus a 1px border (`globals.css:125-130`).

| Page / viewport | 320 | 375 | 414 | 640 (sm) | 768 (md) | ≥1024 |
|-----------------|-----|-----|-----|----------|----------|-------|
| Recipe detail main column, card inner width (`max-w-4xl px-6`, `md:grid-cols-3`, `md:col-span-2`; `RecipeDetailPage.tsx:271-275`) | **222** | 277 | 316 | 542 | 422 | 507 |
| Focus mode, card inner width (`max-w-3xl px-4 sm:px-6`; `RecipeFocusModePage.tsx:109`) | 238 | 293 | 332 | 542 | 670 | 670 |
| Recipe detail sidebar card (StarRating; 1/3 column) | 222 | 277 | 316 | 542 | 174 | 218 |

**The smallest real chart container is 222px** (recipe detail at a 320px viewport). The brief
suggested ≥280px. That is too lax, so the spec uses **200px** as the minimum supported container
width, which covers any viewport of 320px or wider.

## 3. ScaaRadarChart: validation

| Claim (audit §5.1, findings `ui-visual-design/radar-labels-out-of-bounds`, `web-architecture/charts-out-of-bounds`) | Verdict | Evidence |
|---|---|---|
| `MAX_RADIUS=100` per 300, `LABEL_RADIUS_FACTOR=1.15`, no label padding | **confirmed** | `ScaaRadarChart.tsx:21-23,85,147` |
| viewBox = `0 0 size size`, fixed `width={size}`, `overflow: 'visible'` | **confirmed** | `ScaaRadarChart.tsx:101-107` |
| fixed `fontSize={10}`, start/end anchors, raw English `{cat}` | **confirmed** | `:150-159`; categories hardcoded in `utils/radar-chart-data.ts:6-16` (the audit cited the wrong path once); only the aria-label uses `t()` (`:106`) |
| Overflow at size 200 of about −55 / +28; at 160 about −63 / +35 | **confirmed, slightly overstated** (depends on the font) | Measured with SF Pro (table below): size 200 overflows **−52.8px left / +26.2px right**; size 160 overflows **−57.7px / +32.9px**; size 300 overflows −40.6 / +9.4 |
| Chart rendered twice, toggled by CSS | **confirmed** | `TastingNotesSection.tsx:114-120` (`hidden sm:block` 200 + `block sm:hidden` 160) |
| Values not clamped | **confirmed, worse than stated** | `:88-95`: a `NaN` category value makes `Math.max(...)` return `NaN`, so every point is `NaN,NaN` and the polygon does not render. `maxValue={1}` with a value of 9 puts the vertex at 9×R, far outside the box. A negative value mirrors the point through the centre. `maxValue` ≤ 0 is coerced to 1, not to the data max. |

Measured label boxes for the current code (SF Pro 10px regular; x range, viewBox `[0,size]`):

| Label (angle) | size 160 | size 200 |
|---|---|---|
| Sweet (−10°) | [140.4, 170.0] → **+10.0** | [175.5, 205.1] → **+5.1** |
| Nutty/Cocoa (30°) | [133.1, 192.9] → **+32.9** | [166.4, 226.2] → **+26.2** |
| Green/Vegetative (150°) | [−56.4, 26.9] → **−56.4** | [−49.7, 33.6] → **−49.7** |
| Sour/Fermented (190°) | [−57.7, 19.6] → **−57.7** | [−52.8, 24.5] → **−52.8** |

What happens on the page: the chart's x origin sits at the card's inner edge (49px from the
viewport edge at ≤896px viewports), so at size 160 on a 375px phone "Sour/Fermented" is clipped
**8.7px off-screen** after crossing the card border. At sm and md (640–895px) the size-200 chart
is clipped 3.8px off-screen. On the right at sm and above, "Nutty/Cocoa" overruns the 24px `gap-6`
by 2.2px into the chip column.

Edge inputs: all zeros draw a degenerate polygon (a point). One non-zero category draws a line
from the centre, and two draw a thin triangle. Neither case shows a vertex marker, so a single
low value is almost invisible.

i18n: no `taste.category.*` keys exist in `packages/shared/src/i18n/en.json` or `tr.json`. Taste
note names come from `files/scaa-2.json`, which ships English plus `name_ru` and no Turkish, so
Turkish users see English axis labels and English chip-group headings
(`TastingNotesSection.tsx:130`).

## 4. BrewTimeline: validation

| Claim (audit §5.2, `ui-visual-design/brew-timeline-geometry`) | Verdict | Evidence |
|---|---|---|
| `<text>` inside `preserveAspectRatio="none"` 1000×120 at `width=100%`, `h-[80px]` | **confirmed** | `BrewTimeline.tsx:142-147`, text at `:199-244` |
| Glyphs render at about 41% of natural width on a ~277px card, about 75% on desktop | **confirmed** | scaleY = 80/120 = 0.667 throughout. Horizontal/vertical ratio: **33%** at 222px (320 viewport), **41.5%** at 277px, 63% at 422px (md), **76%** at 507px (detail desktop), 100.5% at 670px (focus desktop). Text is never stretched wider than natural, but is always squashed on the detail page |
| `generateAxisMarkers` caps the step at 30s with no count limit; a 12h cold brew gives 1,441 labels | **confirmed**, and **reachable in seeded data**: `packages/db/src/seed-users-recipes.ts:1133` seeds `blue-mountain-cold-brew` with `extractionTimeSeconds: 43200` | `:9-25` |
| Total always appended, so near-duplicate markers overlap | **confirmed** | `:22-24` |
| `pre ≥ total` gives negative widths and a `-3s` label | **confirmed** | `:92-93,243`. `RecipeUpdateSchema = RecipeCreateObjectSchema.partial()` (`packages/shared/src/schemas/recipe.ts:121-123`) drops the `pre < extraction` refinement (`:92-104`); t1 (recipe-write, finding W6) owns the API-side fix |
| `PRE-INFUSION` label about 133 units wide | **overstated** | The SVG text is `Pre-Infusion` (no text-transform) and measures **111.7 units** at 16px semibold + 1.5 letter-spacing. For 3s/28s (zone 107.1 units) it still spans [−2.3, 109.4], clipped at x<0 and crossing the divider. For 1s/30s it spans [−39, 72] |
| No pre-infusion or flow-rate input in the forms | **confirmed** (out of this track's scope; see Open questions) | `grep preInfusion` hits only the Detail, Focus and Diff pages |

New problems found while validating (not in the audit):

1. **A recipe can freeze every viewer's tab.** `extractionTimeSeconds` is
   `z.number().positive()` with no maximum (`recipe.ts:41`), stored as Postgres `integer`
   (`schema.ts:233`, max 2,147,483,647). The marker loop runs `total/30` times and renders one
   `<div>` per marker. At the int32 maximum that is **71.6 million** DOM nodes, which hangs or
   crashes the recipe detail page for anyone who opens a public recipe saved with that value.
   Tick generation must cost the same for any total.
2. **Unrounded flow rate in the header.** `computeFlowRate` (`packages/shared/src/utils/metrics.ts:8-11`)
   is not rounded and is stored as `real`, so the header shows e.g. `1.2857143 ml/s`
   (`BrewTimeline.tsx:113-116`). That string is 100.4px wide at 14px. In Turkish, the title
   `DEMLEME ZAMAN ÇİZELGESİ` is 200.8px, so title plus value (301px) cannot share one row in a
   222px or 277px card, and both wrap mid-phrase.
3. **Contrast.** Tick labels use `--text-tertiary` on `--bg-secondary`: **2.31:1** in light,
   3.16:1 in dark, 5.30:1 in coffee. Light and dark fail the 4.5:1 text minimum.
4. **total ≤ 0 / NaN.** `generateAxisMarkers(0)` returns `[0]`, then `left: NaN%`. Neither the
   schema nor the DB allows 0 today, but the component does not guard against it.
5. **Units are not localized.** `{n}s` is hardcoded (`:218,243,268`), while the Turkish a11y
   strings use `sn`. Raw seconds are also unreadable for long brews (`43200s`, also at
   `stat-cards.ts:64`, `VersionDiffPage.tsx:139`, `RecipeVersionsPage.tsx:141`).

Current axis collisions (SF Pro 10.4px `{n}s` labels, the first label left-anchored, the last
right-anchored, the rest centred):

| Total | Markers | Overlapping pairs at 222px / 277px / 507px |
|---|---|---|
| 27s | 7 | 1 / 1 / 0 (25s vs 27s) |
| 59s | 13 | 11 / 1 / 0 |
| 290s | 11 | 8 / 1 / 1 |
| 600s | 21 | 20 / 20 / 16 |
| 3600s | 121 | 120 / 120 / 120 |
| 43200s | **1,441** | 1,440 / 1,440 / 1,440 (200 labels entirely outside at 277px) |

Totals from 1 to 3600 with at least one overlapping pair: **3,568 of 3,600 at 222px**, 3,546 at
277px, 3,435 at 507px.

Proposed algorithm simulation (time-step ladder `1,2,5,10,15,30s,1,2,5,10,15,30min,1,2,3,6,12h,1d`
then `d × {2,5,10…}`; unit-consistent labels; end label = compact total; the preceding nice tick
is dropped when it collides with the end label; 6px minimum gap; ≤8 ticks), run over totals
1–7200 (every second), 7200–86400 (every 37s), and 172800, 10⁶ and 2,147,483,647:

| Locale | 200px | 222px | 277px | 507px | 670px |
|---|---|---|---|---|---|
| en: max/min ticks; failures | 8/2; **0** | 8/2; **0** | 8/2; **0** | 8/2; **0** | 8/2; **0** |
| tr: max/min ticks; failures | 6/2; **0** | 7/2; **0** | 7/2; **0** | 8/2; **0** | 8/2; **0** |

Sample output at 222px (en): 27s → `0 5s 10s 15s 20s 27s`; 290s → `0 1m 2m 3m 4m 50s`;
1800s → `0 5m 10m 15m 20m 30m`; 43200s → `0 2h 4h 6h 8h 12h`; 86400s → `0 6h 12h 18h 24h`.
Turkish: 43200s → `0 2 sa 4 sa 6 sa 8 sa 12 sa`.

**Monotonicity:** with fixed-px labels, the gap between neighbouring label edges is
`(t[i+1]−t[i])/total × W − const`, which never shrinks as W grows, and the end anchors stay
pinned at 0 and W. Ticks that fit at 200px therefore fit at every wider width. That is why the
axis can be computed once at the minimum width with no DOM measurement.

Phase-label fit (title 11px semibold uppercase with 0.05em tracking, value 18px bold, 6px padding
each side; T = title fits in its phase, V = value fits, `-` = hidden in the chart):

| pre/total | en 222 | en 507 | tr 222 | tr 670 |
|---|---|---|---|---|
| 5/28 (seed espresso) | `-V / TV` | `-V / TV` | `-- / TV` | `TV / TV` |
| 3/28 | `-- / TV` | `-V / TV` | `-- / TV` | `-V / TV` |
| 1/30 | `-- / TV` | `-- / TV` | `-- / TV` | `-- / TV` |
| 25/28 | `TV / --` | `TV / -V` | `TV / --` | `TV / -V` |

So a phase value often cannot fit inside a narrow phase. The design therefore moves any hidden
value into a caption row below the chart, which keeps every value visible.

## 5. StarRating: validation

| Claim (`ui-visual-design/star-rating-keyboard-a11y`) | Verdict | Evidence |
|---|---|---|
| Keyboard activation always submits a half star | **confirmed** | `StarRating.tsx:61-65,91`: a keyboard click has `clientX = 0`, so `0 − rect.left < width/2` and the value is always odd |
| aria-label `label(starIndex*2)` disagrees with the submitted value | **confirmed** | `:89` vs `:91` |
| Read-only mode is 5 disabled buttons | **confirmed** | `:83-95`, used read-only at `RecipeDetailPage.tsx:354,362` |
| `#f5a623` hardcoded | **confirmed** | `:43,46`. Contrast vs `--bg-secondary`: light **1.86:1** (fails the 3:1 non-text minimum), dark 7.48, coffee 5.85. Filled vs empty fill (`--bg-tertiary`): light 1.61:1 |
| Tests click with explicit `clientX` only | **confirmed** | `StarRating.test.tsx:102,117` |

More defects found:

- **Fractional values.** The fill rounds down to the half star (`:22-23`) while the label rounds
  to one decimal (`:70-73`). A value of 7.9 shows 3.5 filled stars next to the text `4.0★`.
- **Out of range.** 11 shows 5 full stars and `5.5★`. −1 shows nothing and `-0.5★`. `NaN` shows
  `NaN★`. `0` reads as falsy and shows `—` (`:99`).
- **No locale decimals.** `toFixed` is used even though `utils/format.ts:16` `formatNumber`
  exists. `formatNumber` has **zero call sites**, so the archived i18n requirement "Decimals
  localize" (`openspec/specs/i18n/spec.md:525-528`) and its web-shared-components counterpart
  (`:763-764`) are unimplemented drift.
- **Busy state.** `interactive={ratingFetcher.state === 'idle'}` (`RecipeDetailPage.tsx:385`)
  sets `disabled` while the request is in flight, which drops keyboard focus to `<body>`.

Sizes: 5×28px stars + 4×4px gaps + a 2.5rem label = 200px. That fits the 218px desktop sidebar
card, but the md sidebar is 174px, where the label wraps under the stars. This is cosmetic, but
the new control must keep its minimum footprint ≤ 174px or wrap cleanly.

## 6. Other value displays

- **Stat card ratio overflow.** `computeBrewRatio` is unrounded and stored as `real`, so
  40 ml / 18 g → `1:2.2222223` (`stat-cards.ts:69`). At 24px bold that is **142.7px** in a
  **≈100px** card at md (5 columns of 134.4px − 32px padding − 2px border) and ≈97px at lg
  (6 columns). The grid tracks are `minmax(0,1fr)`, so the text overflows **≈43px into the next
  card**. `43200s` (90.3px) only just fits; `12h` would be 34px.
- **Compare and diff pages.** `1:${val}` and `${v}s` print raw floats and seconds
  (`RecipeComparePage.tsx:267`, `VersionDiffPage.tsx:139`).
- **Recipe card.** `• ★ {version.rating}` (`RecipeCard.tsx:89`) prints the stored 1–10 value
  next to a star, so a 4/10 rating reads "★ 4". This is the same issue as
  `ui-visual-design/landmark-and-semantics` (card rating scale). Tests that assert it:
  `RecipeCard.test.tsx:149`, `CoffeeVarietyDetailPage.test.tsx:311`.
- **IntensityDots.** No clamping (`IntensityDots.tsx:21-22`). An intensity of 5 fills 3 dots and
  announces "Intensity 5 of 3". `NaN` announces "Intensity NaN of 3". 2.5 fills 3. The DB CHECK
  1–3 (`schema.ts:303`) protects stored data, but not props.
- **RecipeBrewStats.** `toFixed(1)` + `/10` (`RecipeBrewStats.tsx:51`) is not localized.
- **AdminDashboard.** Raw integers without locale grouping. The 256px fixed admin sidebar on
  phones belongs to the admin-layout track.

## 7. Colour and contrast (WCAG 2.2; text 4.5:1, graphics 3:1, gridlines decorative)

| Pair | light | dark | coffee |
|---|---|---|---|
| Radar labels `--text-secondary` / `--bg-secondary` | 6.99 | 6.01 | 7.59 |
| Radar data `--accent-primary` / `--bg-secondary` | 6.82 | 6.78 | 5.30 |
| Timeline stroke `--accent-primary` / `--bg-tertiary` (pre zone) | 5.93 | 4.59 | 4.35 |
| Axis ticks today `--text-tertiary` / `--bg-secondary` | **2.31** | **3.16** | 5.30 |
| Star today `#f5a623` / `--bg-secondary` | **1.86** | 7.48 | 5.85 |
| Proposed `--rating-star` (`#b45309` / `#f59e0b` / `#fbbf24`) vs `--bg-secondary` | 4.60 | 7.06 | 7.11 |
| Proposed `--rating-star` vs empty-star fill `--bg-tertiary` | 4.00 | 4.78 | 5.83 |
| Guides `--border-primary` / `--bg-secondary` | 1.15 | 1.48 | 1.22 (decorative, exempt) |

## 8. Width-estimate calibration (fixture for `estimateTextWidth` tests)

Estimate: per character, narrow set `iljtfrıI.,:;'|!/ ()[]-` 0.34em; uppercase plus `m w` and
Turkish capitals 0.80em; digits 0.62em; everything else 0.60em; letter-spacing added per
character. Multiply by **1.1 safety**, and by 1.06 for bold. Without the 1.1 factor the raw
estimate/measured ratio ranges from 0.98 to 1.21; with it, it ranges from **1.08 to 1.33**.

| String | font | SF Pro measured px |
|---|---|---|
| Green/Vegetative | 10 regular | 83.3 |
| Sour/Fermented | 10 regular | 77.3 |
| Nutty/Cocoa | 10 regular | 59.8 |
| Vegetative | 10 regular | 51.1 |
| Fermented | 10 regular | 52.1 |
| Green/ | 10 regular | 32.1 |
| Floral / Fruity / Sweet / Spices / Roasted / Other | 10 regular | 26.7 / 27.6 / 29.6 / 32.2 / 39.2 / 27.3 |
| Yeşil/Bitkisel / Ekşi/Fermente / Fındıksı/Kakao | 10 regular | 60.4 / 68.3 / 69.0 |
| Çiçeksi / Meyvemsi / Tatlı / Baharatlı / Kavrulmuş / Diğer / Fındıksı/ / Bitkisel | 10 regular | 34.7 / 48.1 / 20.0 / 42.5 / 50.2 / 25.9 / 39.7 / 35.0 |
| 300s / 43200s / 55s / 290s / 12:00:00 / 4:30 | 10.4 regular | 25.5 / 38.6 / 18.6 / 25.3 / 44.3 / 23.2 |
| Pre-Infusion / Extraction / Ön Islatma / Ekstraksiyon | 16 semibold, 1.5px tracking | 111.7 / 92.2 / 95.8 / 114.3 |
| PRE-INFUSION / ÖN ISLATMA / EKSTRAKSIYON | 11 semibold, 0.6px tracking | 88.6 / 75.3 / 93.7 |
| 4 dk 30 sn / 25 sn / 3 sn / 3s | 18 bold | 89.8 / 47.2 / 36.2 / 21.3 |
| 1:2.2222223 / 1:2,2 / 43200s / 12 sa | 24 bold | 142.7 / 53.7 / 90.3 / 57.6 |
| 1.2857143 ml/s / 1,3 ml/s | 14 medium | 100.4 / 50.2 |
| DEMLEME ZAMAN ÇİZELGESİ / BREW TIMELINE | 12 semibold, 1.2px tracking | 200.8 / 110.9 |

Proposed Turkish category names, to be reviewed by a native speaker: Çiçeksi, Meyvemsi, Tatlı,
Fındıksı/Kakao, Baharatlı, Kavrulmuş, Yeşil/Bitkisel, Ekşi/Fermente, Diğer.

## 9. Proposed radar geometry (fitted viewBox, uniform scaling)

The plot radius is R = 100 viewBox units. Labels sit at R + 10, with one line per `/`-segment at
1.2 line height, anchored start/end/middle by side. The viewBox is the union of the plot and
label boxes plus a 4-unit margin, and the SVG renders at `width: 100%` up to `max-width: 280px`.

| Locale | font (vb units) | viewBox w×h | label px at 222px | plot R px at 222 | label px at 280px | plot R px at 280 |
|---|---|---|---|---|---|---|
| en | 18 | 391×265 | **10.2** | 57 | 12.9 | 72 |
| tr | 18 | 395×265 | **10.1** | 56 | 12.8 | 71 |
| de (hypothetical, longest) | 18 | 401×265 | 10.0 | 55 | 12.6 | 70 |
| en | 14 | 354×255 | 8.8 (too small) | 63 | 11.1 | 79 |

For comparison, the current desktop plot radius is 66.7px with labels spilling up to 52.8px past
the box. The proposal keeps a similar plot (71–72px at 280px) with all labels inside.

## 10. Library and platform research

- **MDN `vector-effect`** (Context7 `/websites/developer_mozilla_en-us`): `non-scaling-stroke`
  keeps stroke width "physically equal… even if the element has been scaled… by physical resizing
  of the entire image". The other values have no implementations. This is the correct tool for
  `preserveAspectRatio="none"` strokes. Text has no equivalent, so text must leave the stretched
  SVG.
- **d3-array `ticks`** (Context7 `/websites/d3js`): nice values are a power of ten × {1, 2, 5},
  roughly `count+1` values, inclusive of the bounds. This is used for numeric `niceTicks`.
  **d3-time / d3-scale time ticks** use the ladder 1/5/15/30 s, 1/5/15/30 min, 1/3/6/12 h,
  1/2 d. That ladder (plus 2s/10s/2min/10min/2h for density) is used for `durationTicks`.
  Decision: no d3 dependency (about 30 lines of code; see design).
- **Tailwind v4 container queries** (Context7 `/tailwindlabs/tailwindcss.com`): `@container` and
  `@min-[520px]:flex-row` ship in core with no plugin. They are used for the TastingNotesSection
  stack/side-by-side switch, keyed to the card width rather than the viewport.
- **Intl.DurationFormat** (MDN): Baseline 2025, "newly available" since March 2025. Node 26.13
  ICU output: tr narrow `{h:12,m:30}` → `12s 30d`, which reads as seconds/days to many readers;
  tr short → `12 sa. 30 dk.`. Decision: i18n unit keys (`{n}s`/`{n} sn`, `{n}m`/`{n} dk`,
  `{n}h`/`{n} sa`) through `formatDuration`. This is deterministic in tests and needs no
  baseline-2025 API.
- **WAI-ARIA APG Rating Slider** (w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating):
  `role="slider"`, `aria-valuetext` naming the current value and the maximum, arrows ±½ star,
  Page Up/Down ±1 star, Home/End. The APG also has a radio-group rating example. Per the user
  decision ("keyboard input selects whole stars"), whole-star arrows plus Shift+arrow half steps
  are a documented deviation (see design).

## 11. Cross-track dependencies and overlaps

- **t1 (recipe-write)**: W6 restores refinements on `RecipeUpdateSchema`. The merged-value
  `pre < extraction` check on PATCH is required there. This track's chart stays defensive
  either way.
- **Recipe form inputs** for pre-infusion and flow rate are not in this track. Open question to
  the orchestrator.
- **`apps/web/src/utils/format.ts`, `apps/web/src/styles/globals.css`, `en.json`/`tr.json`, and
  `AGENTS.md`** are shared files. This track adds functions, keys and tokens and does not
  rewrite existing ones.
- **AGENTS.md drift found:** `make test-specific` runs api/db/shared only (Makefile:138-142), not
  web. Single web test files run with
  `docker compose run --rm --no-deps app pnpm --filter @brewform/web exec vitest run <path>`.
