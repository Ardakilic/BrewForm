/**
 * BrewForm Generic Error Page
 */

import { useStyletron } from 'baseui';
import { Button } from 'baseui/button';
import { HeadingLarge, ParagraphMedium } from 'baseui/typography';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';

function ErrorPage() {
  const [css, theme] = useStyletron();
  const { t } = useTranslation();

  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <>
      <Helmet>
        <title>{t('pages.error.title')}</title>
      </Helmet>

      <div
        className={css({
          textAlign: 'center',
          padding: '80px 24px',
        })}
      >
        <div className={css({ fontSize: '80px', marginBottom: '24px' })}>💔</div>
        <HeadingLarge marginBottom="16px">{t('errors.generic.title')}</HeadingLarge>
        <ParagraphMedium
          color={theme.colors.contentSecondary}
          marginBottom="32px"
          className={css({ maxWidth: '400px', margin: '0 auto 32px' })}
        >
          {t('errors.generic.description')}
        </ParagraphMedium>
        <Button onClick={handleRetry}>{t('errors.generic.retry')}</Button>
      </div>
    </>
  );
}

export default ErrorPage;
