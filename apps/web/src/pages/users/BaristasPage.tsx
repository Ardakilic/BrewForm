/**
 * BrewForm Baristas Page
 * Lists all users/baristas with search and filters
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Card } from '../../components/Card.tsx';
import { Input } from 'baseui/input';
import { HeadingLarge, HeadingSmall, ParagraphMedium, ParagraphSmall } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import useSWR from 'swr';
import { api } from '../../utils/api.ts';
import LoadingSpinner from '../../components/LoadingSpinner.tsx';
import type { UserProfile } from '../../types';

interface BaristasData {
  users: UserProfile[];
  total: number;
}

interface BaristasApiResponse {
  success: boolean;
  data: BaristasData;
}

const baristasFetcher = async (url: string): Promise<BaristasData> => {
  const response = await api.get<BaristasData>(url) as BaristasApiResponse;
  return response.data ?? { users: [], total: 0 };
};

function BaristasPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useSWR<BaristasData>(
    `/users?search=${encodeURIComponent(search)}`,
    baristasFetcher,
  );

  const users = data?.users || [];

  return (
    <>
      <Helmet>
        <title>{t('nav.baristas')} - BrewForm</title>
      </Helmet>

      <div className={css({ maxWidth: '1200px', margin: '0 auto' })}>
        <Card
          overrides={{
            Root: {
              style: {
                backgroundColor: theme.colors.backgroundSecondary,
                marginBottom: '24px',
              },
            },
          }}
        >
          <HeadingLarge>{t('nav.baristas')}</HeadingLarge>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            {t('baristas.description')}
          </ParagraphMedium>

          <div className={css({ marginTop: '24px' })}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder={t('common.search')}
              clearable
              overrides={{
                Root: {
                  style: {
                    backgroundColor: theme.colors.backgroundPrimary,
                  },
                },
              }}
            />
          </div>
        </Card>

        {data && (
          <div
            className={css({
              display: 'inline-block',
              backgroundColor: theme.colors.backgroundSecondary,
              padding: '8px 16px',
              borderRadius: '20px',
              marginBottom: '20px',
            })}
          >
            <ParagraphSmall
              $style={{
                color: theme.colors.contentPrimary,
                fontWeight: 500,
                margin: 0,
              }}
            >
              <span
                className={css({
                  color: theme.colors.contentTertiary,
                  fontWeight: 700,
                })}
              >
                {users.length}
              </span>{' '}
              {users.length === 1 ? t('baristas.result') : t('baristas.results')}
            </ParagraphSmall>
          </div>
        )}

        {isLoading ? <LoadingSpinner /> : users.length
          ? (
            <div
              className={css({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '20px',
              })}
            >
              {users.map((user: UserProfile) => (
                <Link
                  key={user.id}
                  to={`/user/${user.username}`}
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
                          ':hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: theme.lighting.shadow600,
                            borderColor: theme.colors.borderSelected,
                          },
                        },
                      },
                      Contents: {
                        style: {
                          padding: '20px',
                        },
                      },
                    }}
                  >
                    <div
                      className={css({
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                      })}
                    >
                      <div
                        className={css({
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          backgroundColor: theme.colors.contentTertiary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '24px',
                          color: 'white',
                          flexShrink: 0,
                        })}
                      >
                        {user.displayName?.[0] || user.username?.[0] || '☕'}
                      </div>
                      <div className={css({ overflow: 'hidden' })}>
                        <HeadingSmall
                          $style={{
                            color: theme.colors.contentPrimary,
                            marginBottom: '4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user.displayName || user.username}
                        </HeadingSmall>
                        <ParagraphSmall
                          $style={{
                            color: theme.colors.contentSecondary,
                            margin: 0,
                          }}
                        >
                          @{user.username}
                        </ParagraphSmall>
                      </div>
                    </div>
                    {user.bio && (
                      <ParagraphSmall
                        $style={{
                          color: theme.colors.contentSecondary,
                          marginTop: '12px',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {user.bio}
                      </ParagraphSmall>
                    )}
                    <ParagraphSmall
                      $style={{
                        color: theme.colors.contentTertiary,
                        marginTop: '8px',
                      }}
                    >
                      {user.recipeCount || 0} {t('profile.recipes')}
                    </ParagraphSmall>
                  </Card>
                </Link>
              ))}
            </div>
          )
          : (
            <div
              className={css({
                textAlign: 'center',
                padding: '64px 24px',
                backgroundColor: theme.colors.backgroundSecondary,
                borderRadius: '16px',
              })}
            >
              <HeadingSmall color={theme.colors.contentSecondary}>
                {t('common.noResults')}
              </HeadingSmall>
            </div>
          )}
      </div>
    </>
  );
}

export default BaristasPage;
