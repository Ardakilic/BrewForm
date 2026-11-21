import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  EMOJI_TAGS_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import type {
  BeanOutput,
  EquipmentOutput,
  RecipeCreate,
  SetupOutput,
} from '@brewform/shared/schemas';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';
import { useEffect, useState } from 'react';
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from 'react-router';
import { Field, Section } from '../../components/form/index.ts';
import {
  CoffeeVarietyPicker,
  type CoffeeVarietySelection,
} from '../../components/recipe/CoffeeVarietyPicker.tsx';
import { EquipmentPicker } from '../../components/recipe/EquipmentPicker.tsx';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete.tsx';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { createLogger } from '../../utils/logger.ts';
import type { action, loader } from './RecipeCreatePage.data.ts';
import { recipeFormErrorMessage } from './recipe-form-errors.ts';

const log = createLogger('RecipeCreatePage');

/** Id of the public brewer-notes hint, referenced by the textarea's `aria-describedby`. */
const BREWER_NOTES_HINT_ID = 'recipe-brewer-notes-hint';

/**
 * `/recipes/new`: the recipe creation form. The equipment lookup, the user's setups and the
 * optional `?beanId` bean come from the route loader (`RecipeCreatePage.data.ts`); saving
 * submits the `RecipeCreate` payload to the route action and navigates to the new recipe on
 * `{ ok: true }`, or lists the validation/API errors on `{ ok: false }`. The form is keyed by
 * the bean so a different `?beanId` re-seeds the pre-filled coffee fields.
 */
export function RecipeCreatePage() {
  const { equipment, setups, bean } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    log.debug({}, 'RecipeCreatePage mounted');
    return () => {
      log.debug({}, 'RecipeCreatePage unmounted');
    };
  }, []);

  return (
    <RecipeCreateForm
      key={bean?.id ?? 'no-bean'}
      equipmentList={equipment}
      setupList={setups}
      bean={bean}
      initialSetupId={searchParams.get('setupId') || ''}
    />
  );
}

/** Props of {@link RecipeCreateForm}: the loader's lookups and the initial selections. */
interface RecipeCreateFormProps {
  equipmentList: EquipmentOutput[];
  setupList: SetupOutput[];
  /**
   * The `?beanId` bean whose name, brand/roaster and processing pre-fill the form; its id is
   * sent as `beanId` so the new recipe stays linked to it.
   */
  bean: BeanOutput | null;
  /** The `?setupId` setup selected (and auto-filled) on open. */
  initialSetupId: string;
}

/**
 * Multi-step form for creating a new brew recipe with bean info, coffee variety, brew
 * parameters, equipment selection, taste notes, and preparation instructions. Submits through
 * the `/recipes/new` route action with a fetcher; a recipe opened from a bean (`?beanId=`) is
 * created linked to that bean.
 */
