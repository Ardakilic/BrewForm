/**
 * Pure layout for the SCAA radar chart: plot geometry, sanitized values,
 * wrapped labels and a viewBox fitted around the plot plus every label box.
 *
 * The chart renders this layout in an SVG at `width="100%"` up to
 * `maxWidthPx`, so text scales uniformly with the viewBox: a font of 18 units
 * renders at about 10px at the narrowest 222px container and about 13px at
 * 280px. No DOM measurement is involved, so first paint, print and jsdom tests
 * see the same in-bounds layout.
 */

import {
  type Box,
  clamp,
  DEFAULT_LINE_HEIGHT,
  fitViewBox,
  labelBox,
  sanitizeNumber,
  type TextAnchor,
  unionBox,
  type VerticalAlign,
  wrapLabel,
} from './chart/index.ts';

/** Plot radius in viewBox units. */
export const RADAR_RADIUS = 100;
/** Distance of the label anchor beyond the plot radius. */
const LABEL_OFFSET = 10;
/** Maximum line width (viewBox units) before a label wraps at `/` or whitespace. */
const LABEL_WRAP_UNITS = 100;
/** Margin around the union of plot and labels. */
const VIEWBOX_MARGIN = 4;
/** Radius of the vertex markers drawn for 1–2 non-zero categories. */
const MARKER_RADIUS = 4;
/** Guide polygons at a third, two thirds and the full radius. */
const GUIDE_FRACTIONS = [1 / 3, 2 / 3, 1] as const;
/** Offset from a line's vertical centre to its alphabetic baseline, in em. */
const BASELINE_SHIFT_EM = 0.35;
/** |cos| below which an axis counts as top/bottom (middle-anchored). */
const VERTICAL_AXIS_COS = 0.1;

/** A point in viewBox units (the plot centre is the origin). */
export interface Point {
  x: number;
  y: number;
}

/** One positioned category label. */
export interface RadarLabelLayout {
  /** The full label text. */
  text: string;
  /** The wrapped lines (rendered as `<tspan>`s). */
  lines: string[];
  /** Anchor x. */
  x: number;
  /** Anchor y. */
  y: number;
  /** SVG `text-anchor`. */
  anchor: TextAnchor;
  /** Which box edge the anchor sits on vertically. */
  vAlign: VerticalAlign;
  /** Alphabetic baseline y of each line. */
  lineYs: number[];
  /** The label's estimated bounding box. */
  box: Box;
}

/** Input for {@link computeRadarLayout}. */
export interface RadarLayoutInput {
  /** One translated label per axis, clockwise from the top. */
  labels: readonly string[];
  /** One value per axis (anything non-finite or negative is treated as 0). */
  values: readonly unknown[];
  /** Optional scale maximum; the effective maximum is at least 1. */
  maxValue?: number;
  /** Label font size in viewBox units (default 18). */
  fontSize?: number;
  /** Maximum rendered width in px (default 280). */
  maxWidthPx?: number;
}

/** Output of {@link computeRadarLayout}. */
export interface RadarLayout {
  /** The fitted viewBox (contains the plot, markers and every label). */
  viewBox: Box;
  /** Plot radius in viewBox units. */
  radius: number;
  /** Vertex marker radius in viewBox units. */
  markerRadius: number;
  /** Label font size in viewBox units. */
  fontSize: number;
  /** Line height multiplier for wrapped labels. */
  lineHeight: number;
  /** Maximum rendered width in px. */
  maxWidthPx: number;
  /** The scale maximum used for every axis. */
  effectiveMax: number;
  /** Sanitized, clamped values in `[0, effectiveMax]`. */
  values: number[];
  /** Outer end of each axis line. */
  axes: Point[];
  /** `points` strings of the guide polygons (1/3, 2/3, full radius). */
  guides: string[];
  /** Data vertex of each axis. */
  dataPoints: Point[];
  /** `points` of the data polygon, or `null` when every value is 0. */
  polygon: string | null;
  /** Vertex markers, present only when 1 or 2 values are non-zero. */
  markers: (Point & { r: number })[];
  /** One positioned label per axis. */
  labels: RadarLabelLayout[];
}

/** Angle of axis `i` of `n`, clockwise from the top. */
function axisAngle(i: number, n: number): number {
  return ((2 * Math.PI) / n) * i - Math.PI / 2;
}

