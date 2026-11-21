## MODIFIED Requirements

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
