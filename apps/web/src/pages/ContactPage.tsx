import { type FormEvent, useState } from 'react';
import { SEOHead } from '../components/seo/SEOHead.tsx';
import { api } from '../api/client.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export function ContactPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const form = e.currentTarget;
    const formData = new FormData(form);
    const data: ContactFormData = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      subject: formData.get('subject') as string,
      message: formData.get('message') as string,
    };

    setLoading(true);
    try {
      await api.post<{ message: string }>('/contact', data);
      setSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('error.500');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className='mx-auto max-w-md px-6 py-12 text-center'>
        <SEOHead title={t('contact.title')} description={t('contact.description')} />
        <h1 className='text-2xl font-bold text-[color:var(--text-primary)]'>
          {t('contact.success.title')}
        </h1>
        <p className='mt-4 text-[color:var(--text-secondary)]'>
          {t('contact.success.message')}
        </p>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-2xl px-6 py-8'>
      <SEOHead title={t('contact.title')} description={t('contact.description')} />
      <h1 className='text-3xl font-bold text-[color:var(--text-primary)]'>
        {t('contact.title')}
      </h1>
      <p className='mt-2 text-[color:var(--text-secondary)]'>
        {t('contact.description')}
      </p>

      {error && (
        <div className='mt-4 rounded p-3 text-sm bg-[color:var(--error)] text-white'>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className='mt-6 flex flex-col gap-4'>
        <div>
          <label
            htmlFor='contact-name'
            className='mb-1 block text-sm font-medium text-[color:var(--text-secondary)]'
          >
            {t('contact.form.name')}
          </label>
          <input
            type='text'
            name='name'
            id='contact-name'
            className='input-field'
            required
            minLength={1}
            maxLength={100}
          />
        </div>
        <div>
          <label
            htmlFor='contact-email'
            className='mb-1 block text-sm font-medium text-[color:var(--text-secondary)]'
          >
            {t('contact.form.email')}
          </label>
          <input
            type='email'
            name='email'
            id='contact-email'
            className='input-field'
            required
            maxLength={255}
          />
        </div>
        <div>
          <label
            htmlFor='contact-subject'
            className='mb-1 block text-sm font-medium text-[color:var(--text-secondary)]'
          >
            {t('contact.form.subject')}
          </label>
          <input
            type='text'
            name='subject'
            id='contact-subject'
            className='input-field'
            required
            minLength={1}
            maxLength={200}
          />
        </div>
        <div>
          <label
            htmlFor='contact-message'
            className='mb-1 block text-sm font-medium text-[color:var(--text-secondary)]'
          >
            {t('contact.form.message')}
          </label>
          <textarea
            name='message'
            id='contact-message'
            className='input-field min-h-[120px]'
            required
            minLength={10}
            maxLength={5000}
          />
        </div>
        <button type='submit' className='btn-primary' disabled={loading}>
          {loading ? t('contact.form.sending') : t('contact.form.submit')}
        </button>
      </form>
    </div>
  );
}
