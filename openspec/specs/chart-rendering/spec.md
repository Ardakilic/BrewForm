# chart-rendering Specification

## Purpose

Defines how the web app draws recipe charts (the SCAA radar, the brew timeline, duration axes,
meters and star ratings) through one shared chart primitives module. Marks and labels stay inside
the drawing area, charts scale responsively, values are sanitized and clamped, and durations use
shared locale-aware formatters. Colours come from theme tokens that meet contrast minimums, ratings
are accessible and keyboard operable, and the geometry is covered by regression tests and a visual
check.
## Requirements
### Requirement: Shared chart primitives module

The web app SHALL provide one shared chart utility module at `apps/web/src/utils/chart/` (`scale.ts`, `ticks.ts`, `text.ts`, `layout.ts`, re-exported from `index.ts`) that every chart, meter and rating display uses for value sanitizing, clamping, tick generation, text-width estimation, label wrapping and bounding-box geometry, and chart components SHALL NOT reimplement these helpers locally.

The module SHALL export at least:

- `sanitizeNumber(value, fallback = 0)`: returns `fallback` for `NaN`, `±Infinity`, `null`,
  `undefined` and non-numbers, and otherwise returns the number.
- `clamp(value, min, max)`: sanitizes first, swaps `min`/`max` when they are reversed, and never
  returns a value outside `[min, max]`.
- `clampPct(value)`: equivalent to `clamp(value, 0, 100)`.
- `niceTicks(min, max, maxCount)`: numeric ticks at a power of ten × {1, 2, 5}, never more than
  `maxCount`, finite, strictly ascending and inside `[min, max]`. It SHALL return for every finite
  input, including bounds one floating-point step apart and magnitudes beyond 2^53, and SHALL return
  `[]` when `max - min` overflows to infinity. When no step of the form {1, 2, 5} × 10^k yields
  between 1 and `maxCount` ticks inside the range (possible for `maxCount` 1, e.g. `[0.6, 0.8]`,
  or for a range a few subnormals wide), it SHALL return `[lo]`, the lower bound alone.
- `durationTicks(totalSeconds, options)`: see "Duration axes use bounded nice ticks".
- `estimateTextWidth(text, fontSizePx, { bold?, letterSpacingPx? })`: a deterministic,
  conservative width estimate.
- `wrapLabel(text, maxWidthPx, fontSizePx)`: splits after `/`, keeping the slash on the first
  line, and at whitespace when a segment is still too wide.
- Box helpers: `labelBox`, `unionBox`, `isInside`, `overlaps`, `fitViewBox(content, margin = 0)`.

Every exported function SHALL have co-located Vitest unit tests (`*.test.ts`).

#### Scenario: Non-finite input is sanitized

- **WHEN** `clamp(NaN, 0, 3)`, `clamp(Infinity, 0, 3)`, `clamp(-Infinity, 0, 3)` and `clamp(undefined, 0, 3)` are called
- **THEN** they return `0`, `3`, `0` and `0` respectively, and `clampPct(-12)` returns `0` and `clampPct(140)` returns `100`

#### Scenario: Numeric nice ticks respect the maximum count

- **WHEN** `niceTicks(0, 1234, 8)` is called
- **THEN** it returns at most 8 ascending values, each a multiple of one step from {1, 2, 5} × 10^k, all within `[0, 1234]`

#### Scenario: Near-equal and huge bounds terminate

- **WHEN** `niceTicks(0.3, 0.1 + 0.2, 4)`, `niceTicks(2 ** 60, 2 ** 60 + 256, 4)` and `niceTicks(-Number.MAX_VALUE, Number.MAX_VALUE, 8)` are called
- **THEN** they return `[0.3]`, at most 4 strictly ascending values inside the bounds, and `[]` respectively, and none of them loops

#### Scenario: No nice step fits

- **WHEN** `niceTicks(0.6, 0.8, 1)` and `niceTicks(0, Number.MIN_VALUE, 4)` are called
- **THEN** they return the lower bound alone, `[0.6]` and `[0]` respectively

