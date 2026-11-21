import { useEffect } from 'react';
import { useFetcher } from 'react-router';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { type recipeQrLoader, recipeQrPath } from '../../routes/resources/qrcode.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('useRecipeQrDownload');

/** What {@link useRecipeQrDownload} returns. */
export interface RecipeQrDownload {
  /** Starts the download (loads the SVG through the resource route). */
  download: () => void;
  /** True while the SVG is loading. */
  downloading: boolean;
}

/**
 * Saves `svg` as the file `brewform-<slug>-qr.svg`: wraps it in an `image/svg+xml` `Blob` and
 * clicks a temporary download anchor, then revokes the object URL.
 */
function saveSvg(svg: string, slug: string): void {
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `brewform-${slug}-qr.svg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * The recipe QR-code SVG download shared by `RecipeQRCode` and `ShareSection`. `download()`
 * calls `fetcher.load('/resources/qrcode/recipe/<slug>')` (the resource loader reads the SVG
 * with `qrcodeApi.recipeSvg`, so the runtime API base applies and a repeat click cancels the
 * previous load). On `{ ok: true }` it saves the SVG as `brewform-<slug>-qr.svg`; on
 * `{ ok: false }` it shows `toast.error('qrcode.downloadFailed')`.
 */
export function useRecipeQrDownload(slug: string): RecipeQrDownload {
  const fetcher = useFetcher<typeof recipeQrLoader>();

  useEffect(() => {
    log.debug({ slug }, 'useRecipeQrDownload mounted');
    return () => {
      log.debug({ slug }, 'useRecipeQrDownload unmounted');
    };
  }, [slug]);

  useActionFeedback(fetcher, {
    errorKey: 'qrcode.downloadFailed',
    onSuccess: (data) => {
      if (!data.ok) return;
      saveSvg(data.svg, slug);
      log.debug({ slug }, 'useRecipeQrDownload saved the QR code');
    },
  });

  return {
    download: () => {
      fetcher.load(recipeQrPath(slug));
    },
    downloading: fetcher.state !== 'idle',
  };
}
