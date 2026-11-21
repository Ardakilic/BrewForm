/**
 * Shared chart primitives for the `chart-rendering` capability: a few hundred
 * lines of pure, tested code instead of a charting dependency.
 *
 * Every chart, meter and rating display in the web app uses this module, and
 * these rules apply to all of them:
 *
 * 1. **In bounds.** Every mark and label stays inside its own drawing area (the
 *    SVG viewBox, or the chart box for HTML labels) for every valid input at
 *    every container width ≥ {@link MIN_CHART_WIDTH_PX}. Never rely on
 *    `overflow: visible` or clipping to hide overflow.
 * 2. **No `<text>` in stretched SVGs.** An SVG with `preserveAspectRatio="none"`
 *    holds shapes only (strokes use `vector-effect="non-scaling-stroke"`);
 *    text that must not scale is HTML positioned over the chart. Otherwise use
 *    a viewBox fitted with {@link fitViewBox} and uniform scaling.
 * 3. **Sanitize via `clamp`.** Every data-driven size, position or count goes
 *    through {@link clamp}/{@link clampPct}/{@link sanitizeNumber}/{@link safeRatio},
 *    so `NaN`, `Infinity` and out-of-range values never reach a style.
 * 4. **Tokens only.** Colours come from theme tokens in `styles/globals.css`
 *    (`var(--…)`), never hex literals; chart text meets 4.5:1 and marks 3:1
 *    against `--bg-secondary` (see `contrast.test.ts`).
 * 5. **Geometry tests required.** Layout is computed by pure functions (no
 *    `getBBox`/DOM measurement) and every chart ships tests that check each
 *    label box with {@link estimateTextWidth} against its bounds and siblings
 *    at 200, 222, 277, 507 and 670px, for en and tr.
 * 6. **Reuse.** New charts (the F17 admin analytics and F03 profile stats
 *    charts) import these helpers instead of reimplementing them; a shared
 *    `<ChartFrame>` waits until a third chart exists.
 *
 * @module
 */

export {
  type Box,
  DEFAULT_LINE_HEIGHT,
  fitViewBox,
  isInside,
  type LabelBoxInput,
  labelBox,
  overlaps,
  type TextAnchor,
  unionBox,
  type VerticalAlign,
} from './layout.ts';
export { clamp, clampPct, safeRatio, sanitizeNumber } from './scale.ts';
export { estimateTextWidth, type TextMeasureOptions, wrapLabel } from './text.ts';
export {
  DEFAULT_MAX_TICKS,
  DEFAULT_TICK_FONT_PX,
  DEFAULT_TICK_GAP_PX,
  type DurationTick,
  type DurationTickOptions,
  durationTicks,
  MIN_CHART_WIDTH_PX,
  niceTicks,
} from './ticks.ts';