#### Scenario: Width estimate is conservative against measured system-font widths

- **WHEN** the estimate test runs over the measured fixture in `apps/web/src/utils/chart/measured-widths.fixture.ts` (the en and tr radar labels, timeline titles, tick labels and stat values measured in SF Pro, recorded in `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t6-charts.md` §8)
- **THEN** `estimateTextWidth` returns a width greater than or equal to the measured width for every fixture row

#### Scenario: Labels wrap after the slash

- **WHEN** `wrapLabel('Green/Vegetative', 60, 10)` is called
- **THEN** it returns `['Green/', 'Vegetative']`, and a label with no `/` and no whitespace is returned as a single line

### Requirement: Chart marks and labels stay inside the drawing area

Every chart SHALL render all of its marks and text labels inside its own drawing area (the SVG viewBox for SVG content, the chart's container box for HTML labels) for every valid input at every supported container width of 200px and wider, which covers every viewport of 320px or wider (the narrowest real container is the 222px recipe-detail card at a 320px viewport), and SHALL NOT rely on `overflow: visible` or on clipping to hide overflow.

This applies to `ScaaRadarChart`, `BrewTimeline`, `StarRating`, `IntensityDots` and any chart added
later (for example the F17 admin analytics and F03 profile stats charts).

#### Scenario: No chart relies on overflow visible

- **WHEN** the chart guard test scans `ScaaRadarChart.tsx`, `BrewTimeline.tsx`, `StarRating.tsx`, `IntensityDots.tsx` and every file under `apps/web/src/components/charts/` (if present)
- **THEN** it finds no `overflow: 'visible'`, `overflow-visible` or `overflow="visible"` on any chart `<svg>`

#### Scenario: Radar labels fit at the narrowest container

- **WHEN** the radar chart is rendered with the longest en and tr category labels in a 222px container
- **THEN** every label's computed bounding box lies inside the SVG viewBox and the chart's rendered width is no wider than the container

#### Scenario: Timeline labels fit at the narrowest container

- **WHEN** the brew timeline lays out a 12-hour cold brew with a 30-second pre-infusion at a 200px chart width
- **THEN** every axis tick label and every visible phase label lies within `[0, 200]` px horizontally

### Requirement: Charts scale responsively with uniformly scaled text

Charts SHALL size themselves to their container (`width: 100%` up to a declared maximum width, height derived from the viewBox aspect ratio or a fixed CSS height) and SHALL never scale text non-uniformly: no `<text>` element may appear inside an SVG that uses `preserveAspectRatio="none"`, stretched strokes SHALL use `vector-effect="non-scaling-stroke"`, and text that must not scale SHALL be HTML positioned over the chart.

Chart layout that decides what is drawn (viewBox, tick values, label wrapping) SHALL be computed by
pure functions with no DOM measurement (`getBBox`, `getComputedTextLength`, layout reads), so first
paint, print and jsdom tests produce the same in-bounds layout. A component MAY refine optional
label visibility using a measured container width, but its initial render SHALL use the 200px
minimum width.

#### Scenario: No text in a stretched SVG

- **WHEN** the chart guard test scans chart component sources for an `<svg` element with `preserveAspectRatio="none"`
- **THEN** that SVG element contains no `<text>` or `<tspan>` children

#### Scenario: Stretched strokes keep their width

- **WHEN** `BrewTimeline` renders at a 222px or 670px width
- **THEN** every stroked `<path>` and `<line>` inside its `preserveAspectRatio="none"` SVG has `vector-effect="non-scaling-stroke"`

#### Scenario: Radar label size stays readable across widths

- **WHEN** the radar layout is computed for the en and tr labels
- **THEN** `fontSize × 222 / viewBox.width` is at least 10 and `fontSize × maxWidthPx / viewBox.width` is at most 14, so rendered labels are 10–14px at every supported width

#### Scenario: Chart is a single responsive instance

- **WHEN** `TastingNotesSection` renders a resolvable taste profile
- **THEN** exactly one `ScaaRadarChart` is in the DOM (no CSS-toggled duplicate sizes), and its root `<svg>` has `width="100%"` and an inline `max-width`

### Requirement: SCAA radar chart reserves label space and translates categories

The SCAA radar chart SHALL compute its viewBox from the plot and the estimated label boxes (via `fitViewBox`) so that all nine category labels, wrapped with `wrapLabel` and rendered as `<tspan>` lines, lie inside the viewBox, and it SHALL render each category name through `t('taste.category.<slug>')` with keys present in both `en.json` and `tr.json`.

The layout SHALL be computed by a pure, tested function (for example `computeRadarLayout` in
`apps/web/src/utils/radar-layout.ts`). Label anchors SHALL be chosen by side: `start` on the right,
`end` on the left, `middle` at the top and bottom. Top labels SHALL sit above their anchor, bottom
labels below it, and side labels SHALL be vertically centred. The `TastingNotesSection` chip-group
headings SHALL use the same translated category names when a root name maps to one of the nine SCAA
categories, and SHALL fall back to the raw name otherwise. `TastingNotesSection` SHALL lay the chart
and chips side by side only when the card is wide enough (a container query on the card, for
example `@min-[520px]`), and stack them otherwise.

#### Scenario: Turkish users see Turkish axis labels

- **WHEN** a recipe with taste notes renders under the tr locale
- **THEN** the radar labels read the tr values of `taste.category.*` (for example "Yeşil/Bitkisel" split into "Yeşil/" and "Bitkisel"), and no English category name is rendered

#### Scenario: Geometry holds for long labels

- **WHEN** `computeRadarLayout` runs with the en labels, the tr labels, and a synthetic set in which every label is a 24-character single word
- **THEN** every label line's box (from `estimateTextWidth`) lies inside the returned viewBox, and no two label boxes overlap

#### Scenario: Chips stack in a narrow card

- **WHEN** the tasting notes card is narrower than the container-query threshold (for example the 422px md main column)
- **THEN** the chart renders above the chip groups instead of beside them

### Requirement: Radar values are sanitized and degenerate profiles stay visible

The radar chart SHALL clamp every category value to `[0, effectiveMax]` (with `NaN`, negative and `±Infinity` values treated as 0), SHALL derive `effectiveMax` as a finite number of at least 1 (the larger of a caller-supplied finite `maxValue` and 1, otherwise the larger of the sanitized data maximum and 3), and SHALL never place a data vertex outside the outer guide polygon.

When every value is 0, the chart SHALL render the guides and labels without a data polygon. When
only one or two categories are non-zero, the chart SHALL draw a visible vertex marker (a circle of
at least 3 viewBox units) at each non-zero vertex so the profile is not a hairline.

#### Scenario: NaN does not blank the chart

- **WHEN** `categoryValues` contains `{ Fruity: NaN, Sweet: 2 }`
- **THEN** the data polygon renders with finite coordinates, Fruity is plotted at the centre, and Sweet is plotted at 2/3 of the radius (effectiveMax 3)

#### Scenario: Caller max smaller than the data is clamped

- **WHEN** `maxValue={1}` is passed with `{ Floral: 9 }`
- **THEN** the Floral vertex lies exactly on the outer guide polygon, not outside it

#### Scenario: Empty profile

- **WHEN** all nine values are 0
- **THEN** no data polygon is rendered and the guides and labels still render inside the viewBox

#### Scenario: Single-category profile

- **WHEN** only `{ Roasted: 1 }` is non-zero
- **THEN** one vertex marker is rendered on the Roasted axis, inside the outer guide polygon

### Requirement: Brew timeline phase geometry is clamped

The brew timeline SHALL derive its phase model from sanitized inputs via a pure, tested function (for example `computeTimelineModel` in `apps/web/src/utils/brew-timeline.ts`) such that every phase width lies in `[0, 100]` percent and the phase widths sum to 100 percent. It SHALL render nothing when the total extraction time is missing, non-finite or ≤ 0. It SHALL render a single extraction phase covering the full total, without a split, when the pre-infusion time is missing, non-finite, ≤ 0, or ≥ the total.

An inconsistent pre-infusion (≥ total) SHALL be reported once per mount through the web logger
(`createLogger('BrewTimeline')`, level `warn`, numeric values only, no PII) and SHALL NOT produce
negative durations in any label or accessible name.

#### Scenario: Pre-infusion longer than the total

- **WHEN** `BrewTimeline` receives `extractionTimeSeconds={28}` and `preInfusionTimeSeconds={30}`
- **THEN** it renders one extraction phase at 100% width labelled with the full 28 seconds, no width style is negative or above 100%, no label contains a minus sign, and one `warn` log is emitted

#### Scenario: Zero or non-finite total

- **WHEN** `extractionTimeSeconds` is `0`, `-5` or `NaN`
- **THEN** `BrewTimeline` renders nothing, and no `NaN%` style is produced

#### Scenario: Normal split

- **WHEN** `extractionTimeSeconds={28}` and `preInfusionTimeSeconds={5}`
- **THEN** the phases are 17.857…% and 82.142…% wide (summing to 100%) and are labelled 5s and 23s

### Requirement: Brew timeline labels are HTML confined to their phase

The brew timeline SHALL render phase titles and phase durations as HTML elements positioned over the chart, each confined to its own phase box. A label part SHALL be shown inside its phase only when its estimated width plus padding fits the phase's pixel width, and any phase duration that cannot be shown inside its phase SHALL appear in a caption row directly below the chart, so every phase duration is always visible.

Phase-label visibility SHALL be computed by a pure function (for example `layoutPhaseLabels(model,
widthPx, locale)`). The component SHALL pass the measured chart width when available (a
`ResizeObserver`-based `useElementWidth` hook in `apps/web/src/utils/useElementWidth.ts`) and the
200px minimum width otherwise, including in jsdom and before the first measurement. The timeline
header row (title and flow rate) SHALL wrap as whole items (`flex-wrap`) instead of breaking
phrases mid-word.

#### Scenario: Narrow pre-infusion phase

- **WHEN** a 28-second shot with a 3-second pre-infusion renders in a 222px chart
- **THEN** the pre-infusion phase shows neither title nor value inside the chart, the caption row below the chart shows the localized pre-infusion title and "3s", and the extraction phase shows its title and "25s"

#### Scenario: Turkish phase labels fit or move

- **WHEN** the same recipe renders under the tr locale at 670px
- **THEN** each visible phase label lies within its phase box, and any hidden duration appears in the caption row as "3 sn" or "25 sn"

### Requirement: Duration axes use bounded nice ticks

Duration axes SHALL generate ticks with `durationTicks`, which picks the smallest step from the time ladder (1, 2, 5, 10, 15, 30 seconds; 1, 2, 5, 10, 15, 30 minutes; 1, 2, 3, 6, 12 hours; 1 day; then days × {2, 5, 10, …}) for which the labels fit. It SHALL return at most 8 ticks, always including 0 and the total, with no two labels overlapping (6px minimum gap) and none outside the axis at the 200px minimum width. It SHALL do so for every total from 1 second up to 2,147,483,647 seconds (the Postgres `integer` maximum of `extraction_time_seconds`), in time independent of the total.

The first tick label SHALL be left-anchored, the last right-anchored, and the others centred. Tick
labels SHALL use the unit of the step (`{n}s`, `{n}m`, `{n}h` in en; `{n} sn`, `{n} dk`, `{n} sa` in
tr). The end label SHALL use the compact `formatDuration` of the total. When the last nice tick
collides with the end label, that nice tick SHALL be dropped. The `BrewTimeline` axis SHALL be
computed at the 200px minimum width (ticks that fit there fit at every wider width) and SHALL use
`--text-secondary` for tick text.

#### Scenario: Twelve-hour cold brew

- **WHEN** the seeded `blue-mountain-cold-brew` recipe (`extractionTimeSeconds: 43200`) renders
- **THEN** the axis shows at most 8 labels (for example `0, 2h, 4h, 6h, 8h, 12h` in en and `0, 2 sa, … 12 sa` in tr) and no label overlaps another

#### Scenario: Near-duplicate end marker

- **WHEN** the total is 27 seconds
- **THEN** the axis does not show both 25s and 27s overlapping: either the gap is at least 6px at 200px or the 25s tick is dropped

#### Scenario: Extreme totals stay cheap

- **WHEN** `durationTicks(2147483647, …)` and `durationTicks(1, …)` are called
- **THEN** each returns between 2 and 8 ticks in under 5 ms, and the result includes 0 and the total

#### Scenario: Property-based guarantee

- **WHEN** a fast-check property runs over integer totals from 1 to 86,400, plus 172,800, 10^6 and 2,147,483,647, for en and tr at widths 200, 222, 277, 507 and 670
- **THEN** every result has 2–8 ascending ticks, includes 0 and the total, and has no overlapping or out-of-axis label boxes

### Requirement: Durations and derived metrics render through shared locale-aware formatters

Every user-visible duration, brew ratio, flow rate, average rating and stat-tile number in chart and stat displays SHALL be formatted by shared helpers in `apps/web/src/utils/format.ts` that take the active `I18nContext` locale.

- `formatDuration(seconds, locale)`: compact form with at most two units (`45s`, `4m 30s`,
  `12h`, `1h 30m` in en; `45 sn`, `4 dk 30 sn`, `12 sa` in tr), with unit text from the
  `chart.duration.*` i18n keys.
- `formatDecimal(value, locale, maxFractionDigits)`: `Intl.NumberFormat`-based, with the locale
  decimal separator.
- `formatFlowRate(value, locale)`: a flow rate in ml/s, formatted as
  `formatDecimal(value, locale, 1)` except that a positive rate that would round to 0 at one
  decimal keeps two significant digits (500 ml over 12 h: `0.012` in en, `0,012` in tr), so a
  real flow never reads `0 ml/s`. Zero, negative and non-finite input format as `formatDecimal`
  does.
- The existing `formatNumber` for integer grouping.

Call sites:

- `stat-cards.ts`: time via `formatDuration`; ratio as `1:` + `formatDecimal(ratio, 1)`;
  extraction yield with one decimal.
- `BrewTimeline`: phase values, end tick and flow rate (`formatFlowRate(flowRate, locale)` +
  `ml/s`).
- `RecipeComparePage`: durations and ratio. `VersionDiffPage`: durations, ratio and flow rate
  (`formatFlowRate`).
- `RecipeVersionsPage`: extraction time.
- `RecipeBrewStats`: average rating.
- `StarRating`: numeric label.
- `AdminDashboard`: stat tiles via `formatNumber`.

No stat value SHALL overflow its stat card at the md and lg grid widths.

#### Scenario: Long brew time in a stat card

- **WHEN** `buildStatCards` runs for `extractionTimeSeconds: 43200` under en and tr
- **THEN** the time card value is `12h` (en) and `12 sa` (tr), not `43200s`

#### Scenario: Unrounded ratio and flow rate

- **WHEN** a version has `brewRatio: 2.2222223` and `flowRate: 1.2857143`
- **THEN** the ratio stat card shows `1:2.2` (en) or `1:2,2` (tr), the timeline header shows `1.3 ml/s` (en) or `1,3 ml/s` (tr), and the compare page shows the same rounded ratio

#### Scenario: A slow positive flow rate never shows as zero

- **WHEN** a version brews 500 ml over 12 hours (`extractionTimeSeconds: 43200`, `flowRate: 500 / 43200`, about 0.0116)
- **THEN** the timeline header and the version diff show `0.012 ml/s` (en) or `0,012 ml/s` (tr), not `0 ml/s`

#### Scenario: Ratio card fits at md width

- **WHEN** the stat-card geometry test estimates the widest formatted value for each card at 24px bold
- **THEN** it is at most 100px, the inner card width at the md 5-column grid

### Requirement: Value-driven sizes and meters are clamped

Every style or count driven by a data value in a chart, meter or rating display (percentage `width`/`height`/`left`, filled dot or star counts) SHALL be computed through the shared `clamp`/`clampPct` helpers, so rendered percentages lie in `[0, 100]`, counts lie in `[0, max]`, and accessible labels report the clamped value.

`IntensityDots` SHALL round and clamp `intensity` to an integer in `[0, 3]` for both the filled-dot
count and its `a11y.intensity` label.

#### Scenario: Out-of-range intensity

- **WHEN** `IntensityDots` receives `intensity={5}`, `intensity={NaN}` and `intensity={2.4}`
- **THEN** it fills 3, 0 and 2 dots and announces "Intensity 3 of 3", "Intensity 0 of 3" and "Intensity 2 of 3"

#### Scenario: Timeline widths never leave range

- **WHEN** `BrewTimeline` renders any combination of `extractionTimeSeconds` and `preInfusionTimeSeconds` drawn by fast-check from integers in `[-10, 100000]` plus `NaN`
- **THEN** every inline `width` and `left` percentage in its output parses to a finite number in `[0, 100]`

### Requirement: Interactive star rating is keyboard operable with whole-star keys

The interactive `StarRating` SHALL be a single focusable control (`role="slider"`, `aria-valuemin="0"`, `aria-valuemax="10"`, `aria-valuenow` with 0 meaning not rated as in the WAI-ARIA APG rating slider, and a localized `aria-valuetext` such as "3.5 of 5 stars" or "Not rated"). ArrowRight and ArrowUp SHALL raise the pending value by one whole star and ArrowLeft and ArrowDown SHALL lower it by one whole star. Shift with an arrow key SHALL change it by a half star, digit keys 1–5 SHALL select that whole star, Home and End SHALL select ½ and 5 stars, and Enter or Space SHALL commit the pending value through `onRate`. Keyboard input SHALL never commit a half-star value unless the user chose it with Shift.

More behaviour:

- Escape reverts the pending value to the saved value.
- Moving focus away with an uncommitted pending value commits it once.
- Pointer hover previews, and a click commits the half or whole star under the pointer (left half
  = half star), as today.
- The key bindings are described to assistive technology through `aria-describedby`, pointing at a
  localized hint (`a11y.rating.keyboardHint`).
- While a submission is in flight, the control stays focusable with `aria-disabled="true"` instead
  of the `disabled` attribute, so focus is not lost.
- Filled stars use a `--rating-star` theme token defined for the light, dark and coffee themes.
- The control's minimum width fits the 174px md sidebar card, or wraps its numeric label below the
  stars.

#### Scenario: Keyboard selects whole stars

- **WHEN** the rating control is focused with no saved value and the user presses ArrowRight three times and then Enter
- **THEN** `onRate` is called once with `6` (3 stars), never with an odd value

#### Scenario: Half stars via Shift

- **WHEN** the user presses ArrowRight twice, then Shift+ArrowRight, then Enter
- **THEN** `onRate` is called once with `5` (2.5 stars) and `aria-valuetext` read "2.5 of 5 stars" before the commit

#### Scenario: Focus survives submission

- **WHEN** a rating is committed and the parent sets the busy state while the request is in flight
- **THEN** the slider keeps keyboard focus, exposes `aria-disabled="true"`, and ignores key presses until the busy state clears

#### Scenario: Pointer half-star still works

- **WHEN** the user clicks the left half of the third star
- **THEN** `onRate` is called with `5`

### Requirement: Read-only rating renders as a single labelled image

A read-only `StarRating` SHALL render as one element with `role="img"` and a localized accessible name stating the value out of five stars (`a11y.rating.value`, for example "Rated 3.5 out of 5 stars") or "Not rated" (`a11y.rating.notRated`), with no buttons, no tab stops and `aria-hidden` star graphics.

The displayed value SHALL be the input sanitized and clamped to `[1, 10]` and rounded to the nearest
integer (half-star granularity). The star fill and the numeric label SHALL derive from that same
rounded value, and the numeric label SHALL use the locale decimal separator. `null`, `NaN` and
values ≤ 0 SHALL display as not rated.

#### Scenario: Read-only community average

- **WHEN** `StarRating` renders with `value={7}` and `interactive={false}` under en and tr
- **THEN** there are no buttons in its subtree, a single `role="img"` element is named "Rated 3.5 out of 5 stars" (en) or uses "3,5" (tr), and the visible label shows `3.5` or `3,5`

#### Scenario: Fill and label agree for fractional input

- **WHEN** `value={7.9}` is displayed read-only
- **THEN** four full stars are filled and the label reads 4, never 3.5 stars next to a "4.0" label

#### Scenario: Out-of-range input

- **WHEN** `value` is `11`, `-1` or `NaN`
- **THEN** the display shows 5 stars (named "Rated 5 out of 5 stars") for 11, and "Not rated" for -1 and NaN, and no label shows `5.5`, a minus sign or `NaN`

### Requirement: Ratings use one scale wherever a star glyph appears

Every rating shown with a star glyph SHALL use the five-star scale (the stored 1–10 value divided by 2, formatted with `formatDecimal` to at most one fraction digit), and ratings shown on the ten-point scale SHALL be written as `n/10` without a star glyph.

This covers the recipe card rating strip (`RecipeCard.tsx`), the `StarRating` numeric label, the
brew-log card and stats, and the compare page.

#### Scenario: Recipe card rating

- **WHEN** `RecipeCard` renders a version with `rating: 4`
- **THEN** the strip shows `★ 2` (not `★ 4`), and a version with `rating: 7` shows `★ 3.5` (en) or `★ 3,5` (tr)

#### Scenario: Ten-point displays carry no star

- **WHEN** a brew-log card shows `personalRating: 8`
- **THEN** it reads `8/10` and contains no `★`

### Requirement: Chart colours come from theme tokens and meet contrast minimums

Chart and rating marks and text SHALL take every colour from theme tokens defined for the light, dark and coffee themes in `apps/web/src/styles/globals.css`, with no hex literals in chart components. Chart text (titles, labels, ticks, values and counts) SHALL meet 4.5:1, and data marks and filled rating stars SHALL meet 3:1, against every background the text or mark is drawn on in every theme: the card background (`--bg-secondary`) for most chart text, and for the brew timeline's in-chart phase labels the pre-infusion zone and the accent gradient as well. Guides and gridlines are decorative and exempt.

A `--rating-star` token SHALL be added (for example light `#b45309`, dark `#f59e0b`, coffee
`#fbbf24`, measured at 4.60, 7.06 and 7.11:1 against `--bg-secondary`). Timeline tick labels SHALL
use `--text-secondary` (6.99, 6.99 and 7.59:1 against `--bg-secondary`).
Chart components SHALL NOT use `--text-tertiary` as a text colour (it is reserved for page and card
surfaces, see `web-shared-components` "Theme text tokens meet WCAG AA on the surfaces they are drawn
on", and chart text sits on in-chart fills); the timeline header title and the rating vote count use
`--text-secondary`.

The brew timeline's phase titles and values SHALL use `--text-primary`, and the top opacity of the
accent gradient under its curve (`TIMELINE_GRADIENT_OPACITY.top` in
`apps/web/src/utils/brew-timeline.ts`) SHALL be at most 0.4. Against the worst of those backgrounds
(`--accent-primary` at that opacity over `--bg-tertiary`), `--text-primary` measures 7.65 (light),
5.04 (dark) and 4.73:1 (coffee), while `--text-secondary` measures only 3.34, 2.43 and 3.26:1.

#### Scenario: No hardcoded chart colours

- **WHEN** the chart guard test scans `ScaaRadarChart.tsx`, `BrewTimeline.tsx`, `StarRating.tsx` and `IntensityDots.tsx` for `#[0-9a-fA-F]{3,8}` colour literals and for `--text-tertiary` used as a text colour
- **THEN** it finds none

#### Scenario: Token contrast is verified

- **WHEN** the contrast unit test parses the `--rating-star`, `--text-secondary`, `--accent-primary` and `--bg-secondary` values for each theme block in `globals.css`
- **THEN** every chart text pair is at least 4.5:1 and every data-mark and star pair is at least 3:1

#### Scenario: Timeline phase labels are verified against their real backgrounds

- **WHEN** the contrast unit test composites `--accent-primary` at `TIMELINE_GRADIENT_OPACITY.top` over `--bg-tertiary` and over `--bg-secondary` for each theme
- **THEN** `--text-primary` is at least 4.5:1 against both composites and against plain `--bg-tertiary` and `--bg-secondary`

### Requirement: Charts expose accessible names with their values

Every chart SHALL expose exactly one element with `role="img"` whose localized accessible name includes the plotted values, and all decorative SVG internals SHALL be `aria-hidden="true"`.

- The radar name lists each non-zero category, using its translated name, with its value
  (`a11y.scaaRadarChartValues`). When there are no values it uses `a11y.scaaRadarChartEmpty`.
- The timeline name states the formatted phase durations (`a11y.brewTimeline` and
  `a11y.brewTimelineNoPreInfusion`, whose placeholders receive `formatDuration` output, so the
  hardcoded `s`/`sn` suffixes are removed from both locales).
- `IntensityDots` and the read-only `StarRating` follow their own requirements.

#### Scenario: Radar name lists values

- **WHEN** the radar renders `{ Fruity: 6, Sweet: 3 }` under en
- **THEN** its single `role="img"` element's name contains "Fruity 6" and "Sweet 3" and omits the zero categories, and under tr it contains "Meyvemsi 6"

#### Scenario: Timeline name uses formatted durations

- **WHEN** the timeline renders a 43200-second brew with no pre-infusion under en
- **THEN** its accessible name contains "12h" and not "43200s"

### Requirement: Chart geometry is regression-tested and visually checked

The web test suite SHALL include geometry tests that compute every chart label's bounding box with the shared `estimateTextWidth` helper and assert that each box lies inside its viewBox or axis and does not overlap a sibling label, for the en and tr labels and for edge inputs (0, 1 and 2 non-zero radar categories; `NaN`, negative, over-max and int32-maximum values; pre-infusion ≥ total), at widths 200, 222, 277, 507 and 670px. The change SHALL be verified against a manual visual checklist before merge.

The checklist SHALL cover:

- viewports 320, 375, 768, 1024 and 1280px;
- the light, dark and coffee themes;
- the en and tr locales;
- the seeded recipes `blue-mountain-cold-brew` (43,200s) and the espresso recipes with
  pre-infusion (28s/5s and 27s/6s);
- a recipe using all nine categories and one using a single category;
- print preview;
- keyboard-only rating;
- a VoiceOver pass over the read-only rating and both charts.

#### Scenario: A regression that pushes a label out fails the build

- **WHEN** a change raises the radar label font or removes the label padding so that "Sour/Fermented" crosses the viewBox edge
- **THEN** the radar geometry test fails and names the offending label and the overflow in px

#### Scenario: Visual checklist is completed

- **WHEN** the wave-6 change is prepared for merge
- **THEN** every visual checklist item in the change's tasks is checked off, with any deviation recorded in the PR description

