/**
 * Tests for the chart box-geometry helpers.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering → "Shared chart primitives module")
 */
import { describe, expect, it } from 'vitest';
import { type Box, fitViewBox, isInside, labelBox, overlaps, unionBox } from './layout.ts';
import { estimateTextWidth } from './text.ts';

const W_ABC = estimateTextWidth('abc', 10);
const W_LONG = estimateTextWidth('abcdef', 10);
const LINE_H = 10 * 1.2;

describe('labelBox', () => {
  const base = { x: 100, y: 50, lines: ['abc'], fontSize: 10 } as const;

  it.each([
    ['start', 100],
    ['middle', 100 - W_ABC / 2],
    ['end', 100 - W_ABC],
  ] as const)('horizontal anchor %s puts the box x at the anchor-relative edge', (anchor, x) => {
    const box = labelBox({ ...base, anchor });
    expect(box.x).toBeCloseTo(x);
    expect(box.width).toBeCloseTo(W_ABC);
  });

  it.each([
    ['top', 50],
    ['middle', 50 - LINE_H / 2],
    ['bottom', 50 - LINE_H],
  ] as const)('vertical align %s puts the anchor on that box edge', (vAlign, y) => {
    const box = labelBox({ ...base, vAlign });
    expect(box.y).toBeCloseTo(y);
    expect(box.height).toBeCloseTo(LINE_H);
  });

  it('defaults to start/top', () => {
    expect(labelBox(base)).toEqual({ x: 100, y: 50, width: W_ABC, height: LINE_H });
  });

  it('sizes a multi-line label by its widest line and line count', () => {
    const box = labelBox({
      ...base,
      lines: ['abc', 'abcdef'],
      anchor: 'end',
      vAlign: 'middle',
    });
    expect(box.width).toBeCloseTo(W_LONG);
    expect(box.height).toBeCloseTo(2 * LINE_H);
    expect(box.x).toBeCloseTo(100 - W_LONG);
    expect(box.y).toBeCloseTo(50 - LINE_H);
  });

  it('honours a custom line height, bold and letter-spacing', () => {
    const box = labelBox({
      ...base,
      lineHeight: 1.5,
      bold: true,
      letterSpacingPx: 1,
    });
    expect(box.height).toBeCloseTo(15);
    expect(box.width).toBeCloseTo(estimateTextWidth('abc', 10, { bold: true, letterSpacingPx: 1 }));
  });

  it('returns an empty box at the anchor for no lines', () => {
    expect(labelBox({ ...base, lines: [] })).toEqual({ x: 100, y: 50, width: 0, height: 0 });
  });
});

describe('unionBox', () => {
  it('returns the bounding box of all boxes', () => {
    const a: Box = { x: 0, y: 0, width: 10, height: 10 };
    const b: Box = { x: -5, y: 5, width: 10, height: 20 };
    expect(unionBox([a, b])).toEqual({ x: -5, y: 0, width: 15, height: 25 });
  });

  it('returns a copy of a single box', () => {
    const a: Box = { x: 1, y: 2, width: 3, height: 4 };
    expect(unionBox([a])).toEqual(a);
  });

  it('returns an empty box for no boxes', () => {
    expect(unionBox([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('isInside', () => {
  const outer: Box = { x: 0, y: 0, width: 100, height: 50 };

  it('is true for a box strictly inside', () => {
    expect(isInside({ x: 10, y: 10, width: 20, height: 20 }, outer)).toBe(true);
  });

  it('is true for a box touching the edges', () => {
    expect(isInside({ x: 0, y: 0, width: 100, height: 50 }, outer)).toBe(true);
  });

  it.each([
    ['left', { x: -1, y: 10, width: 20, height: 10 }],
    ['right', { x: 90, y: 10, width: 11, height: 10 }],
    ['top', { x: 10, y: -0.5, width: 20, height: 10 }],
    ['bottom', { x: 10, y: 45, width: 20, height: 6 }],
  ])('is false for a box crossing the %s edge', (_edge, inner) => {
    expect(isInside(inner, outer)).toBe(false);
  });

  it('tolerates floating-point noise below epsilon', () => {
    expect(isInside({ x: -1e-12, y: 0, width: 100, height: 50 }, outer)).toBe(true);
  });
});

describe('overlaps', () => {
  const a: Box = { x: 0, y: 0, width: 10, height: 10 };

  it('is true for intersecting boxes', () => {
    expect(overlaps(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('is false for disjoint boxes', () => {
    expect(overlaps(a, { x: 20, y: 0, width: 10, height: 10 })).toBe(false);
    expect(overlaps(a, { x: 0, y: 20, width: 10, height: 10 })).toBe(false);
  });

  it('is false for boxes that only touch', () => {
    expect(overlaps(a, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('treats boxes closer than the gap as overlapping', () => {
    expect(overlaps(a, { x: 14, y: 0, width: 10, height: 10 }, 6)).toBe(true);
    expect(overlaps(a, { x: 16, y: 0, width: 10, height: 10 }, 6)).toBe(false);
  });

  it('is symmetric', () => {
    const b: Box = { x: 8, y: 8, width: 5, height: 5 };
    expect(overlaps(a, b)).toBe(overlaps(b, a));
  });
});

describe('fitViewBox', () => {
  const content: Box = { x: -50, y: -20, width: 80, height: 60 };

  it('expands the content box by the margin on every side', () => {
    expect(fitViewBox(content, 4)).toEqual({ x: -54, y: -24, width: 88, height: 68 });
  });

  it('defaults to no margin', () => {
    expect(fitViewBox(content)).toEqual(content);
  });

  it('contains the content box', () => {
    expect(isInside(content, fitViewBox(content, 2))).toBe(true);
  });
});
