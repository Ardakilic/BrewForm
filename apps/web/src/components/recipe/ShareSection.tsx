import { useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface ShareSectionProps {
  slug: string;
  title: string;
  visibility: string;
}

export function ShareSection({ slug, title, visibility }: ShareSectionProps) {
  const { t } = useTranslation();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  // Hidden when private or draft (Requirement 9.9)
  if (visibility === 'private' || visibility === 'draft') {
    return null;
  }

  const shareUrl = `${window.location.origin}/recipes/${slug}`;
  const qrImageUrl = `/api/v1/qrcode/recipe/${slug}.svg`;

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  const socialUrls = {
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
  };

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 3000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 3000);
    }
  }

  async function handleDownloadSvg() {
    try {
      const response = await fetch(`/api/v1/qrcode/recipe/${slug}.svg`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `brewform-${slug}-qr.svg`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Silently fail — browser will handle the error
    }
  }

  function handleSocialShare(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=400');
  }

  return (
    <section className='card' aria-label='Share recipe'>
      {/* Section header */}
      <div className='mb-4'>
        <span
          className='text-xs font-semibold uppercase tracking-widest'
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('recipe.share.title')}
        </span>
      </div>

      {/* Body: QR code left, controls right */}
      <div className='flex flex-col sm:flex-row gap-4 sm:items-center'>
        {/* QR code image (Requirement 9.1) */}
        <div className='flex-shrink-0'>
          <img
            src={qrImageUrl}
            alt={`QR code for recipe: ${title} (SVG)`}
            width={128}
            height={128}
            style={{ minWidth: '128px', minHeight: '128px' }}
            className='rounded-lg'
          />
        </div>

        {/* Right side: buttons */}
        <div className='flex flex-col gap-3 flex-1 min-w-0'>
          {/* Copy URL + Download QR buttons */}
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={handleCopy}
              className='btn-secondary text-sm flex-1 min-h-11'
              aria-label='Copy recipe URL to clipboard'
            >
              {copyState === 'copied'
                ? t('recipe.share.copied')
                : copyState === 'error'
                  ? t('recipe.share.copyError')
                  : t('recipe.share.copyUrl')}
            </button>

            <button
              type='button'
              onClick={handleDownloadSvg}
              className='btn-secondary text-sm flex-1 min-h-11'
              aria-label='Download QR code as SVG'
            >
              {t('recipe.share.downloadQr')}
            </button>
          </div>

          {/* Social share buttons */}
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => handleSocialShare(socialUrls.twitter)}
              className='btn-secondary text-sm flex-1 min-h-11 flex items-center justify-center gap-1'
              aria-label='Share on Twitter/X'
            >
              <span aria-hidden='true'>𝕏</span>
              <span className='sr-only'>Twitter/X</span>
            </button>

            <button
              type='button'
              onClick={() => handleSocialShare(socialUrls.facebook)}
              className='btn-secondary text-sm flex-1 min-h-11 flex items-center justify-center gap-1'
              aria-label='Share on Facebook'
            >
              <span aria-hidden='true'>
                <svg
                  width='16'
                  height='16'
                  viewBox='0 0 24 24'
                  fill='currentColor'
                  aria-hidden='true'
                >
                  <path d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' />
                </svg>
              </span>
              <span className='sr-only'>Facebook</span>
            </button>

            <button
              type='button'
              onClick={() => handleSocialShare(socialUrls.whatsapp)}
              className='btn-secondary text-sm flex-1 min-h-11 flex items-center justify-center gap-1'
              aria-label='Share on WhatsApp'
            >
              <span aria-hidden='true'>
                <svg
                  width='16'
                  height='16'
                  viewBox='0 0 24 24'
                  fill='currentColor'
                  aria-hidden='true'
                >
                  <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' />
                </svg>
              </span>
              <span className='sr-only'>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
