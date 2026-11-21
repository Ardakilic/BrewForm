/**
 * Axis-aligned box geometry for chart layout: label boxes, unions,
 * containment and overlap tests, and viewBox fitting.
 *
 * Boxes are in whatever unit the caller works in (viewBox units for SVG, px
 * for HTML overlays); the helpers never read the DOM.
 */

import { estimateTextWidth } from './text.ts';

/** An axis-aligned rectangle: top-left corner plus size. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Horizontal anchor of a label, matching SVG `text-anchor`. */
export type TextAnchor = 'start' | 'middle' | 'end';

/**
 * Which edge of the label box the anchor point sits on vertically:
 * `top` = the label hangs below the anchor, `bottom` = it sits above it,
 * `middle` = it is vertically centred on it.
 */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Input for {@link labelBox}. */
export interface LabelBoxInput {
  /** Anchor x. */
  x: number;
  /** Anchor y. */
  y: number;
  /** The label lines (from `wrapLabel`). */
  lines: readonly string[];
  /** Font size in the box unit. */
  fontSize: number;
  /** Horizontal anchor (default `start`). */
  anchor?: TextAnchor;
  /** Vertical alignment of the anchor on the box (default `top`). */
  vAlign?: VerticalAlign;
  /** Line height as a multiple of `fontSize` (default `1.2`). */
  lineHeight?: number;
  /** Semibold/bold text (passed to the width estimate). */
  bold?: boolean;
  /** Letter-spacing in the box unit (passed to the width estimate). */
  letterSpacingPx?: number;
}

/** Default line height multiplier for multi-line labels. */
export const DEFAULT_LINE_HEIGHT = 1.2;

/**
 * Computes the estimated bounding box of a (possibly multi-line) label.
 *
 * Width is the widest line's `estimateTextWidth`; height is
 * `lines.length × fontSize × lineHeight`. The anchor point is placed on the box
 * according to `anchor` (start/middle/end) and `vAlign` (top/middle/bottom).
 *
 * @param input - Anchor, lines, font size and alignment.
 * @returns The label's box (an empty box at the anchor for no lines).
 */
export function labelBox(input: LabelBoxInput): Box {
  const { x, y, lines, fontSize } = input;
  const anchor = input.anchor ?? 'start';
  const vAlign = input.vAlign ?? 'top';
  const lineHeight = input.lineHeight ?? DEFAULT_LINE_HEIGHT;
  if (lines.length === 0) return { x, y, width: 0, height: 0 };

  const measure = { bold: input.bold, letterSpacingPx: input.letterSpacingPx };
  const width = Math.max(...lines.map((line) => estimateTextWidth(line, fontSize, measure)));
  const height = lines.length * fontSize * lineHeight;

  const left = anchor === 'start' ? x : anchor === 'middle' ? x - width / 2 : x - width;
  const top = vAlign === 'top' ? y : vAlign === 'middle' ? y - height / 2 : y - height;
  return { x: left, y: top, width, height };
}

/**
 * Returns the smallest box containing every box in `boxes`.
 *
 * @param boxes - The boxes to union.
 * @returns Their bounding box, or an empty box at the origin for no boxes.
 */
export function unionBox(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Tests whether `inner` lies entirely inside `outer` (touching edges count as inside).
 *
 * @param inner - The box that should be contained.
 * @param outer - The containing box.
 * @param epsilon - Tolerance for floating-point noise (default `1e-9`).
 * @returns `true` when no edge of `inner` crosses `outer` by more than `epsilon`.
 */
export function isInside(inner: Box, outer: Box, epsilon = 1e-9): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

/**
 * Tests whether two boxes overlap, or come closer than `gap` on both axes.
 *
 * Boxes that only touch do not overlap when `gap` is `0`.
 *
 * @param a - The first box.
 * @param b - The second box.
 * @param gap - The minimum clearance required between the boxes (default `0`).
 * @returns `true` when the boxes (each padded by `gap`) intersect.
 */
export function overlaps(a: Box, b: Box, gap = 0): boolean {
  const separatedX = a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x;
  const separatedY = a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;
  return !(separatedX || separatedY);
}

/** Options for {@link fitViewBox}. */
export interface FitViewBoxOptions {
  /** Centre the result horizontally on `x = 0` (for charts drawn around the origin). */
  symmetricX?: boolean;
}

/**
 * Fits a viewBox around `content` with `margin` on every side.
 *
 * With `symmetricX`, the horizontal extent becomes `[-h - margin, h + margin]`
 * where `h` is the larger of `|left|` and `|right|`, so the origin is centred.
 *
 * @param content - The union of everything the chart draws.
 * @param margin - Padding added on each side (default `0`).
 * @param options - Fit options.
 * @returns The viewBox as a {@link Box}.
 */
export function fitViewBox(content: Box, margin = 0, options: FitViewBoxOptions = {}): Box {
  const y = content.y - margin;
  const height = content.height + 2 * margin;
  if (options.symmetricX) {
    const half = Math.max(Math.abs(content.x), Math.abs(content.x + content.width));
    return { x: -half - margin, y, width: 2 * (half + margin), height };
  }
  return { x: content.x - margin, y, width: content.width + 2 * margin, height };
}
