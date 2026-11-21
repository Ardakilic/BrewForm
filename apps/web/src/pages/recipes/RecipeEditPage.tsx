import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  EMOJI_TAGS_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import type { RecipeDetailOutput, RecipeUpdate } from '@brewform/shared/schemas';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData, useNavigate } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { Field, Section } from '../../components/form/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import type { action, loader } from './RecipeEditPage.data.ts';
import { recipeFormErrorMessage } from './recipe-form-errors.ts';

const log = createLogger('RecipeEditPage');

/** Id of the public brewer-notes hint, referenced by the textarea's `aria-describedby`. */
const BREWER_NOTES_HINT_ID = 'recipe-brewer-notes-hint';

/** A recipe whose current version is present (the edit form needs one to pre-fill). */
type EditableRecipe = RecipeDetailOutput & {
  currentVersion: NonNullable<RecipeDetailOutput['currentVersion']>;
};

/**
 * `/recipes/:id/edit`: the recipe edit form. The recipe, the user's beans and the equipment
 * lookup come from the route loader (`RecipeEditPage.data.ts`); a load failure renders the
 * route error state, never a blank form. The form is keyed by recipe id so moving to another
 * recipe's edit URL re-seeds every field. A recipe without versions shows
 * `recipe.editPage.noVersions`.
 */
export function RecipeEditPage() {
  const { recipe } = useLoaderData<typeof loader>();
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({}, 'RecipeEditPage mounted');
    return () => {
      log.debug({}, 'RecipeEditPage unmounted');
    };
  }, []);

  if (!recipe.currentVersion) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <SEOHead title={t('recipe.edit')} />
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
          {t('recipe.edit')}
        </h1>
        <ErrorState message={t('recipe.editPage.noVersions')} className="mb-4" />
      </div>
    );
  }

  return <RecipeEditForm key={recipe.id} recipe={recipe as EditableRecipe} />;
}

/** Date input value (`YYYY-MM-DD`) of an ISO timestamp, or `''`. */
function dateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/**
 * Recipe edit form pre-filled from the current version; saving can optionally bump a new
 * version. Submits the `RecipeUpdate` payload to the `/recipes/:id/edit` route action with a
 * fetcher, navigates to the recipe on `{ ok: true }` and lists the errors inline on
 * `{ ok: false }`.
 */
