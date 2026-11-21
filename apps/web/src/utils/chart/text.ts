/**
 * Deterministic text measurement for chart layout.
 *
 * Chart layout must be computable without the DOM (jsdom has no layout, and
 * first paint and print must match), so label widths are estimated from
 * per-character classes calibrated against SF Pro measurements
 * (`measured-widths.fixture.ts`). The estimate is deliberately conservative:
 * it is at least the measured width for every calibrated string.
 */

/** Options for {@link estimateTextWidth} and {@link wrapLabel}. */
export interface TextMeasureOptions {
  /** Semibold or bold text (weight ≥ 600); multiplies the width by 1.06. */
  bold?: boolean;
  /** Letter-spacing in px added after every character. */
  letterSpacingPx?: number;
}

/** Narrow glyphs (0.34em), including the space and the Turkish dotless ı. */
const NARROW_CHARS = new Set(Array.from("iljtfrıI.,:;'|!/ ()[]-"));
/** Lowercase glyphs as wide as capitals (0.80em). */
const WIDE_LOWERCASE = new Set(['m', 'w']);

const EM_NARROW = 0.34;
const EM_WIDE = 0.8;
const EM_DIGIT = 0.62;
const EM_OTHER = 0.6;
/** Safety margin over the raw per-character estimate. */
const SAFETY_FACTOR = 1.1;
/** Extra width for semibold/bold text. */
const BOLD_FACTOR = 1.06;

/**
 * Returns the em-width class of one character.
 *
 * @param ch - A single character (code point).
 * @returns The advance width in em.
 */
function charEm(ch: string): number {
  if (NARROW_CHARS.has(ch)) return EM_NARROW;
  if (ch >= '0' && ch <= '9') return EM_DIGIT;
  if (WIDE_LOWERCASE.has(ch)) return EM_WIDE;
  // Uppercase (including Turkish capitals Ç Ğ İ Ö Ş Ü); `I` is caught above as narrow.
  if (ch !== ch.toLowerCase() && ch === ch.toUpperCase()) return EM_WIDE;
  return EM_OTHER;
}

/**
 * Estimates the rendered width of `text` in px.
 *
 * Per character: 0.34em narrow, 0.80em uppercase/wide, 0.62em digits, 0.60em
 * otherwise, plus `letterSpacingPx`; the sum is multiplied by 1.1 for safety
 * and by a further 1.06 when `bold` is set.
 *
 * @param text - The string to measure.
 * @param fontSizePx - Font size in px (or in viewBox units for SVG text).
 * @param options - Bold and letter-spacing options.
 * @returns A conservative width estimate in the same unit as `fontSizePx`.
 */
export function estimateTextWidth(
  text: string,
  fontSizePx: number,
  options: TextMeasureOptions = {},
): number {
  const spacing = options.letterSpacingPx ?? 0;
  let width = 0;
  for (const ch of text) {
    width += charEm(ch) * fontSizePx + spacing;
  }
  width *= SAFETY_FACTOR;
  if (options.bold) width *= BOLD_FACTOR;
  return width;
}

/** A wrap token: a piece of a word and whether a space precedes it. */
interface WrapToken {
  text: string;
  spaceBefore: boolean;
}

/**
 * Splits text into break-opportunity tokens: at whitespace, and after every `/`.
 *
 * @param text - The label text.
 * @returns Tokens in reading order.
 */
function tokenize(text: string): WrapToken[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const tokens: WrapToken[] = [];
  words.forEach((word, wordIndex) => {
    const pieces = word.split(/(?<=\/)/);
    pieces.forEach((piece, pieceIndex) => {
      tokens.push({ text: piece, spaceBefore: wordIndex > 0 && pieceIndex === 0 });
    });
  });
  return tokens;
}

/**
 * Wraps a chart label into lines no wider than `maxWidthPx`.
 *
 * Break opportunities are after every `/` (the slash stays on the first line)
 * and at whitespace (the space is dropped at a break). Tokens are packed
 * greedily, so a label that fits stays on one line. A single token wider than
 * `maxWidthPx` cannot be broken and is returned as its own line.
 *
 * @param text - The label text.
 * @param maxWidthPx - The maximum line width (same unit as `fontSizePx`).
 * @param fontSizePx - The font size used for the width estimate.
 * @param options - Bold and letter-spacing options for the estimate.
 * @returns The label lines (empty for blank text).
 */
export function wrapLabel(
  text: string,
  maxWidthPx: number,
  fontSizePx: number,
  options: TextMeasureOptions = {},
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const token of tokenize(text)) {
    if (current === '') {
      current = token.text;
      continue;
    }
    const candidate = `${current}${token.spaceBefore ? ' ' : ''}${token.text}`;
    if (estimateTextWidth(candidate, fontSizePx, options) <= maxWidthPx) {
      current = candidate;
    } else {
      lines.push(current);
      current = token.text;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}
