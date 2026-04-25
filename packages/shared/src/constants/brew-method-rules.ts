import type { BrewMethod } from '../types/recipe.ts';
import type { EquipmentType } from '../types/equipment.ts';

export interface BrewMethodEquipmentRuleDef {
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  compatible: boolean;
}

export const BREW_METHOD_EQUIPMENT_RULES: BrewMethodEquipmentRuleDef[] = [
  { brewMethod: 'espresso_machine', equipmentType: 'portafilter', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'basket', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'tamper', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'puck_screen', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'scale', compatible: true },
  { brewMethod: 'espresso_machine', equipmentType: 'paper_filter', compatible: false },
  { brewMethod: 'espresso_machine', equipmentType: 'mesh_filter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'v60', equipmentType: 'gooseneck_kettle', compatible: true },
  { brewMethod: 'v60', equipmentType: 'scale', compatible: true },
  { brewMethod: 'v60', equipmentType: 'portafilter', compatible: false },
  { brewMethod: 'v60', equipmentType: 'tamper', compatible: false },
  { brewMethod: 'french_press', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'french_press', equipmentType: 'scale', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'aeropress', equipmentType: 'scale', compatible: true },
  { brewMethod: 'turkish_coffee', equipmentType: 'cezve', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'drip_coffee', equipmentType: 'scale', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'gooseneck_kettle', compatible: true },
  { brewMethod: 'chemex', equipmentType: 'scale', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'paper_filter', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'gooseneck_kettle', compatible: true },
  { brewMethod: 'kalita_wave', equipmentType: 'scale', compatible: true },
  { brewMethod: 'moka_pot', equipmentType: 'scale', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'mesh_filter', compatible: true },
  { brewMethod: 'cold_brew', equipmentType: 'scale', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'scale', compatible: true },
  { brewMethod: 'siphon', equipmentType: 'thermometer', compatible: true },
];