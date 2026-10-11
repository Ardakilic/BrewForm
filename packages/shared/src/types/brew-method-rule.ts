/**
 * Brew-method equipment compatibility rule type definition
 * shared between API and frontend.
 *
 * Each rule declares whether a given equipment type is compatible
 * with a given brew method (e.g. a tamper is compatible with espresso
 * machines but not with pour-over).
 */

import type { EquipmentType } from './equipment.ts';
import type { BrewMethod } from './recipe.ts';

/**
 * Compatibility rule linking a brew method to an equipment type.
 *
 * Used to determine which equipment types should be presented
 * in the UI for each brew method selection.
 */
export interface BrewMethodEquipmentRule {
  /** UUID primary key */
  id: string;
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  /** Whether this equipment type is compatible with the brew method */
  compatible: boolean;
  createdAt: Date;
}
