/**
 * BrewForm Home Page
 * Landing page with hero, features, and latest recipes
 */

import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { HeadingLarge, HeadingMedium, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function HomePage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>BrewForm - Coffee Dive-In Recipes</title>
        <meta
          name="description"
          content="Share and discover coffee brewing recipes. Track your espresso, pour-over, and specialty coffee dive-ins."
        />
      </Helmet>

      {/* Hero Section */}
      <section
        className={css({
          textAlign: 'center',
          padding: '80px 24px',
          backgroundColor: theme.colors.backgroundPrimary,
          borderRadius: '16px',
          marginBottom: '48px',
        })}
      >
        <HeadingLarge
          className={css({
            marginBottom: '16px',
            color: '#6F4E37',
          })}
        >
          {t('home.hero.title')}
        </HeadingLarge>
        <ParagraphMedium
          className={css({
            maxWidth: '600px',
            margin: '0 auto 32px',
            color: theme.colors.contentSecondary,
          })}
        >
          {t('home.hero.subtitle')}
        </ParagraphMedium>
        <div
          className={css({
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
          })}
        >
          <Link to="/register">
            <Button size="large">{t('home.hero.cta')}</Button>
          </Link>
          <Link to="/recipes">
            <Button size="large" kind="secondary">
              {t('home.hero.explore')}
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className={css({ marginBottom: '48px' })}>
        <HeadingMedium
          className={css({
            textAlign: 'center',
            marginBottom: '32px',
          })}
        >
          Why BrewForm?
        </HeadingMedium>
        <div
          className={css({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          })}
        >
          {/* Track Feature */}
          <div
            className={css({
              padding: '32px',
              backgroundColor: theme.colors.backgroundSecondary,
              borderRadius: '12px',
              textAlign: 'center',
            })}
          >
            <div
              className={css({
                fontSize: '48px',
                marginBottom: '16px',
              })}
            >
              📝
            </div>
            <HeadingMedium marginBottom="8px">
              {t('home.features.track.title')}
            </HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('home.features.track.description')}
            </ParagraphMedium>
          </div>

          {/* Share Feature */}
          <div
            className={css({
              padding: '32px',
              backgroundColor: theme.colors.backgroundSecondary,
              borderRadius: '12px',
              textAlign: 'center',
            })}
          >
            <div
              className={css({
                fontSize: '48px',
                marginBottom: '16px',
              })}
            >
              🌍
            </div>
            <HeadingMedium marginBottom="8px">
              {t('home.features.share.title')}
            </HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('home.features.share.description')}
            </ParagraphMedium>
          </div>

          {/* Compare Feature */}
          <div
            className={css({
              padding: '32px',
              backgroundColor: theme.colors.backgroundSecondary,
              borderRadius: '12px',
              textAlign: 'center',
            })}
          >
            <div
              className={css({
                fontSize: '48px',
                marginBottom: '16px',
              })}
            >
              📊
            </div>
            <HeadingMedium marginBottom="8px">
              {t('home.features.compare.title')}
            </HeadingMedium>
            <ParagraphMedium color={theme.colors.contentSecondary}>
              {t('home.features.compare.description')}
            </ParagraphMedium>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        className={css({
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: '#6F4E37',
          borderRadius: '16px',
          color: 'white',
        })}
      >
        <HeadingMedium
          className={css({
            color: 'white',
            marginBottom: '16px',
          })}
        >
          Ready to start your coffee journey?
        </HeadingMedium>
        <Link to="/register">
          <Button
            size="large"
            overrides={{
              BaseButton: {
                style: {
                  backgroundColor: 'white',
                  color: '#6F4E37',
                },
              },
            }}
          >
            Create Free Account
          </Button>
        </Link>
      </section>
    </>
  );
}

export default HomePage;
