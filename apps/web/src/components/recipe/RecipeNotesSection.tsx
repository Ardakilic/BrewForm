import { useState } from 'react';
import { recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface RecipeNotesSectionProps {
  recipeId: string;
  initialNotes?: string;
}

export function RecipeNotesSection({ recipeId, initialNotes = '' }: RecipeNotesSectionProps) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await recipeApi.saveNotes(recipeId, notes);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='card' aria-label={t('recipe.personalNotes')}>
      <div className='flex items-center justify-between mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.personalNotes')}
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('recipe.notes.placeholder')}
        className='input-field text-sm w-full min-h-[120px] resize-y print-hidden'
        maxLength={10000}
        aria-label={t('recipe.personalNotes')}
      />
      <p className='print-only whitespace-pre-wrap text-sm' style={{ lineHeight: '1.6' }}>
        {notes || t('recipe.notes.placeholder')}
      </p>
      <div className='flex items-center justify-between mt-3'>
        <span className='text-xs print-hidden' style={{ color: 'var(--text-tertiary)' }}>
          {notes.length} / 10000
        </span>
        <div className='flex items-center gap-2'>
          {saved && (
            <span className='text-xs' style={{ color: 'var(--accent-primary)' }}>
              {t('recipe.notes.saved')}
            </span>
          )}
          <button
            type='button'
            onClick={handleSave}
            disabled={saving}
            className='btn-primary text-sm min-h-11 px-4'
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </section>
  );
}
