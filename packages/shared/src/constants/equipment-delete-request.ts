/**
 * Equipment deletion request status enum — single source of truth.
 *
 * Consumed by:
 * - `packages/db/src/schema.ts` — Drizzle `pgEnum('equipment_delete_request_status', …)`
 *
 * No Zod schema or public-facing TypeScript type currently uses this enum
 * directly, but it is exported through the constants barrel for downstream
 * consumers (admin tooling, future status filters, etc.).
 */
export const EQUIPMENT_DELETE_REQUEST_STATUS_VALUES = [
  'pending',
  'approved',
  'rejected',
] as const;

/** Lifecycle status of an equipment deletion request submitted by a user. */
export type EquipmentDeleteRequestStatus = typeof EQUIPMENT_DELETE_REQUEST_STATUS_VALUES[number];
