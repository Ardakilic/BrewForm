/**
 * BrewForm Recipes List Page
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { Input } from 'baseui/input';
import { Select } from 'baseui/select';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function RecipesPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState('');
  const [brewMethod, setBrewMethod] = useState<{ id: string; label: string }[]>([]);

  const { data: recipes, isLoading } = useSWR('/recipes?visibility=PUBLIC', fetcher);

  return (
    <>
      <Helmet>
        <title>Recipes - BrewForm</title>
        <meta name="description" content="Browse coffee brewing recipes from the community" />
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

      {/* Filters */}
      <div
        className={css({
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
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
            placeholder="Brew Method"
            options={[
              { id: 'ESPRESSO_MACHINE', label: 'Espresso' },
              { id: 'POUR_OVER_V60', label: 'V60' },
              { id: 'AEROPRESS', label: 'AeroPress' },
              { id: 'FRENCH_PRESS', label: 'French Press' },
            ]}
            value={brewMethod}
            onChange={(params) => setBrewMethod(params.value as { id: string; label: string }[])}
          />
        </div>
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
          {recipes.map((recipe: { id: string; slug: string; currentVersion: { title: string; brewMethod: string; drinkType: string; rating?: number }; user: { username: string; displayName?: string } }) => (
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
