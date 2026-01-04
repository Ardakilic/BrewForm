/**
 * BrewForm 404 Not Found Page
 */

import { Link } from 'react-router-dom';
import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function NotFoundPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t('pages.notFound.title')}</title>
      </Helmet>

      <div
        className={css({
          textAlign: 'center',
          padding: '80px 24px',
        })}
      >
        <div className={css({ fontSize: '80px', marginBottom: '24px' })}>☕</div>
        <HeadingLarge marginBottom="16px">{t('errors.notFound.title')}</HeadingLarge>
        <ParagraphMedium
          color={theme.colors.contentSecondary}
          marginBottom="32px"
          className={css({ maxWidth: '400px', margin: '0 auto 32px' })}
        >
          {t('errors.notFound.description')}
        </ParagraphMedium>
        <Link to="/">
          <Button>{t('errors.notFound.backHome')}</Button>
        </Link>
      </div>
    </>
  );
}

export default NotFoundPage;
