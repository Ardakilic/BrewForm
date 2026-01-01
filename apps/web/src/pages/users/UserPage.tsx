/**
 * BrewForm Public User Profile Page
 */

import { useParams, Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from 'baseui/card';
import { HeadingLarge, HeadingSmall, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import type { UserProfile, RecipeListItem } from '../../types';

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
    profileFetcher
  );
  const { data: recipesData } = useSWR<RecipeListItem[]>(
    username ? `/users/${username}/recipes` : null,
    recipesFetcher
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
              {profile.displayName?.[0] || profile.username?.[0] || '☕'}
            </div>
            <div>
              <HeadingLarge>{profile.displayName || profile.username}</HeadingLarge>
              <ParagraphMedium color={theme.colors.contentSecondary}>
                @{profile.username}
              </ParagraphMedium>
              {profile.bio && <ParagraphMedium marginTop="8px">{profile.bio}</ParagraphMedium>}
            </div>
          </div>
          <div className={css({ marginTop: '24px' })}>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {profile.recipeCount || 0} {t('profile.recipes')}
            </ParagraphMedium>
          </div>
        </Card>

        <HeadingSmall marginTop="32px" marginBottom="16px">
          {t('profile.recipes')}
        </HeadingSmall>

        {recipesData?.length ? (
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '16px' })}>
            {recipesData.map((recipe) => (
              <Link key={recipe.id} to={`/recipes/${recipe.slug}`} className={css({ textDecoration: 'none' })}>
                <Card>
                  <HeadingSmall>{recipe.currentVersion?.title}</HeadingSmall>
                  <ParagraphMedium color={theme.colors.contentSecondary}>
                    {recipe.currentVersion?.brewMethod}
                  </ParagraphMedium>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <ParagraphMedium color={theme.colors.contentSecondary}>
            No public recipes yet.
          </ParagraphMedium>
        )}
      </div>
    </>
  );
}

export default UserPage;
