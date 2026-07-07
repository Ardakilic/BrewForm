import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { ApiError } from '../../api/client.ts';
import { beanApi, equipmentApi, recipeApi, setupApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete.tsx';
import { Field, Section } from '../../components/form/index.ts';
import { createLogger } from '../../utils/logger.ts';
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  EMOJI_TAGS_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';
import type {
  EquipmentOutput,
  RecipeCreate,
  RecipeDetailOutput,
  SetupOutput,
} from '@brewform/shared/schemas';

const log = createLogger('RecipeCreatePage');

/** Multi-step form for creating a new brew recipe with bean info, brew parameters, equipment selection, taste notes, and preparation instructions. */
export function RecipeCreatePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  // Equipment & Setup state
  const [equipmentList, setEquipmentList] = useState<EquipmentOutput[]>([]);
  const [setupList, setSetupList] = useState<SetupOutput[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedSetupId, setSelectedSetupId] = useState(searchParams.get('setupId') || '');
  const [equipLoading, setEquipLoading] = useState(true);
  const [equipError, setEquipError] = useState('');

  useEffect(() => {
    log.debug({}, 'RecipeCreatePage mounted');
    return () => {
      log.debug({}, 'RecipeCreatePage unmounted');
    };
  }, []);

  useEffect(() => {
    Promise.all([
      equipmentApi.list().then((data) => {
        if (Array.isArray(data) && data.every((item) => typeof item.id === 'string')) {
          setEquipmentList(data);
        } else {
          setEquipError(t('recipe.form.equipmentLoadError'));
        }
      }).catch(() => setEquipError(t('recipe.form.equipmentLoadError'))),
      setupApi.list().then((data) => {
        if (Array.isArray(data) && data.every((item) => typeof item.id === 'string')) {
          setSetupList(data);
        } else {
          setEquipError(t('recipe.createPage.setupLoadError'));
        }
      }).catch(() => setEquipError(t('recipe.createPage.setupLoadError'))),
    ]).finally(() => setEquipLoading(false));
  }, []);

  // Pre-fill bean info from URL param
  useEffect(() => {
    const beanId = searchParams.get('beanId');
    if (!beanId) return;
    beanApi.get(beanId).then((data) => {
      if (data && typeof data === 'object') {
        const bean = data as Record<string, unknown>;
        if (bean.name) setProductName(String(bean.name));
        if (bean.brand) setCoffeeBrand(String(bean.brand));
        else if (bean.roaster) setCoffeeBrand(String(bean.roaster));
        if (bean.processing) setCoffeeProcessing(String(bean.processing));
      }
    }).catch((err) => {
      log.error({ err, beanId }, 'Failed to pre-fill bean info from URL param');
    });
  }, []);

  // Auto-fill grinder and brewerDetails when setup changes
  useEffect(() => {
    if (!selectedSetupId) return;
    const setup = setupList.find((s) => s.id === selectedSetupId);
    if (!setup) return;
    if (setup.grinder) setGrinder(setup.grinder);
    if (setup.brewerDetails) {
      setBrewerDetailsFromSetup(setup.brewerDetails);
    }
  }, [selectedSetupId, setupList]);

  const compatibleDrinks = DRINK_TYPES_LIST.filter((d) => d.compatibleMethods.includes(brewMethod));

  useEffect(() => {
    if (!compatibleDrinks.some((d) => d.value === drinkType)) {
      setDrinkType(compatibleDrinks[0]?.value || 'espresso');
    }
  }, [brewMethod]);

  /** Toggles an equipment item in the selected equipment set. */
  function toggleEquipment(id: string) {
    setSelectedEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  /** Applies brewer details from the selected setup to the form state. */
  function setBrewerDetailsFromSetup(value: string) {
    // brewerDetails is not a separate state field in the form —
    // it's part of the Brew Parameters section as a free-text input.
    // We'll store it alongside grinder for now; the parameter card
    // on the detail page renders it if present.
    // Actually, looking at the form, there is NO brewerDetails input.
    // Let's add one in the Brew Parameters section.
    setBrewerDetails(value);
  }

  const [brewerDetails, setBrewerDetails] = useState('');

  /** Validates and submits the recipe creation form. On success navigates to the new recipe page; on failure displays validation or network errors. */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
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
      };
      const result: RecipeDetailOutput = await recipeApi.create(data);
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const messages = err.details.map((d) => `${d.field}: ${d.message}`);
        setError(messages.join('\n'));
      } else {
        const message = err instanceof Error ? err.message : t('recipe.createPage.error');
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('recipe.create')} />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        {t('recipe.createPage.heading')}
      </h1>

      {error && (
        <div
          className='mb-4 rounded p-3 text-sm'
          style={{ backgroundColor: 'var(--error)', color: 'white' }}
        >
          {typeof error === 'string' && error.includes('\n')
            ? (
              <ul className='list-disc pl-4 space-y-1'>
                {error.split('\n').map((line, i) => line && <li key={i}>{line}</li>)}
              </ul>
            )
            : error}
        </div>
      )}

      <form onSubmit={handleSubmit} className='space-y-6'>
        <Section title={t('recipe.form.basicInfo')}>
          <Field label={t('recipe.form.title')} required>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='input-field'
              placeholder={t('recipe.form.titlePlaceholder')}
            />
          </Field>
          <Field label={t('recipe.visibility')}>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className='input-field'
            >
              {VISIBILITY_STATES_LIST.map((v) => (
                <option key={v.value} value={v.value}>{v.label} — {v.description}</option>
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

        <Section title={t('recipe.form.equipmentSetup')}>
          {equipLoading
            ? (
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                {t('recipe.form.loadingEquipment')}
              </p>
            )
            : equipError
            ? <p className='text-sm' style={{ color: 'var(--error)' }}>{equipError}</p>
            : (
              <>
                <Field label={t('recipe.form.setupAutofill')}>
                  <select
                    value={selectedSetupId}
                    onChange={(e) => setSelectedSetupId(e.target.value)}
                    className='input-field'
                  >
                    <option value=''>{t('recipe.form.none')}</option>
                    {setupList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t('equipment.title')}>
                  <div className='space-y-2 mt-1'>
                    {equipmentList.length === 0
                      ? (
                        <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
                          {t('recipe.form.noEquipment')}
                        </p>
                      )
                      : (
                        equipmentList.map((eq) => (
                          <label
                            key={eq.id}
                            className='flex items-center gap-2 text-sm cursor-pointer'
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            <input
                              type='checkbox'
                              checked={selectedEquipmentIds.includes(eq.id)}
                              onChange={() => toggleEquipment(eq.id)}
                              className='rounded'
                            />
                            <span>{eq.name}</span>
                            <span className='text-xs' style={{ color: 'var(--text-tertiary)' }}>
                              ({eq.type})
                            </span>
                          </label>
                        ))
                      )}
                  </div>
                </Field>
              </>
            )}
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
                placeholder={t('recipe.form.processingPlaceholder')}
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
            placeholder={t('recipe.form.preparationPlaceholder')}
            required
          />
        </Section>

        <Section title={t('recipe.personalNotes')}>
          <textarea
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            className='input-field'
            rows={4}
            placeholder={t('recipe.form.personalNotesPlaceholder')}
          />
        </Section>

        <div className='flex gap-3'>
          <button type='submit' className='btn-primary' disabled={loading}>
            {loading ? t('recipe.createPage.creating') : t('recipe.createPage.submit')}
          </button>
          <button type='button' onClick={() => navigate(-1)} className='btn-secondary'>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
