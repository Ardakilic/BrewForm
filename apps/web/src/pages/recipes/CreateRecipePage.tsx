/**
 * BrewForm Create Recipe Page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from '../../components/Card';
import { FormControl } from 'baseui/form-control';
import { Input } from 'baseui/input';
import { Textarea } from 'baseui/textarea';
import { Select } from 'baseui/select';
import { Button } from 'baseui/button';
import { HeadingLarge, } from 'baseui/typography';
import { Notification, KIND } from 'baseui/notification';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { api } from '../../utils/api';
import TasteNoteAutocomplete, { type TasteNote } from '../../components/TasteNoteAutocomplete';

const BREW_METHOD_IDS = [
  'ESPRESSO_MACHINE',
  'POUR_OVER_V60',
  'POUR_OVER_CHEMEX',
  'POUR_OVER_KALITA',
  'AEROPRESS',
  'FRENCH_PRESS',
  'MOKA_POT',
  'COLD_BREW',
] as const;

const DRINK_TYPE_IDS = [
  'ESPRESSO',
  'RISTRETTO',
  'LUNGO',
  'AMERICANO',
  'LATTE',
  'CAPPUCCINO',
  'FLAT_WHITE',
  'CORTADO',
  'POUR_OVER',
  'FRENCH_PRESS',
] as const;

const PROCESSING_METHOD_IDS = [
  'WASHED',
  'NATURAL',
  'HONEY',
  'SEMI_WASHED',
  'WET_HULLED',
  'ANAEROBIC',
  'CARBONIC_MACERATION',
  'OTHER',
] as const;

const TAG_IDS = [
  'morning',
  'afternoon',
  'evening',
  'fruity',
  'chocolatey',
  'nutty',
  'floral',
  'spicy',
  'sweet',
  'bold',
  'light',
  'creamy',
  'iced',
  'hot',
  'decaf',
  'singleOrigin',
  'blend',
  'espresso',
  'balanced',
  'bright',
  'complex',
  'smooth',
  'intense',
  'clean',
  'syrupy',
] as const;

function CreateRecipePage() {
  const [css] = useStyletron();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const BREW_METHODS = BREW_METHOD_IDS.map((id) => ({
    id,
    label: t(`recipe.brewMethods.${id}`),
  }));

  const DRINK_TYPES = DRINK_TYPE_IDS.map((id) => ({
    id,
    label: t(`recipe.drinkTypes.${id}`),
  }));

  const PROCESSING_METHODS = PROCESSING_METHOD_IDS.map((id) => ({
    id,
    label: t(`recipe.processingMethods.${id}`),
  }));

  const TAGS = TAG_IDS.map((id) => ({
    id,
    label: t(`recipe.tags.${id}`),
  }));

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brewMethod: [] as { id: string; label: string }[],
    drinkType: [] as { id: string; label: string }[],
    coffeeName: '',
    coffeeProcessing: [] as { id: string; label: string }[],
    grindSize: '',
    doseGrams: '',
    yieldGrams: '',
    brewTimeSec: '',
    tempCelsius: '',
    pressure: '',
    tastingNotes: '',
    rating: '',
    tags: [] as { id: string; label: string }[],
  });
  const [selectedTasteNotes, setSelectedTasteNotes] = useState<TasteNote[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleSelectChange = (field: string) => (params: { value: readonly { id?: string | number; label?: React.ReactNode }[] }) => {
    const validOptions = params.value.filter((opt): opt is { id: string; label: string } => 
      typeof opt.id === 'string' && typeof opt.label === 'string'
    );
    setFormData({ ...formData, [field]: validOptions });
  };

  const parseOptionalFloat = (value: string) => value ? Number.parseFloat(value) : undefined;
  const parseOptionalInt = (value: string) => value ? Number.parseInt(value) : undefined;
  const parseOptionalString = (value: string) => value || undefined;

  const buildRecipeData = () => ({
    visibility: 'PUBLIC',
    version: {
      title: formData.title,
      description: formData.description,
      brewMethod: formData.brewMethod[0]?.id,
      drinkType: formData.drinkType[0]?.id,
      coffeeName: parseOptionalString(formData.coffeeName),
      coffeeProcessing: formData.coffeeProcessing[0]?.id,
      grindSize: parseOptionalString(formData.grindSize),
      doseGrams: parseOptionalFloat(formData.doseGrams),
      yieldGrams: parseOptionalFloat(formData.yieldGrams),
      brewTimeSec: parseOptionalInt(formData.brewTimeSec),
      tempCelsius: parseOptionalFloat(formData.tempCelsius),
      pressure: parseOptionalString(formData.pressure),
      tastingNotes: parseOptionalString(formData.tastingNotes),
      rating: parseOptionalInt(formData.rating),
      tags: formData.tags.length > 0 ? formData.tags.map((t) => t.id) : undefined,
      tasteNoteIds: selectedTasteNotes.length > 0 ? selectedTasteNotes.map((n) => n.id) : undefined,
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/recipes', buildRecipeData());
      if (response.success && response.data) {
        navigate(`/recipes/${(response.data as { slug: string }).slug}`);
      } else {
        setError(response.error?.message || 'Failed to create recipe');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recipe');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t('pages.createRecipe.title')}</title>
      </Helmet>

      <div className={css({ maxWidth: '700px', margin: '0 auto' })}>
        <HeadingLarge marginBottom="24px">{t('recipe.create')}</HeadingLarge>

        <Card>
          {error && (
            <Notification kind={KIND.negative} closeable={false}>
              {error}
            </Notification>
          )}

          <form onSubmit={handleSubmit}>
            <FormControl label={t('recipe.fields.title')} caption={t('recipe.captions.required')}>
              <Input
                value={formData.title}
                onChange={handleChange('title')}
                required
                placeholder={t('recipe.placeholders.title')}
              />
            </FormControl>

            <FormControl label={t('recipe.fields.description')}>
              <Textarea
                value={formData.description}
                onChange={handleChange('description')}
                placeholder={t('recipe.placeholders.description')}
              />
            </FormControl>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={t('recipe.fields.brewMethod')} caption={t('recipe.captions.required')}>
                <Select
                  options={BREW_METHODS}
                  value={formData.brewMethod}
                  onChange={handleSelectChange('brewMethod')}
                  placeholder={t('recipe.placeholders.select')}
                />
              </FormControl>

              <FormControl label={t('recipe.fields.drinkType')} caption={t('recipe.captions.required')}>
                <Select
                  options={DRINK_TYPES}
                  value={formData.drinkType}
                  onChange={handleSelectChange('drinkType')}
                  placeholder={t('recipe.placeholders.select')}
                />
              </FormControl>
            </div>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={t('recipe.fields.coffee')}>
                <Input
                  value={formData.coffeeName}
                  onChange={handleChange('coffeeName')}
                  placeholder={t('recipe.placeholders.coffee')}
                />
              </FormControl>

              <FormControl label={t('recipe.fields.processing')}>
                <Select
                  options={PROCESSING_METHODS}
                  value={formData.coffeeProcessing}
                  onChange={handleSelectChange('coffeeProcessing')}
                  placeholder={t('recipe.placeholders.select')}
                />
              </FormControl>
            </div>

            <FormControl label={t('recipe.fields.grindSize')}>
              <Input
                value={formData.grindSize}
                onChange={handleChange('grindSize')}
                placeholder={t('recipe.placeholders.grindSize')}
              />
            </FormControl>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={`${t('recipe.fields.dose')} (g)`} caption={t('recipe.captions.required')}>
                <Input
                  type="number"
                  step={0.1}
                  value={formData.doseGrams}
                  onChange={handleChange('doseGrams')}
                  required
                  placeholder={t('recipe.placeholders.dose')}
                />
              </FormControl>

              <FormControl label={`${t('recipe.fields.yield')} (g)`}>
                <Input
                  type="number"
                  step={0.1}
                  value={formData.yieldGrams}
                  onChange={handleChange('yieldGrams')}
                  placeholder={t('recipe.placeholders.yield')}
                />
              </FormControl>
            </div>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={`${t('recipe.fields.time')} (seconds)`}>
                <Input
                  type="number"
                  value={formData.brewTimeSec}
                  onChange={handleChange('brewTimeSec')}
                  placeholder={t('recipe.placeholders.time')}
                />
              </FormControl>

              <FormControl label={`${t('recipe.fields.temperature')} (°C)`}>
                <Input
                  type="number"
                  step={0.5}
                  value={formData.tempCelsius}
                  onChange={handleChange('tempCelsius')}
                  placeholder={t('recipe.placeholders.temperature')}
                />
              </FormControl>
            </div>

            <FormControl label={t('recipe.fields.pressure')} caption={t('recipe.captions.pressure')}>
              <Input
                value={formData.pressure}
                onChange={handleChange('pressure')}
                placeholder={t('recipe.placeholders.pressure')}
              />
            </FormControl>

            <FormControl 
              label={t('recipe.fields.tasteNotes')} 
              caption={t('recipe.captions.tasteNotes')}
            >
              <TasteNoteAutocomplete
                selectedNotes={selectedTasteNotes}
                onChange={setSelectedTasteNotes}
              />
            </FormControl>

            <FormControl label={t('recipe.fields.tastingNotes')}>
              <Textarea
                value={formData.tastingNotes}
                onChange={handleChange('tastingNotes')}
                placeholder={t('recipe.placeholders.tastingNotes')}
              />
            </FormControl>

            <FormControl label={`${t('recipe.fields.rating')} (1-10)`} caption={t('recipe.captions.rating')}>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.rating}
                onChange={handleChange('rating')}
                placeholder={t('recipe.placeholders.rating')}
              />
            </FormControl>

            <FormControl label={t('recipe.fields.tags')} caption={t('recipe.captions.tags')}>
              <Select
                options={TAGS}
                value={formData.tags}
                onChange={handleSelectChange('tags')}
                placeholder={t('recipe.selectTags')}
                multi
              />
            </FormControl>

            <div className={css({ display: 'flex', gap: '16px', marginTop: '24px' })}>
              <Button type="submit" isLoading={isLoading}>
                {t('recipe.create')}
              </Button>
              <Button type="button" kind="secondary" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}

export default CreateRecipePage;
