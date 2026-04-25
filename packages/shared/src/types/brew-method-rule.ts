import type { BrewMethod } from './recipe.ts';
import type { EquipmentType } from './equipment.ts';

export interface BrewMethodEquipmentRule {
  id: string;
  brewMethod: BrewMethod;
  equipmentType: EquipmentType;
  compatible: boolean;
  createdAt: Date;
}