/** Point on axis `i` of `n` at distance `r` from the centre. */
function axisPoint(i: number, n: number, r: number): Point {
  const angle = axisAngle(i, n);
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

/** Serializes points for an SVG `points` attribute. */
function toPoints(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}

/**
 * Derives the scale maximum: a finite caller `maxValue` (at least 1), else the
 * sanitized data maximum (at least 3).
 */
function deriveEffectiveMax(sanitized: number[], maxValue: number | undefined): number {
  if (typeof maxValue === 'number' && Number.isFinite(maxValue)) return Math.max(maxValue, 1);
  return Math.max(...sanitized, 3);
}

/**
 * Chooses the label alignment by side: `start` on the right, `end` on the
 * left, `middle` at the top and bottom; top labels sit above their anchor,
 * bottom labels below it and side labels are vertically centred.
 */
function alignFor(angle: number): { anchor: TextAnchor; vAlign: VerticalAlign } {
  const cos = Math.cos(angle);
  if (Math.abs(cos) < VERTICAL_AXIS_COS) {
    return { anchor: 'middle', vAlign: Math.sin(angle) < 0 ? 'bottom' : 'top' };
  }
  return { anchor: cos > 0 ? 'start' : 'end', vAlign: 'middle' };
}

/**
 * Computes the complete radar layout.
 *
 * Values are sanitized (`NaN`, negative and `±Infinity` → 0) and clamped to
 * `[0, effectiveMax]`, so no vertex leaves the outer guide. Labels sit at
 * `radius + 10`, wrap after `/` (and at whitespace) once wider than 100 units,
 * and are anchored by side. The viewBox is `fitViewBox(union(plot, labels), 4)`.
 *
 * @param input - Labels, values and sizing.
 * @returns Everything the chart component renders.
 */
export function computeRadarLayout(input: RadarLayoutInput): RadarLayout {
  const n = input.labels.length;
  const fontSize = input.fontSize ?? 18;
  const maxWidthPx = input.maxWidthPx ?? 280;
  const lineHeight = DEFAULT_LINE_HEIGHT;
  const lineH = fontSize * lineHeight;

  const sanitized = Array.from({ length: n }, (_, i) =>
    Math.max(0, sanitizeNumber(input.values[i])),
  );
  const effectiveMax = deriveEffectiveMax(sanitized, input.maxValue);
  const values = sanitized.map((v) => clamp(v, 0, effectiveMax));

  const axes = Array.from({ length: n }, (_, i) => axisPoint(i, n, RADAR_RADIUS));
  const guides = GUIDE_FRACTIONS.map((f) =>
    toPoints(Array.from({ length: n }, (_, i) => axisPoint(i, n, RADAR_RADIUS * f))),
  );
  const dataPoints = values.map((v, i) => axisPoint(i, n, (v / effectiveMax) * RADAR_RADIUS));
  const nonZero = values.map((v, i) => ({ v, i })).filter(({ v }) => v > 0);
  const polygon = nonZero.length > 0 ? toPoints(dataPoints) : null;
  const markers =
    nonZero.length > 0 && nonZero.length <= 2
      ? nonZero.map(({ i }) => ({ ...dataPoints[i], r: MARKER_RADIUS }))
      : [];

  const labels = input.labels.map((text, i): RadarLabelLayout => {
    const angle = axisAngle(i, n);
    const anchorPoint = axisPoint(i, n, RADAR_RADIUS + LABEL_OFFSET);
    const { anchor, vAlign } = alignFor(angle);
    const lines = wrapLabel(text, LABEL_WRAP_UNITS, fontSize);
    const box = labelBox({ ...anchorPoint, lines, fontSize, anchor, vAlign, lineHeight });
    const lineYs = lines.map((_, li) => box.y + (li + 0.5) * lineH + BASELINE_SHIFT_EM * fontSize);
    return { text, lines, ...anchorPoint, anchor, vAlign, lineYs, box };
  });

  const plotExtent = RADAR_RADIUS + MARKER_RADIUS;
  const plotBox: Box = {
    x: -plotExtent,
    y: -plotExtent,
    width: 2 * plotExtent,
    height: 2 * plotExtent,
  };
  const viewBox = fitViewBox(unionBox([plotBox, ...labels.map((l) => l.box)]), VIEWBOX_MARGIN);

  return {
    viewBox,
    radius: RADAR_RADIUS,
    markerRadius: MARKER_RADIUS,
    fontSize,
    lineHeight,
    maxWidthPx,
    effectiveMax,
    values,
    axes,
    guides,
    dataPoints,
    polygon,
    markers,
    labels,
  };
}
