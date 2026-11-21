import type { PhotoOutput } from '@brewform/shared/schemas';
import { useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { useActionFeedback } from '../../hooks/useActionFeedback.ts';
import { PHOTO_UPLOAD_PATH, type uploadPhotoAction } from '../../routes/resources/photos.ts';
import { createLogger } from '../../utils/logger.ts';

const log = createLogger('PhotoUpload');

interface Props {
  recipeId: string;
  onUploadComplete?: (photos: PhotoOutput[]) => void;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const THUMBNAIL_MAX_DIMENSION = 600;
const THUMBNAIL_QUALITY = 0.85;

/**
 * Fixed multipart filename for each allowed type. Local filenames are never
 * sent; the server ignores the filename anyway and generates its own key.
 */
const UPLOAD_FILENAMES: Record<string, string> = {
  'image/jpeg': 'photo.jpg',
  'image/png': 'photo.png',
  'image/webp': 'photo.webp',
};

/** Fixed multipart filename of the client-generated JPEG thumbnail. */
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

/**
 * Draws a JPEG thumbnail (at most 600 px on its longer side) of an image file on a canvas.
 * Resolves `null` when the image cannot be decoded or the browser has no 2D canvas, in which
 * case the upload is sent without a thumbnail.
 */
async function createThumbnail(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });

    const ratio = Math.min(
      THUMBNAIL_MAX_DIMENSION / img.naturalWidth,
      THUMBNAIL_MAX_DIMENSION / img.naturalHeight,
      1,
    );
    const width = Math.round(img.naturalWidth * ratio);
    const height = Math.round(img.naturalHeight * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY);
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Builds the multipart body for one upload: the file and its thumbnail under fixed filenames
 * (local filenames are never sent) plus the recipe id.
 */
async function buildUploadForm(file: File, recipeId: string): Promise<FormData> {
  const formData = new FormData();
  formData.append('file', file, UPLOAD_FILENAMES[file.type] ?? 'photo.jpg');
  const thumbnail = await createThumbnail(file);
  if (thumbnail) formData.append('thumbnail', thumbnail, THUMBNAIL_FILENAME);
  formData.append('recipeId', recipeId);
  return formData;
}

/**
 * Drag-and-drop / file-picker photo uploader for a recipe. Validates
 * type and size (JPEG/PNG/WebP, max 10MB), generates a client-side
 * JPEG thumbnail, and uploads the valid files one at a time through the
 * `resources/photos` resource action (`fetcher.submit` with
 * `encType: 'multipart/form-data'`), under fixed multipart filenames. The action
 * maps server rejections by error code to the message shown here: size limits as
 * `photo.error.tooLarge`, unsupported or invalid images as
 * `photo.error.unsupportedType`, anything else as `photo.error.uploadFailed`.
 */
export function PhotoUpload({ recipeId, onUploadComplete }: Props) {
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fetcher = useFetcher<typeof uploadPhotoAction>();
  /** Valid files waiting for their turn (uploads run one at a time). */
  const queueRef = useRef<File[]>([]);
  /** The file whose upload is in flight, or `null` when idle. */
  const currentRef = useRef<File | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    log.debug({ recipeId }, 'PhotoUpload mounted');
    return () => {
      log.debug({ recipeId }, 'PhotoUpload unmounted');
    };
  }, [recipeId]);

  /** Starts the next queued upload, or marks the uploader idle when the queue is empty. */
  async function uploadNext() {
    const file = queueRef.current.shift();
    currentRef.current = file ?? null;
    if (!file) {
      setUploading(false);
      return;
    }
    const formData = await buildUploadForm(file, recipeId);
    void fetcher.submit(formData, {
      method: 'post',
      action: PHOTO_UPLOAD_PATH,
      encType: 'multipart/form-data',
    });
  }

  useActionFeedback(fetcher, {
    onSuccess: (result) => {
      const file = currentRef.current;
      if (result.ok && file) {
        setPreviews((prev) => [...prev, { url: URL.createObjectURL(file), name: file.name }]);
        onUploadComplete?.([result.photo]);
      }
      void uploadNext();
    },
    onError: (result) => {
      const name = currentRef.current?.name ?? '';
      if (!result.ok) setError(t(result.errorKey).replace('{name}', name));
      void uploadNext();
    },
  });

  /** Validates the picked or dropped files and queues the valid ones for upload. */
  function handleFiles(files: FileList | File[]) {
    setError('');
    const validFiles: File[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(t('photo.error.unsupportedType').replace('{name}', file.name));
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(t('photo.error.tooLarge').replace('{name}', file.name));
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    queueRef.current.push(...validFiles);
    if (!currentRef.current) {
      setUploading(true);
      void uploadNext();
    }
  }

  /** Uploads the files dropped on the drop zone. */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-opacity-60"
        style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="text-3xl mb-2">📷</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {t('photo.dropzone')}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {t('photo.hint')}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}

      {uploading && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('photo.uploading')}
        </p>
      )}

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {previews.map((preview) => (
            <div key={preview.name} className="relative aspect-square rounded overflow-hidden">
              <img
                src={preview.url}
                alt={preview.name}
                className="w-full h-full object-cover"
                loading="eager"
                width={200}
                height={200}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
