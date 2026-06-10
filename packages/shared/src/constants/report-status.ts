/**
 * Report status enum — single source of truth.
 *
 * Consumed by:
 * - packages/db/src/schema.ts             — Drizzle pgEnum('report_status', …)
 * - packages/shared/src/schemas/report.ts — Zod z.enum(REPORT_STATUS_VALUES)
 */
export const REPORT_STATUS_VALUES = [
  'pending',
  'reviewed',
  'resolved',
  'dismissed',
] as const;

/** Lifecycle status of a content report submitted by a user. */
export type ReportStatus = typeof REPORT_STATUS_VALUES[number];
