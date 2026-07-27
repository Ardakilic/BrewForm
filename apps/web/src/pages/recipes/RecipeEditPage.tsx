import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { createLogger } from '@/utils/logger.ts';
import { ApiError } from '../../api/client.ts';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete.tsx';
import { Field, Section } from '../../components/form/index.ts';
import { ErrorState } from '../../components/ui/ErrorState.tsx';
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  EMOJI_TAGS_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';
import type { RecipeDetailOutput, RecipeUpdate } from '@brewform/shared/schemas';

const log = createLogger('RecipeEditPage');

/**
 * Recipe edit form pre-filled from the current version; saving can
 * optionally bump a new version. Navigates back to the recipe on
 * success.
 */
export function RecipeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [bumpVersion, setBumpVersion] = useState(false);

  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('draft');
  const [brewMethod, setBrewMethod] = useState<BrewMethod>('espresso_machine');
  const [drinkType, setDrinkType] = useState<DrinkType>('espresso');
  const [productName, setProductName] = useState('');
  const [coffeeBrand, setCoffeeBrand] = useState('');
  const [coffeeProcessing, setCoffeeProcessing] = useState('');
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

  useEffect(() => {
    log.debug({}, 'RecipeEditPage mounted');
    return () => {
      log.debug({}, 'RecipeEditPage unmounted');
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    recipeApi.get(id).then((r: RecipeDetailOutput) => {
      if (!r.currentVersion) {
        setError(t('recipe.editPage.noVersions'));
        setFetching(false);
        return;
      }
      setTitle(r.title);
      setVisibility(r.visibility as Visibility);
      setBrewMethod(r.currentVersion.brewMethod as BrewMethod);
      setDrinkType(r.currentVersion.drinkType as DrinkType);
      setProductName(r.currentVersion.productName || '');
      setCoffeeBrand(r.currentVersion.coffeeBrand || '');
      setCoffeeProcessing(r.currentVersion.coffeeProcessing || '');
      setGrinder(r.currentVersion.grinder || '');
      setGrindSize(r.currentVersion.grindSize || '');
      setBrewerDetails(r.currentVersion.brewerDetails || '');
      setGroundWeightGrams(r.currentVersion.groundWeightGrams?.toString() || '');
      setExtractionTimeSeconds(r.currentVersion.extractionTimeSeconds?.toString() || '');
      setExtractionVolumeMl(r.currentVersion.extractionVolumeMl?.toString() || '');
      setTds(r.currentVersion.tds?.toString() || '');
      setTemperatureCelsius(r.currentVersion.temperatureCelsius?.toString() || '');
      setPersonalNotes(r.currentVersion.personalNotes || '');
      setPreparationNotes(r.currentVersion.preparationNotes || '');
      setRating(r.currentVersion.rating?.toString() || '');
      setEmojiTag(r.currentVersion.emojiTag || '');
      setTasteNoteIds(r.tasteNotes.map((t) => t.id));
      // Pre-populate intensities from existing taste notes
      const existingIntensities: Record<string, number> = {};
      for (const t of r.tasteNotes) {
        existingIntensities[t.id] = t.intensity ?? 2;
      }
      setTasteNoteIntensities(existingIntensities);
      setRoastDate(r.currentVersion.roastDate ? r.currentVersion.roastDate.slice(0, 10) : '');
      setPackageOpenDate(
        r.currentVersion.packageOpenDate ? r.currentVersion.packageOpenDate.slice(0, 10) : '',
      );
      setGrindDate(r.currentVersion.grindDate ? r.currentVersion.grindDate.slice(0, 10) : '');
    }).catch(() => {
      setError(t('recipe.editPage.loadError'));
    }).finally(() => setFetching(false));
  }, [id]);

  const compatibleDrinks = DRINK_TYPES_LIST.filter((d) => d.compatibleMethods.includes(brewMethod));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
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
      const result: RecipeDetailOutput = await recipeApi.update(id, data);
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const messages = err.details.map((d) => `${d.field}: ${d.message}`);
        setError(messages.map((m) => `• ${m}`).join('\n'));
      } else {
        const message = err instanceof Error ? err.message : t('recipe.editPage.updateError');
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div
        className='mx-auto max-w-2xl px-6 py-12 text-center'
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('recipe.edit')} />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.edit')}
      </h1>

      {error && <ErrorState message={error} className='mb-4' />}

      <form onSubmit={handleSubmit} className='space-y-6'>
        <div className='card'>
          <label className='flex items-center gap-2 mb-4 cursor-pointer'>
            <input
              type='checkbox'
              checked={bumpVersion}
              onChange={(e) => setBumpVersion(e.target.checked)}
            />
            <span className='text-sm' style={{ color: 'var(--text-secondary)' }}>
              {t('recipe.editPage.bumpVersion')}
            </span>
          </label>
        </div>

        <Section title={t('recipe.form.basicInfo')}>
          <Field label={t('recipe.form.title')} required>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='input-field'
            />
          </Field>
          <Field label={t('recipe.visibility')}>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className='input-field'
            >
              {VISIBILITY_STATES_LIST.map((v) => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title={t('recipe.form.brewConfig')}>
          <div className='grid grid-cols-2 gap-4'>
            <Field label={t('recipe.brewMethod')} required>
              <select
                value={brewMethod}
                onChange={(e) => setBrewMethod(e.target.value as BrewMethod)}
                className='input-field'
              >
                {BREW_METHODS_LIST.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </Field>
            <Field label={t('recipe.drinkType')} required>
              <select
                value={drinkType}
                onChange={(e) => setDrinkType(e.target.value as DrinkType)}
                className='input-field'
              >
                {compatibleDrinks.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.coffeeIdentity')}>
          <div className='grid grid-cols-2 gap-4'>
            <Field label={t('recipe.productName')}>
              <input
                type='text'
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.coffeeBrand')}>
              <input
                type='text'
                value={coffeeBrand}
                onChange={(e) => setCoffeeBrand(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('bean.processing')}>
              <input
                type='text'
                value={coffeeProcessing}
                onChange={(e) => setCoffeeProcessing(e.target.value)}
                className='input-field'
              />
            </Field>
          </div>
          <div className='grid grid-cols-2 gap-4 mt-4'>
            <Field label={t('recipe.roastDate')}>
              <input
                type='date'
                value={roastDate}
                onChange={(e) => setRoastDate(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.packageOpenDate')}>
              <input
                type='date'
                value={packageOpenDate}
                onChange={(e) => setPackageOpenDate(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.grindDate')}>
              <input
                type='date'
                value={grindDate}
                onChange={(e) => setGrindDate(e.target.value)}
                className='input-field'
              />
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.brewParams')}>
          <div className='grid grid-cols-2 gap-4'>
            <Field label={t('recipe.grinder')}>
              <input
                type='text'
                value={grinder}
                onChange={(e) => setGrinder(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.grindSize')}>
              <input
                type='text'
                value={grindSize}
                onChange={(e) => setGrindSize(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.mainBrewer')}>
              <input
                type='text'
                value={brewerDetails}
                onChange={(e) => setBrewerDetails(e.target.value)}
                className='input-field'
                placeholder={t('recipe.form.mainBrewerPlaceholder')}
              />
            </Field>
            <Field label={t('recipe.form.dose')}>
              <input
                type='number'
                value={groundWeightGrams}
                onChange={(e) => setGroundWeightGrams(e.target.value)}
                className='input-field'
                step='0.1'
                min='0'
              />
            </Field>
            <Field label={t('recipe.form.extractionTime')}>
              <input
                type='number'
                value={extractionTimeSeconds}
                onChange={(e) => setExtractionTimeSeconds(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label={t('recipe.form.yield')}>
              <input
                type='number'
                value={extractionVolumeMl}
                onChange={(e) => setExtractionVolumeMl(e.target.value)}
                className='input-field'
                step='0.1'
                min='0'
              />
            </Field>
            <Field label={t('recipe.form.temperature')}>
              <input
                type='number'
                value={temperatureCelsius}
                onChange={(e) => setTemperatureCelsius(e.target.value)}
                className='input-field'
                step='0.5'
              />
            </Field>
            <Field label={t('recipe.form.tds')}>
              <input
                type='number'
                value={tds}
                onChange={(e) => setTds(e.target.value)}
                className='input-field'
                placeholder={t('recipe.form.tds.placeholder')}
                step='0.01'
                min='0'
                max='25'
              />
            </Field>
          </div>
        </Section>

        <Section title={t('recipe.form.tasteRating')}>
          <div className='grid grid-cols-2 gap-4'>
            <Field label={t('recipe.form.rating')}>
              <input
                type='number'
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className='input-field'
                min='1'
                max='10'
              />
            </Field>
            <Field label={t('recipe.form.howDidItTaste')}>
              <select
                value={emojiTag}
                onChange={(e) => setEmojiTag(e.target.value)}
                className='input-field'
              >
                <option value=''>{t('recipe.form.selectPlaceholder')}</option>
                {EMOJI_TAGS_LIST.map((t) => (
                  <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className='mt-4'>
            <label
              className='block text-sm font-medium mb-1'
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
            className='input-field'
            rows={6}
            required
          />
        </Section>

        <Section title={t('recipe.personalNotes')}>
          <textarea
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            className='input-field'
            rows={4}
          />
        </Section>

        <div className='flex gap-3'>
          <button type='submit' className='btn-primary' disabled={loading}>
            {loading ? t('common.saving') : t('common.saveChanges')}
          </button>
          <button type='button' onClick={() => navigate(-1)} className='btn-secondary'>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
