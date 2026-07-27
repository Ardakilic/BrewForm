/**
 * Brew method × equipment compatibility matrix.
 *
 * Each rule records whether a given brew method can be performed with a given
 * piece of equipment. The shape mirrors the database `brew_method_equipment`
 * table (one row per method/equipment combination).
 */
import type { EquipmentType } from './equipment-types.ts';
import type { BrewMethodValue } from './brew-methods.ts';

/** A single brew-method × equipment-type compatibility rule. */
export interface BrewMethodEquipmentRuleDef {
  brewMethod: BrewMethodValue;
  equipmentType: EquipmentType;
  compatible: boolean;
}

/** Full compatibility matrix of brew methods and equipment types. */
export const BREW_METHOD_EQUIPMENT_RULES: BrewMethodEquipmentRuleDef[] = [
  { brewMethod: 'espresso_machine', equipmentType: 'espresso_machine', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'grinder', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'basket', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'tamper', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'puck_screen', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'paper_filter', compatible: false },
  { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'v60', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'v60', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'tamper', compatible: false },
  { brewMethod: 'french_press', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'turkish_coffee', equipmentType: 'cezve', compatible: true },
  { brewMethod: 'turkish_coffee', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'pour_over_brewer', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'kettle', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'moka_pot', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'moka_pot', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'immersion_brewer', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'scale_accessory', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'thermometer', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'kettle', compatible: true },
];
