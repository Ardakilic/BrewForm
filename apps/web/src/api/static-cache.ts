import { equipmentApi, tasteApi } from './index.ts';
import type { EquipmentListItem, TasteNoteFlatItem } from './types.ts';

let _equipment: EquipmentListItem[] | null = null;
let _tasteNotes: TasteNoteFlatItem[] | null = null;

export async function getEquipmentCached(): Promise<EquipmentListItem[]> {
  if (!_equipment) _equipment = await equipmentApi.list();
  return _equipment;
}

export async function getTasteNotesCached(): Promise<TasteNoteFlatItem[]> {
  if (!_tasteNotes) _tasteNotes = await tasteApi.flat();
  return _tasteNotes;
}

export function invalidateStaticCache(): void {
  _equipment = null;
  _tasteNotes = null;
}