function RecipeCreateForm({
  equipmentList,
  setupList,
  bean,
  initialSetupId,
}: RecipeCreateFormProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state !== 'idle';
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('draft');
  const [brewMethod, setBrewMethod] = useState<BrewMethod>('espresso_machine');
  const [drinkType, setDrinkType] = useState<DrinkType>('espresso');
  const [productName, setProductName] = useState(bean?.name ?? '');
  const [coffeeBrand, setCoffeeBrand] = useState(bean?.brand || bean?.roaster || '');
  const [coffeeProcessing, setCoffeeProcessing] = useState(bean?.processing ?? '');
  const [grinder, setGrinder] = useState('');
  const [grindSize, setGrindSize] = useState('');
  const [groundWeightGrams, setGroundWeightGrams] = useState('');
  const [extractionTimeSeconds, setExtractionTimeSeconds] = useState('');
  const [extractionVolumeMl, setExtractionVolumeMl] = useState('');
  const [tds, setTds] = useState('');
  const [temperatureCelsius, setTemperatureCelsius] = useState('');
  const [personalNotes, setPersonalNotes] = useState('');
  const [preparationNotes, setPreparationNotes] = useState('');
  const [rating, setRating] = useState('');
  const [emojiTag, setEmojiTag] = useState('');
  const [tasteNoteIds, setTasteNoteIds] = useState<string[]>([]);
  const [tasteNoteIntensities, setTasteNoteIntensities] = useState<Record<string, number>>({});
  const [roastDate, setRoastDate] = useState('');
  const [packageOpenDate, setPackageOpenDate] = useState('');
  const [grindDate, setGrindDate] = useState('');
  const [brewerDetails, setBrewerDetails] = useState('');

  // Equipment & Setup selections
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedSetupId, setSelectedSetupId] = useState(initialSetupId);
  const [coffeeVariety, setCoffeeVariety] = useState<CoffeeVarietySelection | null>(null);

  useActionFeedback(fetcher, {
    onSuccess: (result) => {
      if (result.ok) navigate(`/recipes/${result.slug}`);
    },
    onError: (result) => {
      if (!result.ok) setError(recipeFormErrorMessage(result, t, 'recipe.createPage.error'));
    },
  });

  // Auto-fill grinder and brewerDetails when setup changes
  useEffect(() => {
    if (!selectedSetupId) return;
    const setup = setupList.find((s) => s.id === selectedSetupId);
    if (!setup) return;
    if (setup.grinder) setGrinder(setup.grinder);
    if (setup.brewerDetails) {
      setBrewerDetails(setup.brewerDetails);
    }
  }, [selectedSetupId, setupList]);

  const compatibleDrinks = DRINK_TYPES_LIST.filter((d) => d.compatibleMethods.includes(brewMethod));

  useEffect(() => {
    const compatible = DRINK_TYPES_LIST.filter((d) => d.compatibleMethods.includes(brewMethod));
    if (!compatible.some((d) => d.value === drinkType)) {
      setDrinkType(compatible[0]?.value || 'espresso');
    }
  }, [brewMethod, drinkType]);

  /**
   * Builds the `RecipeCreate` payload and submits it to the `/recipes/new` action. The
   * action's result (navigate on success, error list on failure) is handled by
   * `useActionFeedback` above.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    // Build the create payload. Optional fields are sent as `undefined` so the
    // API applies Zod defaults; only `title`, `visibility`, `brewMethod`,
    // `drinkType`, `preparationNotes`, and `isFavourite` are required by the
    // `RecipeCreate` output contract (Zod `.default` makes them non-optional
    // in `z.infer`).
    const data: RecipeCreate = {
      title: title.trim(),
      visibility,
      brewMethod,
      drinkType,
      isFavourite: false,
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
      tds: tds ? Number(tds) : undefined,
      personalNotes: personalNotes || undefined,
      preparationNotes: preparationNotes.trim(),
      rating: rating ? Number(rating) : undefined,
      emojiTag: (emojiTag || undefined) as RecipeCreate['emojiTag'],
      tasteNoteIds: tasteNoteIds.length > 0 ? tasteNoteIds : undefined,
      tasteNoteIntensities: tasteNoteIds.length > 0 ? tasteNoteIntensities : undefined,
      roastDate: roastDate || undefined,
      packageOpenDate: packageOpenDate || undefined,
      grindDate: grindDate || undefined,
      equipmentIds: selectedEquipmentIds.length > 0 ? selectedEquipmentIds : undefined,
      setupId: selectedSetupId || undefined,
      beanId: bean?.id,
      coffeeVarietyId: coffeeVariety?.id,
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
      <SEOHead title={t('recipe.create')} />
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        {t('recipe.createPage.heading')}
      </h1>

      {error && <ErrorState message={error} className="mb-4" />}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title={t('recipe.form.basicInfo')}>
          <Field label={t('recipe.form.title')} required>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder={t('recipe.form.titlePlaceholder')}
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
                  {v.label} — {v.description}
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

        <Section title={t('recipe.form.equipmentSetup')}>
          <Field label={t('recipe.form.setupAutofill')}>
            <select
              value={selectedSetupId}
              onChange={(e) => setSelectedSetupId(e.target.value)}
              className="input-field"
            >
              <option value="">{t('recipe.form.none')}</option>
              {setupList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <EquipmentPicker
            equipment={equipmentList}
            selectedIds={selectedEquipmentIds}
            onChange={setSelectedEquipmentIds}
          />
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
                placeholder={t('recipe.form.processingPlaceholder')}
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
          <div className="mt-4">
            <CoffeeVarietyPicker value={coffeeVariety} onChange={setCoffeeVariety} />
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
            placeholder={t('recipe.form.preparationPlaceholder')}
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
            placeholder={t('recipe.form.personalNotesPlaceholder')}
            aria-label={t('recipe.brewerNotes')}
            aria-describedby={BREWER_NOTES_HINT_ID}
          />
        </Section>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? t('recipe.createPage.creating') : t('recipe.createPage.submit')}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
