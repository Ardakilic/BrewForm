/**
 * BrewForm Recipe Detail Page
 */

import { useParams, Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, ParagraphMedium, LabelMedium } from 'baseui/typography';
import { Tag } from 'baseui/tag';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useAuth } from '../../contexts/AuthContext';

interface RecipeVersion {
  title: string;
  description?: string;
  brewMethod: string;
  drinkType: string;
  coffeeName?: string;
  grindSize?: string;
  doseGrams: number;
  yieldGrams?: number;
  brewTimeSec?: number;
  tempCelsius?: number;
  pressure?: string;
  brewRatio?: number;
  tastingNotes?: string;
  rating?: number;
  tags?: string[];
}

interface Recipe {
  id: string;
  userId: string;
  slug: string;
  currentVersion: RecipeVersion;
  user?: {
    username: string;
  };
  forkedFrom?: {
    title: string;
    slug: string;
    user?: {
      username: string;
    };
  };
}

const fetcher = async (url: string): Promise<Recipe> => {
  const response = await api.get(url);
  return response.data as Recipe;
};

function RecipeDetailPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();

  const { data: recipe, isLoading, error } = useSWR<Recipe>(
    slug ? `/recipes/${slug}` : null,
    fetcher
  );

  if (isLoading) return <LoadingSpinner />;
  if (error || !recipe) {
    return (
      <div className={css({ textAlign: 'center', padding: '48px' })}>
        <HeadingSmall>Recipe not found</HeadingSmall>
      </div>
    );
  }

  const version = recipe.currentVersion;
  const isOwner = user?.id === recipe.userId;

  return (
    <>
      <Helmet>
        <title>{version?.title} - BrewForm</title>
        <meta name="description" content={version?.description || `${version?.brewMethod} recipe`} />
      </Helmet>

      <div className={css({ maxWidth: '800px', margin: '0 auto' })}>
        {/* Header */}
        <div
          className={css({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '24px',
          })}
        >
          <div>
            <HeadingLarge>{version?.title}</HeadingLarge>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              by{' '}
              <Link
                to={`/@${recipe.user?.username}`}
                className={css({ color: '#6F4E37', textDecoration: 'none' })}
              >
                @{recipe.user?.username}
              </Link>
            </ParagraphMedium>
          </div>
          <div className={css({ display: 'flex', gap: '8px' })}>
            {isOwner && (
              <Link to={`/recipes/${slug}/edit`}>
                <Button kind="secondary" size="compact">
                  {t('common.edit')}
                </Button>
              </Link>
            )}
            <Button kind="secondary" size="compact">
              {t('recipe.share')}
            </Button>
            <Button kind="secondary" size="compact">
              {t('recipe.fork')}
            </Button>
          </div>
        </div>

        {/* Main Info Card */}
        <Card>
          <div className={css({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' })}>
            {/* Left Column */}
            <div>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                {t('recipe.fields.brewMethod')}
              </LabelMedium>
              <ParagraphMedium marginBottom="16px">{version?.brewMethod}</ParagraphMedium>

              <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                {t('recipe.fields.drinkType')}
              </LabelMedium>
              <ParagraphMedium marginBottom="16px">{version?.drinkType}</ParagraphMedium>

              {version?.coffeeName && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.coffee')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">{version.coffeeName}</ParagraphMedium>
                </>
              )}

              {version?.grindSize && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.grindSize')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">{version.grindSize}</ParagraphMedium>
                </>
              )}
            </div>

            {/* Right Column - Brew Parameters */}
            <div>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                {t('recipe.fields.dose')}
              </LabelMedium>
              <ParagraphMedium marginBottom="16px">{version?.doseGrams}g</ParagraphMedium>

              {version?.yieldGrams && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.yield')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">{version.yieldGrams}g</ParagraphMedium>
                </>
              )}

              {version?.brewTimeSec && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.time')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">{version.brewTimeSec}s</ParagraphMedium>
                </>
              )}

              {version?.pressure && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.pressure')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">{version.pressure} bar</ParagraphMedium>
                </>
              )}

              {version?.brewRatio && (
                <>
                  <LabelMedium color={theme.colors.contentSecondary} marginBottom="4px">
                    {t('recipe.fields.ratio')}
                  </LabelMedium>
                  <ParagraphMedium marginBottom="16px">1:{version.brewRatio.toFixed(1)}</ParagraphMedium>
                </>
              )}
            </div>
          </div>

          {/* Description */}
          {version?.description && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                Description
              </LabelMedium>
              <ParagraphMedium>{version.description}</ParagraphMedium>
            </div>
          )}

          {/* Tasting Notes */}
          {version?.tastingNotes && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.tastingNotes')}
              </LabelMedium>
              <ParagraphMedium>{version.tastingNotes}</ParagraphMedium>
            </div>
          )}

          {/* Rating */}
          {version?.rating && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.rating')}
              </LabelMedium>
              <ParagraphMedium>
                {version.rating}/10 {'⭐'.repeat(Math.round(version.rating / 2))}
              </ParagraphMedium>
            </div>
          )}

          {/* Tags */}
          {version?.tags && version.tags.length > 0 && (
            <div className={css({ marginTop: '24px' })}>
              <LabelMedium color={theme.colors.contentSecondary} marginBottom="8px">
                {t('recipe.fields.tags')}
              </LabelMedium>
              <div className={css({ display: 'flex', gap: '8px', flexWrap: 'wrap' })}>
                {version.tags.map((tag) => (
                  <Tag key={tag} closeable={false}>
                    {tag}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Forked From */}
        {recipe.forkedFrom && (
          <Card overrides={{ Root: { style: { marginTop: '24px' } } }}>
            <ParagraphMedium>
              {t('recipe.forkedFrom')}{' '}
              <Link
                to={`/recipes/${recipe.forkedFrom.slug}`}
                className={css({ color: '#6F4E37' })}
              >
                {recipe.forkedFrom.title}
              </Link>{' '}
              by @{recipe.forkedFrom.user?.username}
            </ParagraphMedium>
          </Card>
        )}
      </div>
    </>
  );
}

export default RecipeDetailPage;
