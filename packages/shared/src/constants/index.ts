/**
 * Public barrel for `@brewform/shared/constants`.
 *
 * Re-exports every rich-object enum definition (option lists for the UI)
 * and every pure-value tuple (the `_VALUES` arrays) that the rest of the
 * monorepo consumes for Drizzle `pgEnum()` and Zod `z.enum()` calls.
 *
 * The TypeScript type aliases that derive from these tuples (e.g.
 * `BrewMethodValue`, `EquipmentType`) are intentionally re-exported only
 * from `@brewform/shared/types` to avoid name collisions at the package
 * root. The types are still defined inside the `constants/` directory as
 * the canonical single source of truth, and `types/*.ts` files import
 * from here.
 */

// ── Rich-object enum exports (option lists for the UI) ───────────────────────
export { BREW_METHODS, BREW_METHODS_LIST, type BrewMethodOption } from './brew-methods.ts';
export { DRINK_TYPES, DRINK_TYPES_LIST, type DrinkTypeOption } from './drink-types.ts';
export { EMOJI_TAGS, EMOJI_TAGS_LIST, type EmojiTagOption } from './emoji-tags.ts';
export { VISIBILITY_STATES, VISIBILITY_STATES_LIST, type VisibilityOption } from './visibility.ts';
export { BADGE_RULES } from './badges.ts';
export {
  BREW_METHOD_EQUIPMENT_RULES,
  type BrewMethodEquipmentRuleDef,
} from './brew-method-rules.ts';
export { CANONICAL_UNITS, UNIT_CONVERSIONS } from './units.ts';

// ── Pure-value tuples (DB / Zod single source of truth) ──────────────────────
export { BREW_METHOD_VALUES } from './brew-methods.ts';
export { DRINK_TYPE_VALUES } from './drink-types.ts';
export { EMOJI_TAG_VALUES } from './emoji-tags.ts';
export { VISIBILITY_VALUES } from './visibility.ts';
export { BADGE_RULE_VALUES } from './badges.ts';
export {
  EQUIPMENT_TYPE_LABELS,
  EQUIPMENT_TYPE_VALUES,
  EQUIPMENT_TYPES,
} from './equipment-types.ts';
export { ADDITIONAL_PREPARATION_TYPE_VALUES } from './additional-preparation-types.ts';
export {
  DATE_FORMAT_DISPLAY,
  DATE_FORMAT_VALUES,
  TEMPERATURE_UNIT_VALUES,
  THEME_VALUES,
  UNIT_SYSTEM_VALUES,
} from './user-preferences.ts';
export { COFFEE_VARIETY_CATEGORY_VALUES } from './coffee-variety.ts';
export { EQUIPMENT_DELETE_REQUEST_STATUS_VALUES } from './equipment-delete-request.ts';
export { REPORT_STATUS_VALUES } from './report-status.ts';
