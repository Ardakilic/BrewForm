import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { ApiError } from '../../api/client';
import { beanApi, equipmentApi, recipeApi, setupApi } from '../../api/index';
import { SEOHead } from '../../components/seo/SEOHead';
import { TasteAutocomplete } from '../../components/taste/TasteAutocomplete';
import {
  BREW_METHODS_LIST,
  DRINK_TYPES_LIST,
  EMOJI_TAGS_LIST,
  VISIBILITY_STATES_LIST,
} from '@brewform/shared/constants';
import type { BrewMethod, DrinkType, Visibility } from '@brewform/shared/types';
import type { EquipmentListItem, SetupListItem } from '../../api/types.ts';

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
  const [equipmentList, setEquipmentList] = useState<EquipmentListItem[]>([]);
  const [setupList, setSetupList] = useState<SetupListItem[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedSetupId, setSelectedSetupId] = useState(searchParams.get('setupId') || '');
  const [equipLoading, setEquipLoading] = useState(true);
  const [equipError, setEquipError] = useState('');

  useEffect(() => {
    Promise.all([
      equipmentApi.list().then((data) => {
        if (Array.isArray(data) && data.every((item) => typeof item.id === 'string')) {
          setEquipmentList(data as EquipmentListItem[]);
        } else {
          setEquipError('Failed to load equipment');
        }
      }).catch(() => setEquipError('Failed to load equipment')),
      setupApi.list().then((data) => {
        if (Array.isArray(data) && data.every((item) => typeof item.id === 'string')) {
          setSetupList(data as SetupListItem[]);
        } else {
          setEquipError('Failed to load setups');
        }
      }).catch(() => setEquipError('Failed to load setups')),
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
    }).catch(() => {});
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
      setDrinkType(compatibleDrinks[0]?.value as DrinkType || 'espresso');
    }
  }, [brewMethod]);

  function toggleEquipment(id: string) {
    setSelectedEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data: Record<string, unknown> = {
        title: title.trim(),
        visibility,
        brewMethod,
        drinkType,
        ...(productName ? { productName } : {}),
        ...(coffeeBrand ? { coffeeBrand } : {}),
        ...(coffeeProcessing ? { coffeeProcessing } : {}),
        ...(grinder ? { grinder } : {}),
        ...(grindSize ? { grindSize } : {}),
        ...(brewerDetails ? { brewerDetails } : {}),
        ...(groundWeightGrams ? { groundWeightGrams: Number(groundWeightGrams) } : {}),
        ...(extractionTimeSeconds ? { extractionTimeSeconds: Number(extractionTimeSeconds) } : {}),
        ...(extractionVolumeMl ? { extractionVolumeMl: Number(extractionVolumeMl) } : {}),
        ...(temperatureCelsius ? { temperatureCelsius: Number(temperatureCelsius) } : {}),
        ...(tds ? { tds: Number(tds) } : {}),
        ...(personalNotes ? { personalNotes } : {}),
        preparationNotes: preparationNotes.trim(),
        ...(rating ? { rating: Number(rating) } : {}),
        ...(emojiTag ? { emojiTag } : {}),
        ...(tasteNoteIds.length > 0 ? { tasteNoteIds, tasteNoteIntensities } : {}),
        ...(roastDate ? { roastDate } : {}),
        ...(packageOpenDate ? { packageOpenDate } : {}),
        ...(grindDate ? { grindDate } : {}),
        ...(selectedEquipmentIds.length > 0 ? { equipmentIds: selectedEquipmentIds } : {}),
        ...(selectedSetupId ? { setupId: selectedSetupId } : {}),
      };
      const result = await recipeApi.create(data) as Record<string, unknown>;
      navigate(`/recipes/${result.slug}`);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        const messages = err.details.map((d) => `${d.field}: ${d.message}`);
        setError(messages.join('\n'));
      } else {
        const message = err instanceof Error ? err.message : 'Failed to create recipe';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title='New Recipe' />
      <h1 className='text-2xl font-bold mb-6' style={{ color: 'var(--text-primary)' }}>
        Create Recipe
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
        <Section title='Basic Info'>
          <Field label='Title' required>
            <input
              type='text'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className='input-field'
              placeholder='My Espresso Recipe'
            />
          </Field>
          <Field label='Visibility'>
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

        <Section title='Brew Configuration'>
          <div className='grid grid-cols-2 gap-4'>
            <Field label='Brew Method' required>
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
            <Field label='Drink Type' required>
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

        <Section title='Equipment & Setup'>
          {equipLoading
            ? (
              <p className='text-sm' style={{ color: 'var(--text-secondary)' }}>
                Loading equipment...
              </p>
            )
            : equipError
            ? <p className='text-sm' style={{ color: 'var(--error)' }}>{equipError}</p>
            : (
              <>
                <Field label='Setup (auto-fills grinder & brewer)'>
                  <select
                    value={selectedSetupId}
                    onChange={(e) => setSelectedSetupId(e.target.value)}
                    className='input-field'
                  >
                    <option value=''>None</option>
                    {setupList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.isDefault ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label='Equipment'>
                  <div className='space-y-2 mt-1'>
                    {equipmentList.length === 0
                      ? (
                        <p className='text-sm' style={{ color: 'var(--text-tertiary)' }}>
                          No equipment yet. Add some in your profile.
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

        <Section title='Coffee Identity'>
          <div className='grid grid-cols-2 gap-4'>
            <Field label='Product Name'>
              <input
                type='text'
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Coffee Brand'>
              <input
                type='text'
                value={coffeeBrand}
                onChange={(e) => setCoffeeBrand(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Processing'>
              <input
                type='text'
                value={coffeeProcessing}
                onChange={(e) => setCoffeeProcessing(e.target.value)}
                className='input-field'
                placeholder='e.g. washed, natural, honey'
              />
            </Field>
          </div>
          <div className='grid grid-cols-2 gap-4 mt-4'>
            <Field label='Roast Date'>
              <input
                type='date'
                value={roastDate}
                onChange={(e) => setRoastDate(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Package Open Date'>
              <input
                type='date'
                value={packageOpenDate}
                onChange={(e) => setPackageOpenDate(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Grind Date'>
              <input
                type='date'
                value={grindDate}
                onChange={(e) => setGrindDate(e.target.value)}
                className='input-field'
              />
            </Field>
          </div>
        </Section>

        <Section title='Brew Parameters'>
          <div className='grid grid-cols-2 gap-4'>
            <Field label='Grinder'>
              <input
                type='text'
                value={grinder}
                onChange={(e) => setGrinder(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Grind Size'>
              <input
                type='text'
                value={grindSize}
                onChange={(e) => setGrindSize(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Main Brewer'>
              <input
                type='text'
                value={brewerDetails}
                onChange={(e) => setBrewerDetails(e.target.value)}
                className='input-field'
                placeholder='e.g. 58mm portafilter, 20g basket'
              />
            </Field>
            <Field label='Dose (grams)'>
              <input
                type='number'
                value={groundWeightGrams}
                onChange={(e) => setGroundWeightGrams(e.target.value)}
                className='input-field'
                step='0.1'
                min='0'
              />
            </Field>
            <Field label='Extraction Time (seconds)'>
              <input
                type='number'
                value={extractionTimeSeconds}
                onChange={(e) => setExtractionTimeSeconds(e.target.value)}
                className='input-field'
              />
            </Field>
            <Field label='Yield (ml)'>
              <input
                type='number'
                value={extractionVolumeMl}
                onChange={(e) => setExtractionVolumeMl(e.target.value)}
                className='input-field'
                step='0.1'
                min='0'
              />
            </Field>
            <Field label='Temperature (°C)'>
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

        <Section title='Taste & Rating'>
          <div className='grid grid-cols-2 gap-4'>
            <Field label='Rating (1-10)'>
              <input
                type='number'
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className='input-field'
                min='1'
                max='10'
              />
            </Field>
            <Field label='How did it taste?'>
              <select
                value={emojiTag}
                onChange={(e) => setEmojiTag(e.target.value)}
                className='input-field'
              >
                <option value=''>Select...</option>
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
              Taste Notes
            </label>
            <TasteAutocomplete
              selectedIds={tasteNoteIds}
              onSelectionChange={setTasteNoteIds}
              intensities={tasteNoteIntensities}
              onIntensitiesChange={setTasteNoteIntensities}
            />
          </div>
        </Section>

        <Section title='Preparation Notes'>
          <textarea
            value={preparationNotes}
            onChange={(e) => setPreparationNotes(e.target.value)}
            className='input-field'
            rows={6}
            placeholder='Step-by-step instructions on how to prepare this recipe...'
            required
          />
        </Section>

        <Section title='Personal Notes'>
          <textarea
            value={personalNotes}
            onChange={(e) => setPersonalNotes(e.target.value)}
            className='input-field'
            rows={4}
            placeholder='Tips, observations, things to try next time...'
          />
        </Section>

        <div className='flex gap-3'>
          <button type='submit' className='btn-primary' disabled={loading}>
            {loading ? 'Creating...' : 'Create Recipe'}
          </button>
          <button type='button' onClick={() => navigate(-1)} className='btn-secondary'>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='card'>
      <h2 className='font-semibold mb-4' style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </div>
  );
}

function Field(
  { label, required, children }: { label: string; required?: boolean; children: React.ReactNode },
) {
  return (
    <div>
      <label className='block text-sm font-medium mb-1' style={{ color: 'var(--text-secondary)' }}>
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  );
}
