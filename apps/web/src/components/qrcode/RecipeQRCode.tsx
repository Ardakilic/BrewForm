import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useRecipeQrDownload } from './useRecipeQrDownload.ts';

/** Props for {@link RecipeQRCode}. */
interface Props {
  slug: string;
  visibility: string;
}

/**
 * QR-code card with preview image and SVG download button for a recipe's
 * share URL. Hidden for private/draft recipes. The download goes through
 * {@link useRecipeQrDownload} (a fetcher against the `resources/qrcode/recipe/:slug` resource
 * route, with an error toast on failure); the `<img>` preview keeps its plain `src` URL.
 */
export function RecipeQRCode({ slug, visibility }: Props) {
  const { t } = useTranslation();
  const { download, downloading } = useRecipeQrDownload(slug);

  if (visibility === 'private' || visibility === 'draft') {
    return null;
  }

  /** The QR-code image URL used by the preview `<img>`. */
  function getQRUrl() {
    return `/api/v1/qrcode/recipe/${slug}.svg`;
  }

  return (
    <div className="card">
      <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
        QR Code
      </h4>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={download}
          className="btn-primary text-sm"
          disabled={downloading}
        >
          {downloading ? t('qrcode.downloading') : t('qrcode.download')}
        </button>
      </div>
      <div className="mt-3">
        <img
          src={getQRUrl()}
          alt={t('qrcode.alt')}
          className="w-32 h-32"
          loading="lazy"
          width={128}
          height={128}
        />
      </div>
    </div>
  );
}
