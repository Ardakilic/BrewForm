/**
 * BrewForm Create Recipe Page
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
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

const BREW_METHODS = [
  { id: 'ESPRESSO_MACHINE', label: 'Espresso Machine' },
  { id: 'POUR_OVER_V60', label: 'V60 Pour Over' },
  { id: 'POUR_OVER_CHEMEX', label: 'Chemex' },
  { id: 'POUR_OVER_KALITA', label: 'Kalita Wave' },
  { id: 'AEROPRESS', label: 'AeroPress' },
  { id: 'FRENCH_PRESS', label: 'French Press' },
  { id: 'MOKA_POT', label: 'Moka Pot' },
  { id: 'COLD_BREW', label: 'Cold Brew' },
];

const DRINK_TYPES = [
  { id: 'ESPRESSO', label: 'Espresso' },
  { id: 'RISTRETTO', label: 'Ristretto' },
  { id: 'LUNGO', label: 'Lungo' },
  { id: 'AMERICANO', label: 'Americano' },
  { id: 'LATTE', label: 'Latte' },
  { id: 'CAPPUCCINO', label: 'Cappuccino' },
  { id: 'FLAT_WHITE', label: 'Flat White' },
  { id: 'CORTADO', label: 'Cortado' },
  { id: 'POUR_OVER', label: 'Pour Over' },
  { id: 'FRENCH_PRESS', label: 'French Press' },
];

function CreateRecipePage() {
  const [css] = useStyletron();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    brewMethod: [] as { id: string; label: string }[],
    drinkType: [] as { id: string; label: string }[],
    coffeeName: '',
    grindSize: '',
    doseGrams: '',
    yieldGrams: '',
    brewTimeSec: '',
    tempCelsius: '',
    pressure: '',
    tastingNotes: '',
    rating: '',
    tags: '',
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const recipeData = {
        visibility: 'PUBLIC',
        version: {
          title: formData.title,
          description: formData.description,
          brewMethod: formData.brewMethod[0]?.id,
          drinkType: formData.drinkType[0]?.id,
          coffeeName: formData.coffeeName || undefined,
          grindSize: formData.grindSize || undefined,
          doseGrams: formData.doseGrams ? Number.parseFloat(formData.doseGrams) : undefined,
          yieldGrams: formData.yieldGrams ? Number.parseFloat(formData.yieldGrams) : undefined,
          brewTimeSec: formData.brewTimeSec ? Number.parseInt(formData.brewTimeSec) : undefined,
          tempCelsius: formData.tempCelsius ? Number.parseFloat(formData.tempCelsius) : undefined,
          pressure: formData.pressure || undefined,
          tastingNotes: formData.tastingNotes || undefined,
          rating: formData.rating ? Number.parseInt(formData.rating) : undefined,
          tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()) : undefined,
        },
      };

      const response = await api.post('/recipes', recipeData);

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
        <title>Create Recipe - BrewForm</title>
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
            <FormControl label={t('recipe.fields.title')} caption="Required">
              <Input
                value={formData.title}
                onChange={handleChange('title')}
                required
                placeholder="My Perfect Espresso"
              />
            </FormControl>

            <FormControl label={t('recipe.fields.description')}>
              <Textarea
                value={formData.description}
                onChange={handleChange('description')}
                placeholder="Describe your recipe..."
              />
            </FormControl>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={t('recipe.fields.brewMethod')} caption="Required">
                <Select
                  options={BREW_METHODS}
                  value={formData.brewMethod}
                  onChange={handleSelectChange('brewMethod')}
                  placeholder="Select..."
                />
              </FormControl>

              <FormControl label={t('recipe.fields.drinkType')} caption="Required">
                <Select
                  options={DRINK_TYPES}
                  value={formData.drinkType}
                  onChange={handleSelectChange('drinkType')}
                  placeholder="Select..."
                />
              </FormControl>
            </div>

            <FormControl label={t('recipe.fields.coffee')}>
              <Input
                value={formData.coffeeName}
                onChange={handleChange('coffeeName')}
                placeholder="e.g., Ethiopia Yirgacheffe"
              />
            </FormControl>

            <FormControl label={t('recipe.fields.grindSize')}>
              <Input
                value={formData.grindSize}
                onChange={handleChange('grindSize')}
                placeholder="e.g., 2.5 or 18 clicks"
              />
            </FormControl>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={`${t('recipe.fields.dose')} (g)`} caption="Required">
                <Input
                  type="number"
                  step={0.1}
                  value={formData.doseGrams}
                  onChange={handleChange('doseGrams')}
                  required
                  placeholder="18"
                />
              </FormControl>

              <FormControl label={`${t('recipe.fields.yield')} (g)`}>
                <Input
                  type="number"
                  step={0.1}
                  value={formData.yieldGrams}
                  onChange={handleChange('yieldGrams')}
                  placeholder="36"
                />
              </FormControl>
            </div>

            <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' })}>
              <FormControl label={`${t('recipe.fields.time')} (seconds)`}>
                <Input
                  type="number"
                  value={formData.brewTimeSec}
                  onChange={handleChange('brewTimeSec')}
                  placeholder="28"
                />
              </FormControl>

              <FormControl label={`${t('recipe.fields.temperature')} (°C)`}>
                <Input
                  type="number"
                  step={0.5}
                  value={formData.tempCelsius}
                  onChange={handleChange('tempCelsius')}
                  placeholder="93"
                />
              </FormControl>
            </div>

            <FormControl label={t('recipe.fields.pressure')} caption="e.g., 9, 6-9, variable">
              <Input
                value={formData.pressure}
                onChange={handleChange('pressure')}
                placeholder="9"
              />
            </FormControl>

            <FormControl label={t('recipe.fields.tastingNotes')}>
              <Textarea
                value={formData.tastingNotes}
                onChange={handleChange('tastingNotes')}
                placeholder="Describe the taste..."
              />
            </FormControl>

            <FormControl label={`${t('recipe.fields.rating')} (1-10)`}>
              <Input
                type="number"
                min="1"
                max="10"
                value={formData.rating}
                onChange={handleChange('rating')}
                placeholder="8"
              />
            </FormControl>

            <FormControl label={t('recipe.fields.tags')} caption="Comma separated">
              <Input
                value={formData.tags}
                onChange={handleChange('tags')}
                placeholder="espresso, morning, chocolate"
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
