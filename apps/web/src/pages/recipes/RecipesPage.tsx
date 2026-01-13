/**
 * BrewForm Recipes List Page
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { Input } from 'baseui/input';
import { Select } from 'baseui/select';
import { Tag, KIND as TAG_KIND } from 'baseui/tag';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';
import type { RecipeListItem } from '../../types';

const fetcher = async (url: string): Promise<RecipeListItem[]> => {
  const response = await api.get<RecipeListItem[]>(url);
  return response.data as RecipeListItem[];
};

function RecipesPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [search, setSearch] = useState('');
  const [brewMethod, setBrewMethod] = useState<{ id: string; label: string }[]>([]);
  const [drinkType, setDrinkType] = useState<{ id: string; label: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; label: string }[]>([]);

  const brewMethodOptions = [
    { id: 'ESPRESSO_MACHINE', label: t('recipe.brewMethods.ESPRESSO_MACHINE') },
    { id: 'POUR_OVER_V60', label: t('recipe.brewMethods.POUR_OVER_V60') },
    { id: 'POUR_OVER_CHEMEX', label: t('recipe.brewMethods.POUR_OVER_CHEMEX') },
    { id: 'AEROPRESS', label: t('recipe.brewMethods.AEROPRESS') },
    { id: 'FRENCH_PRESS', label: t('recipe.brewMethods.FRENCH_PRESS') },
    { id: 'MOKA_POT', label: t('recipe.brewMethods.MOKA_POT') },
    { id: 'COLD_BREW', label: t('recipe.brewMethods.COLD_BREW') },
    { id: 'TURKISH_CEZVE', label: t('recipe.brewMethods.TURKISH_CEZVE') },
  ];

  const drinkTypeOptions = [
    { id: 'ESPRESSO', label: t('recipe.drinkTypes.ESPRESSO') },
    { id: 'RISTRETTO', label: t('recipe.drinkTypes.RISTRETTO') },
    { id: 'LUNGO', label: t('recipe.drinkTypes.LUNGO') },
    { id: 'AMERICANO', label: t('recipe.drinkTypes.AMERICANO') },
    { id: 'LATTE', label: t('recipe.drinkTypes.LATTE') },
    { id: 'CAPPUCCINO', label: t('recipe.drinkTypes.CAPPUCCINO') },
    { id: 'FLAT_WHITE', label: t('recipe.drinkTypes.FLAT_WHITE') },
    { id: 'CORTADO', label: t('recipe.drinkTypes.CORTADO') },
    { id: 'MACCHIATO', label: t('recipe.drinkTypes.MACCHIATO') },
    { id: 'POUR_OVER', label: t('recipe.drinkTypes.POUR_OVER') },
    { id: 'FRENCH_PRESS', label: t('recipe.drinkTypes.FRENCH_PRESS') },
    { id: 'COLD_BREW', label: t('recipe.drinkTypes.COLD_BREW') },
  ];

  // Initialize filters from URL params (runs once on mount)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only on mount
  useEffect(() => {
    const urlBrewMethod = searchParams.get('brewMethod');
    const urlDrinkType = searchParams.get('drinkType');
    const urlTags = searchParams.getAll('tags');

    if (urlBrewMethod) {
      const option = brewMethodOptions.find(o => o.id === urlBrewMethod);
      if (option) setBrewMethod([option]);
    }
    if (urlDrinkType) {
      const option = drinkTypeOptions.find(o => o.id === urlDrinkType);
      if (option) setDrinkType([option]);
    }
    if (urlTags.length > 0) {
      const selectedTags = urlTags.map(t => {
        const option = tagOptions.find(o => o.id === t);
        return option || { id: t, label: t };
      });
      setTags(selectedTags);
    }
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (brewMethod.length > 0) params.set('brewMethod', brewMethod[0].id);
    if (drinkType.length > 0) params.set('drinkType', drinkType[0].id);
    for (const tag of tags) {
      params.append('tags', tag.id);
    }
    if (search) params.set('search', search);
    setSearchParams(params, { replace: true });
  }, [brewMethod, drinkType, tags, search, setSearchParams]);

  // Build API URL with filters
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('visibility', 'PUBLIC');
    if (brewMethod.length > 0) params.set('brewMethod', brewMethod[0].id);
    if (drinkType.length > 0) params.set('drinkType', drinkType[0].id);
    if (tags.length > 0) params.set('tags', tags.map(t => t.id).join(','));
    if (search) params.set('search', search);
    return `/recipes?${params.toString()}`;
  }, [brewMethod, drinkType, tags, search]);

  const { data: recipes, isLoading } = useSWR<RecipeListItem[]>(apiUrl, fetcher);

  const clearFilters = () => {
    setBrewMethod([]);
    setDrinkType([]);
    setTags([]);
    setSearch('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag.id !== tagToRemove));
  };

  const tagOptions = [
    { id: 'morning', label: t('recipe.tags.morning') },
    { id: 'afternoon', label: t('recipe.tags.afternoon') },
    { id: 'evening', label: t('recipe.tags.evening') },
    { id: 'fruity', label: t('recipe.tags.fruity') },
    { id: 'chocolatey', label: t('recipe.tags.chocolatey') },
    { id: 'nutty', label: t('recipe.tags.nutty') },
    { id: 'floral', label: t('recipe.tags.floral') },
    { id: 'spicy', label: t('recipe.tags.spicy') },
    { id: 'sweet', label: t('recipe.tags.sweet') },
    { id: 'bold', label: t('recipe.tags.bold') },
    { id: 'light', label: t('recipe.tags.light') },
    { id: 'creamy', label: t('recipe.tags.creamy') },
    { id: 'iced', label: t('recipe.tags.iced') },
    { id: 'hot', label: t('recipe.tags.hot') },
    { id: 'decaf', label: t('recipe.tags.decaf') },
    { id: 'single-origin', label: t('recipe.tags.singleOrigin') },
    { id: 'blend', label: t('recipe.tags.blend') },
    { id: 'espresso', label: t('recipe.tags.espresso') },
  ];

  const hasFilters = brewMethod.length > 0 || drinkType.length > 0 || tags.length > 0 || search;

  return (
    <>
      <Helmet>
        <title>{t('pages.recipes.title')}</title>
        <meta name="description" content={t('pages.recipes.description')} />
      </Helmet>

      {/* Header */}
      <div
        className={css({
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
        })}
      >
        <HeadingLarge>{t('nav.recipes')}</HeadingLarge>
        {isAuthenticated && (
          <Link to="/recipes/new">
            <Button>{t('recipe.create')}</Button>
          </Link>
        )}
      </div>

      {/* Active Filters */}
      {hasFilters && (
        <div className={css({ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' })}>
          <ParagraphSmall $style={{ fontWeight: 600, color: theme.colors.contentPrimary }}>{t('recipe.activeFilters')}:</ParagraphSmall>
          {brewMethod.length > 0 && (
            <Tag closeable onActionClick={() => setBrewMethod([])} kind={TAG_KIND.primary}>
              {brewMethod[0].label}
            </Tag>
          )}
          {drinkType.length > 0 && (
            <Tag closeable onActionClick={() => setDrinkType([])} kind={TAG_KIND.primary}>
              {drinkType[0].label}
            </Tag>
          )}
          {tags.map(tag => (
            <Tag key={tag.id} closeable onActionClick={() => removeTag(tag.id)} kind={TAG_KIND.accent}>
              #{tag.label}
            </Tag>
          ))}
          <Button kind="tertiary" size="mini" onClick={clearFilters}>
            {t('common.clearAll')}
          </Button>
        </div>
      )}

      {/* Filters Row 1: Search, Brew Method, Drink Type */}
      <div
        className={css({
          display: 'flex',
          gap: '16px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        })}
      >
        <div className={css({ flex: '1', minWidth: '200px' })}>
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
        <div className={css({ width: '200px' })}>
          <Select
            placeholder={t('recipe.fields.brewMethod')}
            options={brewMethodOptions}
            value={brewMethod}
            onChange={(params) => setBrewMethod(params.value as { id: string; label: string }[])}
            clearable
          />
        </div>
        <div className={css({ width: '200px' })}>
          <Select
            placeholder={t('recipe.fields.drinkType')}
            options={drinkTypeOptions}
            value={drinkType}
            onChange={(params) => setDrinkType(params.value as { id: string; label: string }[])}
            clearable
          />
        </div>
      </div>

      {/* Filters Row 2: Tags as clickable chips */}
      <div
        className={css({
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
        })}
      >
        <ParagraphSmall $style={{ fontWeight: 600, marginRight: '8px', color: theme.colors.contentPrimary }}>
          {t('recipe.selectTags')}:
        </ParagraphSmall>
        {tagOptions.map((option) => {
          const isSelected = tags.some(t => t.id === option.id);
          return (
            <Tag
              key={option.id}
              closeable={false}
              kind={isSelected ? TAG_KIND.accent : TAG_KIND.neutral}
              onClick={() => {
                if (isSelected) {
                  setTags(tags.filter(t => t.id !== option.id));
                } else {
                  setTags([...tags, option]);
                }
              }}
              overrides={{
                Root: {
                  style: {
                    cursor: 'pointer',
                    borderWidth: isSelected ? '2px' : '1px',
                    borderStyle: 'solid',
                    borderColor: isSelected ? theme.colors.accent : theme.colors.borderOpaque,
                    backgroundColor: isSelected ? theme.colors.accent : 'transparent',
                    ':hover': {
                      borderColor: theme.colors.accent,
                    },
                  },
                },
              }}
            >
              {option.label}
            </Tag>
          );
        })}
      </div>

      {/* Recipes Grid */}
      {isLoading ? (
        <LoadingSpinner />
      ) : recipes?.length ? (
        <div
          className={css({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '24px',
          })}
        >
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/recipes/${recipe.slug}`}
              className={css({ textDecoration: 'none' })}
            >
              <Card
                overrides={{
                  Root: {
                    style: {
                      ':hover': { transform: 'translateY(-4px)', transition: 'transform 0.2s' },
                    },
                  },
                }}
              >
                <HeadingSmall marginBottom="8px">
                  {recipe.currentVersion?.title}
                </HeadingSmall>
                <ParagraphSmall color={theme.colors.contentSecondary}>
                  {recipe.currentVersion?.brewMethod} • {recipe.currentVersion?.drinkType}
                </ParagraphSmall>
                <ParagraphSmall color={theme.colors.contentTertiary}>
                  by @{recipe.user?.username}
                </ParagraphSmall>
                {recipe.currentVersion?.rating && (
                  <ParagraphMedium marginTop="8px">
                    {'⭐'.repeat(Math.round(recipe.currentVersion.rating / 2))}
                  </ParagraphMedium>
                )}
                {recipe.currentVersion?.tags && recipe.currentVersion.tags.length > 0 && (
                  <div className={css({ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' })}>
                    {recipe.currentVersion.tags.slice(0, 3).map((tag) => (
                      <Tag
                        key={tag}
                        closeable={false}
                        kind={TAG_KIND.neutral}
                        onClick={(e) => {
                          e.preventDefault();
                          const tagIds = tags.map(t => t.id);
                          if (!tagIds.includes(tag)) {
                            const existingOption = tagOptions.find(o => o.id === tag);
                            setTags([...tags, existingOption || { id: tag, label: tag }]);
                          }
                        }}
                        overrides={{ Root: { style: { cursor: 'pointer', transform: 'scale(0.85)' } } }}
                      >
                        {tag}
                      </Tag>
                    ))}
                    {recipe.currentVersion.tags.length > 3 && (
                      <ParagraphSmall color={theme.colors.contentTertiary}>
                        +{recipe.currentVersion.tags.length - 3}
                      </ParagraphSmall>
                    )}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className={css({ textAlign: 'center', padding: '48px' })}>
          <div className={css({ fontSize: '48px', marginBottom: '16px' })}>☕</div>
          <HeadingSmall>{t('recipe.empty.title')}</HeadingSmall>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            {t('recipe.empty.description')}
          </ParagraphMedium>
        </div>
      )}
    </>
  );
}

export default RecipesPage;
