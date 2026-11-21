/**
 * Pure model and label layout for the brew timeline chart.
 *
 * `computeTimelineModel` turns the (untrusted) extraction and pre-infusion
 * times into clamped phases; `layoutPhaseLabels` decides which phase titles
 * and durations fit inside their phase at a given chart width, moving any
 * duration that does not fit into a caption row so every duration stays
 * visible. Neither reads the DOM.
 */

import { t } from '@brewform/shared/i18n';
import { clampPct, estimateTextWidth, safeRatio, sanitizeNumber } from './chart/index.ts';
import { formatDuration } from './format.ts';

/** The two brew phases. */
export type TimelinePhaseKind = 'preInfusion' | 'extraction';

/** One phase of the timeline, as a slice of the full width. */
export interface TimelinePhase {
  kind: TimelinePhaseKind;
  /** Phase duration in seconds (never negative). */
  seconds: number;
  /** Left edge as a percentage of the chart width, in `[0, 100]`. */
  startPct: number;
  /** Width as a percentage of the chart width, in `[0, 100]`. */
  widthPct: number;
}

/** The sanitized timeline: 1 or 2 phases whose widths sum to 100%. */
export interface TimelineModel {
  /** Total extraction time in seconds (> 0). */
  total: number;
  /** Width of the pre-infusion phase in percent (0 without a split). */
  preInfusionPct: number;
  /** True when a pre-infusion ≥ the total was ignored. */
  inconsistent: boolean;
  /** The phases in order. */
  phases: TimelinePhase[];
}

/**
 * Builds the timeline model from raw props.
 *
 * Returns `null` when the total is missing, non-finite or ≤ 0. Without a
 * usable pre-infusion (missing, non-finite, ≤ 0) or when it is ≥ the total,
 * the model is a single extraction phase covering the full total; the latter
 * case sets `inconsistent` so the caller can log it.
 *
 * @param extractionTimeSeconds - Total extraction time (includes pre-infusion).
 * @param preInfusionTimeSeconds - Optional pre-infusion time.
 * @returns The model, or `null` for an invalid total.
 */
export function computeTimelineModel(
  extractionTimeSeconds: unknown,
  preInfusionTimeSeconds: unknown,
): TimelineModel | null {
  const total = sanitizeNumber(extractionTimeSeconds, Number.NaN);
  if (!(total > 0)) return null;
  const pre = sanitizeNumber(preInfusionTimeSeconds, Number.NaN);
  const hasPre = pre > 0;
  const inconsistent = hasPre && pre >= total;

  if (!hasPre || inconsistent) {
    return {
      total,
      preInfusionPct: 0,
      inconsistent,
      phases: [{ kind: 'extraction', seconds: total, startPct: 0, widthPct: 100 }],
    };
  }

  const prePct = clampPct(safeRatio(pre, total) * 100);
  return {
    total,
    preInfusionPct: prePct,
    inconsistent: false,
    phases: [
      { kind: 'preInfusion', seconds: pre, startPct: 0, widthPct: prePct },
      {
        kind: 'extraction',
        seconds: total - pre,
        startPct: prePct,
        widthPct: clampPct(100 - prePct),
      },
    ],
  };
}

/** Horizontal padding kept on each side of a label inside its phase, in px. */
export const PHASE_LABEL_PADDING_PX = 6;
/** Phase title metrics: 11px semibold uppercase with 0.05em tracking. */
export const PHASE_TITLE_FONT_PX = 11;
/** Phase title letter spacing in px (0.05em of {@link PHASE_TITLE_FONT_PX}). */
export const PHASE_TITLE_TRACKING_PX = 0.55;
/** Phase value metrics: 18px bold. */
export const PHASE_VALUE_FONT_PX = 18;

/** A horizontal px extent on the chart. */
export interface HBox {
  x: number;
  width: number;
}

/** Label decisions for one phase. */
export interface PhaseLabelLayout extends TimelinePhase {
  /** Localized phase title (rendered uppercase via CSS). */
  title: string;
  /** Localized compact duration. */
  value: string;
  /** Whether the title is drawn inside the phase (only together with the value). */
  showTitle: boolean;
  /** Whether the duration is drawn inside the phase. */
  showValue: boolean;
  /** Estimated title box in px when shown. */
  titleBox: HBox | null;
  /** Estimated value box in px when shown. */
  valueBox: HBox | null;
}

/** A phase whose duration is shown in the caption row instead. */
export interface PhaseCaptionItem {
  kind: TimelinePhaseKind;
  title: string;
  value: string;
}

/** Output of {@link layoutPhaseLabels}. */
export interface PhaseLabelsLayout {
  phases: PhaseLabelLayout[];
  caption: PhaseCaptionItem[];
}

/** A label box centred in the phase. */
function centred(phaseLeft: number, phaseWidth: number, labelWidth: number): HBox {
  return { x: phaseLeft + (phaseWidth - labelWidth) / 2, width: labelWidth };
}

/**
 * Decides which phase titles and durations fit inside their phase.
 *
 * A part is shown only when its estimated width plus {@link PHASE_LABEL_PADDING_PX}
 * on each side fits the phase's px width; a title is shown only together
 * with its duration. Every hidden duration is listed in `caption`.
 *
 * @param model - The timeline model.
 * @param widthPx - The chart width in px (the 200px minimum before measuring).
 * @param locale - The active locale for titles and durations.
 * @returns Per-phase label decisions and the caption items.
 */
export function layoutPhaseLabels(
  model: TimelineModel,
  widthPx: number,
  locale: string,
): PhaseLabelsLayout {
  const caption: PhaseCaptionItem[] = [];
  const phases = model.phases.map((phase): PhaseLabelLayout => {
    const title = t(`recipe.brewTimeline.${phase.kind}`, locale);
    const value = formatDuration(phase.seconds, locale);
    const left = (phase.startPct / 100) * widthPx;
    const width = (phase.widthPct / 100) * widthPx;
    const titleWidth = estimateTextWidth(title.toLocaleUpperCase(locale), PHASE_TITLE_FONT_PX, {
      bold: true,
      letterSpacingPx: PHASE_TITLE_TRACKING_PX,
    });
    const valueWidth = estimateTextWidth(value, PHASE_VALUE_FONT_PX, { bold: true });
    const showValue = valueWidth + 2 * PHASE_LABEL_PADDING_PX <= width;
    const showTitle = showValue && titleWidth + 2 * PHASE_LABEL_PADDING_PX <= width;
    if (!showValue) caption.push({ kind: phase.kind, title, value });
    return {
      ...phase,
      title,
      value,
      showTitle,
      showValue,
      titleBox: showTitle ? centred(left, width, titleWidth) : null,
      valueBox: showValue ? centred(left, width, valueWidth) : null,
    };
  });
  return { phases, caption };
}
