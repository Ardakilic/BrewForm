/**
 * Measured text widths used to calibrate `estimateTextWidth`.
 *
 * Every row was measured with CoreText in the macOS system UI font (SF Pro),
 * which is what renders because Inter is not loaded (`apps/web/index.html`).
 * Source: `openspec/changes/archive/2026-11-21-wave-6-audit-remediation/audit/t6-charts.md` §8
 * (en and tr radar labels, timeline titles, tick labels and stat values).
 *
 * The estimate test asserts `estimateTextWidth(...) >= measuredPx` for every
 * row, so the estimate stays conservative against real rendering.
 */

/** CSS font-weight bucket the string was measured at. */
export type MeasuredFontWeight = 400 | 500 | 600 | 700;

/** One measured string: text, font size, weight, letter-spacing and measured width. */
export interface MeasuredWidthRow {
  /** The exact string that was measured. */
  text: string;
  /** Font size in px. */
  fontPx: number;
  /** Font weight (400 regular, 500 medium, 600 semibold, 700 bold). */
  weight: MeasuredFontWeight;
  /** Letter-spacing in px added after every character. */
  letterSpacingPx: number;
  /** Measured advance width in px. */
  measuredPx: number;
}

/** Shorthand for building a fixture row. */
function row(
  text: string,
  fontPx: number,
  weight: MeasuredFontWeight,
  letterSpacingPx: number,
  measuredPx: number,
): MeasuredWidthRow {
  return { text, fontPx, weight, letterSpacingPx, measuredPx };
}

/** The SF Pro measurement table from audit §8. */
export const MEASURED_WIDTHS: readonly MeasuredWidthRow[] = [
  // Radar labels (en), 10px regular
  row('Green/Vegetative', 10, 400, 0, 83.3),
  row('Sour/Fermented', 10, 400, 0, 77.3),
  row('Nutty/Cocoa', 10, 400, 0, 59.8),
  row('Vegetative', 10, 400, 0, 51.1),
  row('Fermented', 10, 400, 0, 52.1),
  row('Green/', 10, 400, 0, 32.1),
  row('Floral', 10, 400, 0, 26.7),
  row('Fruity', 10, 400, 0, 27.6),
  row('Sweet', 10, 400, 0, 29.6),
  row('Spices', 10, 400, 0, 32.2),
  row('Roasted', 10, 400, 0, 39.2),
  row('Other', 10, 400, 0, 27.3),
  // Radar labels (tr), 10px regular
  row('Yeşil/Bitkisel', 10, 400, 0, 60.4),
  row('Ekşi/Fermente', 10, 400, 0, 68.3),
  row('Fındıksı/Kakao', 10, 400, 0, 69.0),
  row('Çiçeksi', 10, 400, 0, 34.7),
  row('Meyvemsi', 10, 400, 0, 48.1),
  row('Tatlı', 10, 400, 0, 20.0),
  row('Baharatlı', 10, 400, 0, 42.5),
  row('Kavrulmuş', 10, 400, 0, 50.2),
  row('Diğer', 10, 400, 0, 25.9),
  row('Fındıksı/', 10, 400, 0, 39.7),
  row('Bitkisel', 10, 400, 0, 35.0),
  // Timeline tick labels, 10.4px regular
  row('300s', 10.4, 400, 0, 25.5),
  row('43200s', 10.4, 400, 0, 38.6),
  row('55s', 10.4, 400, 0, 18.6),
  row('290s', 10.4, 400, 0, 25.3),
  row('12:00:00', 10.4, 400, 0, 44.3),
  row('4:30', 10.4, 400, 0, 23.2),
  // Old in-SVG phase titles, 16px semibold, 1.5px tracking
  row('Pre-Infusion', 16, 600, 1.5, 111.7),
  row('Extraction', 16, 600, 1.5, 92.2),
  row('Ön Islatma', 16, 600, 1.5, 95.8),
  row('Ekstraksiyon', 16, 600, 1.5, 114.3),
  // HTML phase titles, 11px semibold uppercase, 0.6px tracking
  row('PRE-INFUSION', 11, 600, 0.6, 88.6),
  row('ÖN ISLATMA', 11, 600, 0.6, 75.3),
  row('EKSTRAKSIYON', 11, 600, 0.6, 93.7),
  // Phase values, 18px bold
  row('4 dk 30 sn', 18, 700, 0, 89.8),
  row('25 sn', 18, 700, 0, 47.2),
  row('3 sn', 18, 700, 0, 36.2),
  row('3s', 18, 700, 0, 21.3),
  // Stat card values, 24px bold
  row('1:2.2222223', 24, 700, 0, 142.7),
  row('1:2,2', 24, 700, 0, 53.7),
  row('43200s', 24, 700, 0, 90.3),
  row('12 sa', 24, 700, 0, 57.6),
  // Timeline flow rate, 14px medium
  row('1.2857143 ml/s', 14, 500, 0, 100.4),
  row('1,3 ml/s', 14, 500, 0, 50.2),
  // Timeline header title, 12px semibold, 1.2px tracking
  row('DEMLEME ZAMAN ÇİZELGESİ', 12, 600, 1.2, 200.8),
  row('BREW TIMELINE', 12, 600, 1.2, 110.9),
];
