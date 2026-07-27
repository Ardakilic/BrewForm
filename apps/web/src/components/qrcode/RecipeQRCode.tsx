import { useState } from 'react';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useToast } from '../../components/ui/Toast.tsx';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('RecipeQRCode');

interface Props {
  slug: string;
  visibility: string;
}

/**
 * QR-code card with preview image and SVG download button for a recipe's
 * share URL. Hidden for private/draft recipes.
 */
export function RecipeQRCode({ slug, visibility }: Props) {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const toast = useToast();

  if (visibility === 'private' || visibility === 'draft') {
    return null;
  }

  function getQRUrl() {
    return `/api/v1/qrcode/recipe/${slug}.svg`;
  }

  async function download() {
    setLoading(true);
    try {
      const url = getQRUrl();
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `brewform-${slug}-qr.svg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      log.error({ err, slug }, 'QR code download failed');
      toast.error('qrcode.downloadFailed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='card'>
      <h4 className='font-semibold mb-3' style={{ color: 'var(--text-primary)' }}>QR Code</h4>
      <div className='flex items-center gap-3'>
        <button type='button' onClick={download} className='btn-primary text-sm' disabled={loading}>
          {loading ? t('qrcode.downloading') : t('qrcode.download')}
        </button>
      </div>
      <div className='mt-3'>
        <img
          src={getQRUrl()}
          alt={t('qrcode.alt')}
          className='w-32 h-32'
          loading='lazy'
          width={128}
          height={128}
        />
      </div>
    </div>
  );
}
