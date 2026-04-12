/**
 * BrewForm Public User Profile Page
 */

import { Link, useParams } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from '../../components/Card.tsx';
import { HeadingLarge, HeadingSmall, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { HIERARCHY as TAG_HIERARCHY, KIND as TAG_KIND, Tag } from 'baseui/tag';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api.ts';
import LoadingSpinner from '../../components/LoadingSpinner.tsx';
import type { RecipeListItem, UserProfile } from '../../types';

const profileFetcher = async (url: string): Promise<UserProfile> => {
  const response = await api.get<UserProfile>(url);
  return response.data as UserProfile;
};

const recipesFetcher = async (url: string): Promise<RecipeListItem[]> => {
  const response = await api.get<RecipeListItem[]>(url);
  return response.data as RecipeListItem[];
};

function UserPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();

  const { data: profile, isLoading } = useSWR<UserProfile>(
    username ? `/users/${username}` : null,
    profileFetcher,
  );
  const { data: recipesData } = useSWR<RecipeListItem[]>(
    username ? `/users/${username}/recipes` : null,
    recipesFetcher,
  );

  if (isLoading) return <LoadingSpinner />;
  if (!profile) {
    return (
      <div className={css({ textAlign: 'center', padding: '48px' })}>
        <HeadingSmall>User not found</HeadingSmall>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{profile.displayName || profile.username} - BrewForm</title>
      </Helmet>

      <div className={css({ maxWidth: '800px', margin: '0 auto' })}>
        <Card>
          <div
            className={css({
              display: 'flex',
              gap: '24px',
              alignItems: 'center',
            })}
          >
            <div
              className={css({
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#6F4E37',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                color: 'white',
              })}
            >
              {profile.displayName?.[0] || profile.username?.[0] || '☕'}
            </div>
            <div>
              <HeadingLarge>
                {profile.displayName || profile.username}
              </HeadingLarge>
              <ParagraphMedium color={theme.colors.contentSecondary}>
                @{profile.username}
              </ParagraphMedium>
              {profile.bio && <ParagraphMedium marginTop='8px'>{profile.bio}</ParagraphMedium>}
            </div>
          </div>
          <div className={css({ marginTop: '24px' })}>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {profile.recipeCount || 0} {t('profile.recipes')}
            </ParagraphMedium>
          </div>
        </Card>

        <HeadingSmall marginTop='32px' marginBottom='16px'>
          {t('profile.recipes')}
        </HeadingSmall>

        {recipesData?.length
          ? (
            <div
              className={css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px',
              })}
            >
              {recipesData.map((recipe) => (
                <Link
                  key={recipe.id}
                  to={`/recipes/${recipe.slug}`}
                  className={css({
                    textDecoration: 'none',
                    height: '100%',
                    display: 'block',
                  })}
                >
                  <Card
                    overrides={{
                      Root: {
                        style: {
                          borderRadius: '12px',
                          transition: 'all 0.2s ease',
                          border: `1px solid ${theme.colors.borderOpaque}`,
                          backgroundColor: theme.colors.backgroundSecondary,
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          ':hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: theme.lighting.shadow600,
                          },
                        },
                      },
                      Contents: {
                        style: {
                          padding: '16px',
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                        },
                      },
                    }}
                  >
                    <HeadingSmall
                      $style={{
                        marginBottom: '12px',
                        color: theme.colors.contentPrimary,
                        minHeight: '48px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {recipe.currentVersion?.title}
                    </HeadingSmall>
                    <div
                      className={css({
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '8px',
                        flexWrap: 'wrap',
                      })}
                    >
                      <Tag
                        closeable={false}
                        kind={TAG_KIND.blue}
                        hierarchy={TAG_HIERARCHY.secondary}
                      >
                        {t(
                          `recipe.brewMethods.${recipe.currentVersion?.brewMethod}`,
                        )}
                      </Tag>
                      <Tag
                        closeable={false}
                        kind={TAG_KIND.purple}
                        hierarchy={TAG_HIERARCHY.secondary}
                      >
                        {t(
                          `recipe.drinkTypes.${recipe.currentVersion?.drinkType}`,
                        )}
                      </Tag>
                    </div>
                    {recipe.currentVersion?.rating && (
                      <ParagraphSmall $style={{ marginTop: 'auto' }}>
                        {'⭐'.repeat(
                          Math.round(recipe.currentVersion.rating / 2),
                        )}
                        {'☆'.repeat(
                          5 - Math.round(recipe.currentVersion.rating / 2),
                        )}
                      </ParagraphSmall>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )
          : (
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('recipe.empty.title')}
            </ParagraphMedium>
          )}
      </div>
    </>
  );
}

export default UserPage;
