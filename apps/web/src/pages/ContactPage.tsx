import { useFetcher } from 'react-router';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { ErrorState } from '../components/ui/ErrorState.tsx';
import { useTranslation } from '../contexts/I18nContext.tsx';
import { failureToError } from '../routes/action-result.ts';
import { getApiErrorMessage } from '../utils/apiErrorMessage.ts';
import type { action } from './ContactPage.data.ts';

/**
 * Contact form (name/email/subject/message) submitted to the `/contact` route action
 * (`ContactPage.data.ts`) through a fetcher; swaps to a success message once sent and shows the
 * localised error (a rate limit gets the "try again in N seconds" message) otherwise.
 */
export function ContactPage() {
  const { t } = useTranslation();
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state !== 'idle';
  const result = fetcher.state === 'idle' ? fetcher.data : undefined;
  const sent = result?.ok === true;
  const error =
    result && !result.ok ? getApiErrorMessage(failureToError(result), t, 'error.500') : '';

  if (sent) {
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center">
        <SEOHead title={t('contact.title')} description={t('contact.description')} />
        <h1 className="text-2xl font-bold text-[color:var(--text-primary)]">
          {t('contact.success.title')}
        </h1>
        <p className="mt-4 text-[color:var(--text-secondary)]">{t('contact.success.message')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <SEOHead title={t('contact.title')} description={t('contact.description')} />
      <h1 className="text-3xl font-bold text-[color:var(--text-primary)]">{t('contact.title')}</h1>
      <p className="mt-2 text-[color:var(--text-secondary)]">{t('contact.description')}</p>

      {error && <ErrorState message={error} className="mt-4" />}

      <fetcher.Form method="post" className="mt-6 flex flex-col gap-4">
        <div>
          <label
            htmlFor="contact-name"
            className="mb-1 block text-sm font-medium text-[color:var(--text-secondary)]"
          >
            {t('contact.form.name')}
          </label>
          <input
            type="text"
            name="name"
            id="contact-name"
            className="input-field"
            required
            minLength={1}
            maxLength={100}
          />
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="mb-1 block text-sm font-medium text-[color:var(--text-secondary)]"
          >
            {t('contact.form.email')}
          </label>
          <input
            type="email"
            name="email"
            id="contact-email"
            className="input-field"
            required
            maxLength={255}
          />
        </div>
        <div>
          <label
            htmlFor="contact-subject"
            className="mb-1 block text-sm font-medium text-[color:var(--text-secondary)]"
          >
            {t('contact.form.subject')}
          </label>
          <input
            type="text"
            name="subject"
            id="contact-subject"
            className="input-field"
            required
            minLength={1}
            maxLength={200}
          />
        </div>
        <div>
          <label
            htmlFor="contact-message"
            className="mb-1 block text-sm font-medium text-[color:var(--text-secondary)]"
          >
            {t('contact.form.message')}
          </label>
          <textarea
            name="message"
            id="contact-message"
            className="input-field min-h-[120px]"
            required
            minLength={10}
            maxLength={5000}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t('contact.form.sending') : t('contact.form.submit')}
        </button>
      </fetcher.Form>
    </div>
  );
}
