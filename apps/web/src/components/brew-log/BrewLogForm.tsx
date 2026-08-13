import { useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { Field } from '../form/Field.tsx';

/** Values exchanged with {@link BrewLogForm} — `brewedAt` is an ISO datetime string. */
export interface BrewLogFormValues {
  brewedAt: string;
  yieldActual: number | null;
  doseActual: number | null;
  notes: string | null;
  personalRating: number | null;
}

/** Props for {@link BrewLogForm}. */
interface BrewLogFormProps {
  initialValues: BrewLogFormValues;
  onSubmit: (values: BrewLogFormValues) => Promise<void>;
  submitLabel: string;
}

/** Converts an ISO datetime to the `YYYY-MM-DDTHH:mm` shape `<input type="datetime-local">` expects. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${
    pad(d.getMinutes())
  }`;
}

function toNumberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
}

/**
 * Controlled brew-log form shared by create and edit modes. Client validation
 * mirrors `BrewLogCreateSchema`/`BrewLogUpdateSchema` bounds: required
 * `brewedAt`, positive yield/dose, integer rating 1–10, notes ≤ 5000 chars.
 */
export function BrewLogForm({ initialValues, onSubmit, submitLabel }: BrewLogFormProps) {
  const { t } = useTranslation();
  const [brewedAt, setBrewedAt] = useState(toLocalInputValue(initialValues.brewedAt));
  const [yieldActual, setYieldActual] = useState(
    initialValues.yieldActual !== null ? String(initialValues.yieldActual) : '',
  );
  const [doseActual, setDoseActual] = useState(
    initialValues.doseActual !== null ? String(initialValues.doseActual) : '',
  );
  const [notes, setNotes] = useState(initialValues.notes ?? '');
  const [personalRating, setPersonalRating] = useState(
    initialValues.personalRating !== null ? String(initialValues.personalRating) : '',
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const yieldValue = toNumberOrNull(yieldActual);
    const doseValue = toNumberOrNull(doseActual);
    const ratingValue = toNumberOrNull(personalRating);
    if (yieldValue !== null && (!Number.isFinite(yieldValue) || yieldValue <= 0)) {
      nextErrors.yieldActual = t('brewLog.form.error.positive');
    }
    if (doseValue !== null && (!Number.isFinite(doseValue) || doseValue <= 0)) {
      nextErrors.doseActual = t('brewLog.form.error.positive');
    }
    if (
      ratingValue !== null &&
      (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 10)
    ) {
      nextErrors.personalRating = t('brewLog.form.error.ratingRange');
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({
        brewedAt: new Date(brewedAt).toISOString(),
        yieldActual: yieldValue,
        doseActual: doseValue,
        notes: notes.trim() === '' ? null : notes,
        personalRating: ratingValue,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <Field label={t('brewLog.form.brewedAt')} htmlFor='brew-log-brewed-at' required>
        <input
          id='brew-log-brewed-at'
          type='datetime-local'
          value={brewedAt}
          onChange={(e) => setBrewedAt(e.target.value)}
          className='input w-full'
          required
        />
      </Field>
      <Field
        label={t('brewLog.form.yieldActual')}
        htmlFor='brew-log-yield-actual'
        error={errors.yieldActual}
      >
        <input
          id='brew-log-yield-actual'
          type='number'
          inputMode='decimal'
          min={0}
          step='any'
          placeholder={t('brewLog.form.yieldActual.placeholder')}
          value={yieldActual}
          onChange={(e) => setYieldActual(e.target.value)}
          className='input w-full'
        />
      </Field>
      <Field
        label={t('brewLog.form.doseActual')}
        htmlFor='brew-log-dose-actual'
        error={errors.doseActual}
      >
        <input
          id='brew-log-dose-actual'
          type='number'
          inputMode='decimal'
          min={0}
          step='any'
          placeholder={t('brewLog.form.doseActual.placeholder')}
          value={doseActual}
          onChange={(e) => setDoseActual(e.target.value)}
          className='input w-full'
        />
      </Field>
      <Field label={t('brewLog.form.notes')} htmlFor='brew-log-notes'>
        <textarea
          id='brew-log-notes'
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('brewLog.form.notes.placeholder')}
          className='input w-full'
          rows={4}
          maxLength={5000}
        />
      </Field>
      <Field
        label={t('brewLog.form.personalRating')}
        htmlFor='brew-log-personal-rating'
        error={errors.personalRating}
      >
        <input
          id='brew-log-personal-rating'
          type='number'
          min={1}
          max={10}
          step={1}
          value={personalRating}
          onChange={(e) => setPersonalRating(e.target.value)}
          className='input w-full'
        />
      </Field>
      <button type='submit' disabled={submitting} className='btn-primary'>
        {submitLabel}
      </button>
    </form>
  );
}
