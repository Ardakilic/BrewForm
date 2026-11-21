import type { EquipmentOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';

/** Props of {@link EquipmentPicker}. */
export interface EquipmentPickerProps {
  /** The equipment the user can pick from (the route loader's equipment lookup). */
  equipment: EquipmentOutput[];
  /** Ids of the selected equipment, in selection order. */
  selectedIds: string[];
  /** Called with the new selection after a checkbox is toggled. */
  onChange: (ids: string[]) => void;
}

/**
 * Returns `selectedIds` with `id` added (appended) or removed. Pure; the order of the other
 * ids is kept.
 */
export function toggleEquipmentId(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

/**
 * Equipment checkbox list of the recipe create and edit forms: a `<fieldset>` titled
 * `equipment.title` with one labelled checkbox per item (name plus type), or the
 * `recipe.form.noEquipment` hint when the list is empty. Controlled: the parent owns the
 * selection and receives every change through `onChange`, so the edit form can pre-populate it
 * from the current version and send it as `equipmentIds` (an empty selection is sent as `[]`).
 * The group uses a `<legend>` rather than the form `Field` label, so each checkbox is named by
 * its own item only.
 */
export function EquipmentPicker({ equipment, selectedIds, onChange }: EquipmentPickerProps) {
  const { t } = useTranslation();

  return (
    <fieldset className="block mb-1" style={{ color: 'var(--text-secondary)' }}>
      <legend className="label-text text-sm font-medium">{t('equipment.title')}</legend>
      <div className="space-y-2 mt-1">
        {equipment.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {t('recipe.form.noEquipment')}
          </p>
        ) : (
          equipment.map((eq) => (
            <label
              key={eq.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(eq.id)}
                onChange={() => onChange(toggleEquipmentId(selectedIds, eq.id))}
                className="rounded"
              />
              <span>{eq.name}</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                ({eq.type})
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}
