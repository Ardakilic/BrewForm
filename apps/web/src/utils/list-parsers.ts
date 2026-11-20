/**
 * Per-page URL parsers for list pages. Each parser is shared by the page's controls (through
 * `useListUrlState`) and its loader, so both read the URL the same way. Built from the
 * helpers in `list-params.ts`; invalid values normalise to defaults.
 */
import { readBoolean, readEnum, readPage, readText } from './list-params.ts';

/** Equipment catalogue type tabs (`''` = all). */
export const EQUIPMENT_CATALOG_TYPES = [
  '',
  'espresso_machine',
  'grinder',
  'pour_over_brewer',
  'immersion_brewer',
  'kettle',
  'milk_tool',
  'scale_accessory',
  'roaster',
] as const;

/** `/equipments` URL state: `page`, `type` tab and free-text `q` (legacy `search` accepted). */
export interface EquipmentCatalogParams {
  page: number;
  type: (typeof EQUIPMENT_CATALOG_TYPES)[number];
  q: string;
}

/** Parses the `/equipments` catalogue URL. */
export function parseEquipmentCatalogParams(sp: URLSearchParams): EquipmentCatalogParams {
  return {
    page: readPage(sp),
    type: readEnum(sp, 'type', EQUIPMENT_CATALOG_TYPES, ''),
    q: readText(sp, 'q', { legacyKeys: ['search'] }),
  };
}

/** Coffee-variety catalogue category tabs (`''` = all). */
export const COFFEE_VARIETY_CATEGORIES = ['', 'variety', 'processing', 'market_name'] as const;

/** `/coffee-varieties` URL state: `page`, `category` tab and `q` (legacy `search` accepted). */
export interface CoffeeVarietyCatalogParams {
  page: number;
  category: (typeof COFFEE_VARIETY_CATEGORIES)[number];
  q: string;
}

/** Parses the `/coffee-varieties` catalogue URL. */
export function parseCoffeeVarietyCatalogParams(sp: URLSearchParams): CoffeeVarietyCatalogParams {
  return {
    page: readPage(sp),
    category: readEnum(sp, 'category', COFFEE_VARIETY_CATEGORIES, ''),
    q: readText(sp, 'q', { legacyKeys: ['search'] }),
  };
}

/** `/notifications` URL state: `page` and the `unreadOnly` filter (both omitted at default). */
export interface NotificationListParams {
  page: number;
  unreadOnly: boolean;
}

/** Parses the `/notifications` URL. */
export function parseNotificationListParams(sp: URLSearchParams): NotificationListParams {
  return { page: readPage(sp), unreadOnly: readBoolean(sp, 'unreadOnly') };
}

/** URL state of a list whose only selection is the page (`/brew-logs`, `/collections`, …). */
export interface PageOnlyParams {
  page: number;
}

/** Parses a page-only list URL (`/brew-logs`, `/collections`, `/collections/browse`). */
export function parsePageOnlyParams(sp: URLSearchParams): PageOnlyParams {
  return { page: readPage(sp) };
}

/** `/taste-notes` URL state: the free-text filter `q`. */
export interface TasteNotesParams {
  q: string;
}

/** Parses the `/taste-notes` URL. */
export function parseTasteNotesParams(sp: URLSearchParams): TasteNotesParams {
  return { q: readText(sp, 'q') };
}

/** Audit-log entity-type filter values (`''` = all). */
export const AUDIT_ENTITY_TYPES = [
  '',
  'user',
  'recipe',
  'equipment',
  'vendor',
  'taste_note',
  'report',
] as const;

/** `/admin/audit-log` URL state: `page` and the `entityType` filter. */
export interface AuditLogParams {
  page: number;
  entityType: (typeof AUDIT_ENTITY_TYPES)[number];
}

/** Parses the `/admin/audit-log` URL. */
export function parseAuditLogParams(sp: URLSearchParams): AuditLogParams {
  return { page: readPage(sp), entityType: readEnum(sp, 'entityType', AUDIT_ENTITY_TYPES, '') };
}

/** `/admin/users` URL state: `page` and the free-text user search `q`. */
export interface AdminUsersParams {
  page: number;
  q: string;
}

/** Parses the `/admin/users` URL. */
export function parseAdminUsersParams(sp: URLSearchParams): AdminUsersParams {
  return { page: readPage(sp), q: readText(sp, 'q') };
}
