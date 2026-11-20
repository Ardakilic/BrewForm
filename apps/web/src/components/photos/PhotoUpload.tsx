import type { PhotoOutput } from '@brewform/shared/schemas';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

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

/** Server error codes for a part or body over its size limit. */
const TOO_LARGE_CODES = new Set(['FILE_TOO_LARGE', 'PAYLOAD_TOO_LARGE']);

/** Server error codes for content that is not an accepted, well-formed image. */
const UNSUPPORTED_CODES = new Set(['UNSUPPORTED_MEDIA_TYPE', 'INVALID_IMAGE']);

/**
 * The server error `code` carried by a failed upload (an `ApiError`), or
 * `undefined` for any other rejection (network failure, abort, bug). Checked
 * structurally so this component does not depend on where `ApiError` lives.
 */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * The i18n key describing a failed upload: too large, unsupported/invalid
 * image, or the generic upload failure.
 */
function uploadErrorKey(err: unknown): string {
  const code = errorCode(err);
  if (code && TOO_LARGE_CODES.has(code)) return 'photo.error.tooLarge';
  if (code && UNSUPPORTED_CODES.has(code)) return 'photo.error.unsupportedType';
  return 'photo.error.uploadFailed';
}

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
 * Drag-and-drop / file-picker photo uploader for a recipe. Validates
 * type and size (JPEG/PNG/WebP, max 10MB), generates a client-side
 * JPEG thumbnail, and uploads each file to `/photos` under fixed multipart
 * filenames. Server rejections are shown by error code: size limits as
 * `photo.error.tooLarge`, unsupported or invalid images as
 * `photo.error.unsupportedType`, anything else as `photo.error.uploadFailed`.
 */
export function PhotoUpload({ recipeId, onUploadComplete }: Props) {
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
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

      setUploading(true);
      for (const file of validFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file, UPLOAD_FILENAMES[file.type] ?? 'photo.jpg');
          const thumbnail = await createThumbnail(file);
          if (thumbnail) {
            formData.append('thumbnail', thumbnail, THUMBNAIL_FILENAME);
          }
          formData.append('recipeId', recipeId);
          const result = await api.upload<PhotoOutput>('/photos', formData);
          setPreviews((prev) => [...prev, { url: URL.createObjectURL(file), name: file.name }]);
          onUploadComplete?.([result]);
        } catch (err) {
          setError(t(uploadErrorKey(err)).replace('{name}', file.name));
        }
      }
      setUploading(false);
    },
    [recipeId, onUploadComplete, t],
  );

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