function RecipeEditForm({ recipe }: { recipe: EditableRecipe }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state !== 'idle';
  const v = recipe.currentVersion;
  const [error, setError] = useState('');
  const [bumpVersion, setBumpVersion] = useState(false);

  const [title, setTitle] = useState(recipe.title);
  const [visibility, setVisibility] = useState<Visibility>(recipe.visibility as Visibility);
  const [brewMethod, setBrewMethod] = useState<BrewMethod>(v.brewMethod as BrewMethod);
  const [drinkType, setDrinkType] = useState<DrinkType>(v.drinkType as DrinkType);
  const [productName, setProductName] = useState(v.productName || '');
  const [coffeeBrand, setCoffeeBrand] = useState(v.coffeeBrand || '');
  const [coffeeProcessing, setCoffeeProcessing] = useState(v.coffeeProcessing || '');
  const [grinder, setGrinder] = useState(v.grinder || '');
  const [grindSize, setGrindSize] = useState(v.grindSize || '');
  const [groundWeightGrams, setGroundWeightGrams] = useState(v.groundWeightGrams?.toString() || '');
  const [extractionTimeSeconds, setExtractionTimeSeconds] = useState(
    v.extractionTimeSeconds?.toString() || '',
  );
  const [extractionVolumeMl, setExtractionVolumeMl] = useState(
    v.extractionVolumeMl?.toString() || '',
  );
  const [tds, setTds] = useState(v.tds?.toString() || '');
  const [temperatureCelsius, setTemperatureCelsius] = useState(
    v.temperatureCelsius?.toString() || '',
  );
  const [personalNotes, setPersonalNotes] = useState(v.personalNotes || '');
  const [preparationNotes, setPreparationNotes] = useState(v.preparationNotes || '');
  const [rating, setRating] = useState(v.rating?.toString() || '');
  const [emojiTag, setEmojiTag] = useState<string>(v.emojiTag || '');
  const [tasteNoteIds, setTasteNoteIds] = useState<string[]>(() =>
    recipe.tasteNotes.map((n) => n.id),
  );
  // Pre-populate intensities from existing taste notes
  const [tasteNoteIntensities, setTasteNoteIntensities] = useState<Record<string, number>>(() =>
    Object.fromEntries(recipe.tasteNotes.map((n) => [n.id, n.intensity ?? 2])),
  );
  const [roastDate, setRoastDate] = useState(dateInput(v.roastDate));
  const [packageOpenDate, setPackageOpenDate] = useState(dateInput(v.packageOpenDate));
  const [grindDate, setGrindDate] = useState(dateInput(v.grindDate));
  const [brewerDetails, setBrewerDetails] = useState(v.brewerDetails || '');

  useActionFeedback(fetcher, {
    onSuccess: (result) => {
      if (result.ok) navigate(`/recipes/${result.slug}`);
    },
    onError: (result) => {
      if (!result.ok)
        setError(recipeFormErrorMessage(result, t, 'recipe.editPage.updateError', true));
    },
  });

  const compatibleDrinks = DRINK_TYPES_LIST.filter((d) => d.compatibleMethods.includes(brewMethod));

  /**
   * Builds the `RecipeUpdate` payload and submits it to the `/recipes/:id/edit` action; the
   * result (navigate or error list) is handled by `useActionFeedback` above.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    // Build the update payload. `RecipeUpdate` is `RecipeCreateObjectSchema`
    // (all fields optional) plus the required `bumpVersion` flag (Zod
    // `.default(false)` makes it non-optional in `z.infer`). Optional fields
    // are sent as `undefined` so the API preserves existing values.
    const data: RecipeUpdate = {
      title: title.trim(),
      visibility,
      brewMethod,
      drinkType,
      bumpVersion,
      productName: productName || undefined,
      coffeeBrand: coffeeBrand || undefined,
      coffeeProcessing: coffeeProcessing || undefined,
      grinder: grinder || undefined,
      grindSize: grindSize || undefined,
      brewerDetails: brewerDetails || undefined,
      groundWeightGrams: groundWeightGrams ? Number(groundWeightGrams) : undefined,
      extractionTimeSeconds: extractionTimeSeconds ? Number(extractionTimeSeconds) : undefined,
      extractionVolumeMl: extractionVolumeMl ? Number(extractionVolumeMl) : undefined,
      temperatureCelsius: temperatureCelsius ? Number(temperatureCelsius) : undefined,
      tds: tds !== '' ? Number(tds) : null,
      personalNotes: personalNotes || undefined,
      preparationNotes: preparationNotes.trim(),
      rating: rating ? Number(rating) : undefined,
      emojiTag: (emojiTag || undefined) as RecipeUpdate['emojiTag'],
      tasteNoteIds: tasteNoteIds.length > 0 ? tasteNoteIds : undefined,
      tasteNoteIntensities: tasteNoteIds.length > 0 ? tasteNoteIntensities : undefined,
      roastDate: roastDate || undefined,
      packageOpenDate: packageOpenDate || undefined,
      grindDate: grindDate || undefined,
    };
    // JSON round-trip drops the `undefined` fields, exactly as the HTTP body would.
    fetcher.submit(JSON.parse(JSON.stringify(data)), {
      method: 'post',
      encType: 'application/json',
      defaultShouldRevalidate: false,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title={t('recipe.edit')} />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('recipe.edit')}
      </h1>

      {error && <ErrorState message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card">
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={bumpVersion}
              onChange={(e) => setBumpVersion(e.target.checked)}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('recipe.editPage.bumpVersion')}
            </span>
          </label>
        </div>

        <Section title={t('recipe.form.basicInfo')}>
          <Field label={t('recipe.form.title')} required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
            />
          </Field>
          <Field label={t('recipe.visibility')}>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="input-field"
            >
              {VISIBILITY_STATES_LIST.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={t('recipe.form.brewConfig')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('recipe.brewMethod')} required>
              <select
                value={brewMethod}
                onChange={(e) => setBrewMethod(e.target.value as BrewMethod)}
                className="input-field"
              >
                {BREW_METHODS_LIST.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('recipe.drinkType')} required>
              <select
                value={drinkType}
                onChange={(e) => setDrinkType(e.target.value as DrinkType)}
                className="input-field"
              >
                {compatibleDrinks.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.coffeeIdentity')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('recipe.productName')}>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.coffeeBrand')}>
              <input
                type="text"
                value={coffeeBrand}
                onChange={(e) => setCoffeeBrand(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('bean.processing')}>
              <input
                type="text"
                value={coffeeProcessing}
                onChange={(e) => setCoffeeProcessing(e.target.value)}
                className="input-field"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label={t('recipe.roastDate')}>
              <input
                type="date"
                value={roastDate}
                onChange={(e) => setRoastDate(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.packageOpenDate')}>
              <input
                type="date"
                value={packageOpenDate}
                onChange={(e) => setPackageOpenDate(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.grindDate')}>
              <input
                type="date"
                value={grindDate}
                onChange={(e) => setGrindDate(e.target.value)}
                className="input-field"
              />
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.brewParams')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('recipe.grinder')}>
              <input
                type="text"
                value={grinder}
                onChange={(e) => setGrinder(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.grindSize')}>
              <input
                type="text"
                value={grindSize}
                onChange={(e) => setGrindSize(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.mainBrewer')}>
              <input
                type="text"
                value={brewerDetails}
                onChange={(e) => setBrewerDetails(e.target.value)}
                className="input-field"
                placeholder={t('recipe.form.mainBrewerPlaceholder')}
              />
            </Field>
            <Field label={t('recipe.form.dose')}>
              <input
                type="number"
                value={groundWeightGrams}
                onChange={(e) => setGroundWeightGrams(e.target.value)}
                className="input-field"
                step="0.1"
                min="0"
              />
            </Field>
            <Field label={t('recipe.form.extractionTime')}>
              <input
                type="number"
                value={extractionTimeSeconds}
                onChange={(e) => setExtractionTimeSeconds(e.target.value)}
                className="input-field"
              />
            </Field>
            <Field label={t('recipe.form.yield')}>
              <input
                type="number"
                value={extractionVolumeMl}
                onChange={(e) => setExtractionVolumeMl(e.target.value)}
                className="input-field"
                step="0.1"
                min="0"
              />
            </Field>
            <Field label={t('recipe.form.temperature')}>
              <input
                type="number"
                value={temperatureCelsius}
                onChange={(e) => setTemperatureCelsius(e.target.value)}
                className="input-field"
                step="0.5"
              />
            </Field>
            <Field label={t('recipe.form.tds')}>
              <input
                type="number"
                value={tds}
                onChange={(e) => setTds(e.target.value)}
                className="input-field"
                placeholder={t('recipe.form.tds.placeholder')}
                step="0.01"
                min="0"
                max="25"
              />
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.tasteRating')}>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('recipe.form.rating')}>
              <input
                type="number"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="input-field"
                min="1"
                max="10"
              />
            </Field>
            <Field label={t('recipe.form.howDidItTaste')}>
              <select
                value={emojiTag}
                onChange={(e) => setEmojiTag(e.target.value)}
                className="input-field"
              >
                <option value="">{t('recipe.form.selectPlaceholder')}</option>
                {EMOJI_TAGS_LIST.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.emoji} {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <label
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t('recipe.tasteNotes')}
            </label>
            <TasteAutocomplete
              selectedIds={tasteNoteIds}
              onSelectionChange={setTasteNoteIds}
              intensities={tasteNoteIntensities}
              onIntensitiesChange={setTasteNoteIntensities}
            />
          </div>
        </Section>

        <Section title={t('recipe.preparationNotes')}>
          <textarea
            value={preparationNotes}
            onChange={(e) => setPreparationNotes(e.target.value)}
            className="input-field"
            rows={6}
            required
          />
        </Section>

        <Section title={t('recipe.brewerNotes')}>
          <p
            id={BREWER_NOTES_HINT_ID}
            className="text-sm mb-2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {t('recipe.brewerNotes.hint')}
          </p>
          <textarea
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            className="input-field"
            rows={4}
            aria-label={t('recipe.brewerNotes')}
            aria-describedby={BREWER_NOTES_HINT_ID}
          />
        </Section>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('common.saving') : t('common.saveChanges')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
