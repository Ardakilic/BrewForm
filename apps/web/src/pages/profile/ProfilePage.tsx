/**
 * BrewForm Profile Page
 */

import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { Button } from 'baseui/button';
import { HeadingLarge, HeadingSmall, ParagraphMedium } from 'baseui/typography';
import { Tabs, Tab } from 'baseui/tabs-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { UserProfile, RecipeListItem } from '../../types';

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await api.get<T>(url);
  return response.data as T;
};

function ProfilePage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  useAuth(); // Ensure user is authenticated
  const [activeTab, setActiveTab] = useState<React.Key>('0');

  const { data: profile, isLoading } = useSWR<UserProfile>('/users/me', fetcher<UserProfile>);
  const { data: recipesData } = useSWR<RecipeListItem[]>('/users/me/recipes', fetcher<RecipeListItem[]>);
  const { data: favouritesData } = useSWR<RecipeListItem[]>('/users/me/favourites', fetcher<RecipeListItem[]>);

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      <Helmet>
        <title>{t('pages.profile.title')}</title>
      </Helmet>

      <div className={css({ maxWidth: '800px', margin: '0 auto' })}>
        {/* Profile Header */}
        <Card>
          <div className={css({ display: 'flex', gap: '24px', alignItems: 'center' })}>
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
              {profile?.displayName?.[0] || profile?.username?.[0] || '☕'}
            </div>
            <div className={css({ flex: 1 })}>
              <HeadingLarge>{profile?.displayName || profile?.username}</HeadingLarge>
              <ParagraphMedium color={theme.colors.contentSecondary}>
                @{profile?.username}
              </ParagraphMedium>
              {profile?.bio && (
                <ParagraphMedium marginTop="8px">{profile.bio}</ParagraphMedium>
              )}
            </div>
            <Link to="/settings">
              <Button kind="secondary">{t('profile.settings')}</Button>
            </Link>
          </div>

          {/* Stats */}
          <div
            className={css({
              display: 'flex',
              gap: '32px',
              marginTop: '24px',
              paddingTop: '24px',
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            <div className={css({ textAlign: 'center' })}>
              <HeadingSmall>{profile?.recipeCount || 0}</HeadingSmall>
              <ParagraphMedium color={theme.colors.contentSecondary}>
                {t('profile.recipes')}
              </ParagraphMedium>
            </div>
            <div className={css({ textAlign: 'center' })}>
              <HeadingSmall>{profile?.favouriteCount || 0}</HeadingSmall>
              <ParagraphMedium color={theme.colors.contentSecondary}>
                {t('profile.favourites')}
              </ParagraphMedium>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className={css({ marginTop: '24px' })}>
          <Tabs
            activeKey={activeTab}
            onChange={({ activeKey }) => setActiveTab(activeKey)}
          >
            <Tab title={t('profile.recipes')}>
              <div className={css({ marginTop: '16px' })}>
                {recipesData?.length ? (
                  <div className={css({ display: 'flex', flexDirection: 'column', gap: '16px' })}>
                    {recipesData.map((recipe) => (
                      <Link
                        key={recipe.id}
                        to={`/recipes/${recipe.slug}`}
                        className={css({ textDecoration: 'none' })}
                      >
                        <Card>
                          <HeadingSmall>{recipe.currentVersion?.title}</HeadingSmall>
                          <ParagraphMedium color={theme.colors.contentSecondary}>
                            {recipe.visibility}
                          </ParagraphMedium>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <ParagraphMedium color={theme.colors.contentSecondary}>
                    No recipes yet.{' '}
                    <Link to="/recipes/new" className={css({ color: '#6F4E37' })}>
                      Create one!
                    </Link>
                  </ParagraphMedium>
                )}
              </div>
            </Tab>
            <Tab title={t('profile.favourites')}>
              <div className={css({ marginTop: '16px' })}>
                {favouritesData?.length ? (
                  <div className={css({ display: 'flex', flexDirection: 'column', gap: '16px' })}>
                    {favouritesData.map((recipe) => (
                      <Link
                        key={recipe.id}
                        to={`/recipes/${recipe.slug}`}
                        className={css({ textDecoration: 'none' })}
                      >
                        <Card>
                          <HeadingSmall>{recipe.currentVersion?.title}</HeadingSmall>
                          <ParagraphMedium color={theme.colors.contentSecondary}>
                            by @{recipe.user?.username}
                          </ParagraphMedium>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <ParagraphMedium color={theme.colors.contentSecondary}>
                    No favourites yet.{' '}
                    <Link to="/recipes" className={css({ color: '#6F4E37' })}>
                      Explore recipes!
                    </Link>
                  </ParagraphMedium>
                )}
              </div>
            </Tab>
          </Tabs>
        </div>
      </div>
    </>
  );
}

export default ProfilePage;
