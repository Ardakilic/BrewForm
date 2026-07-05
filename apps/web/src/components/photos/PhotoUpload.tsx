import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client.ts';

interface Props {
  recipeId: string;
  onUploadComplete?: (photos: Record<string, unknown>[]) => void;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const THUMBNAIL_MAX_DIMENSION = 600;
const THUMBNAIL_QUALITY = 0.85;

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
 * JPEG thumbnail, and uploads each file to `/photos`.
 */
export function PhotoUpload({ recipeId, onUploadComplete }: Props) {
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    setError('');
    const validFiles: File[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`${file.name}: Unsupported file type. Use JPEG, PNG, or WebP.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`${file.name}: File too large. Max 10MB.`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    setUploading(true);
    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const thumbnail = await createThumbnail(file);
        if (thumbnail) {
          const thumbName = file.name.replace(/\.[^.]+$/, '') + '_thumb.jpg';
          formData.append('thumbnail', thumbnail, thumbName);
        }
        formData.append('recipeId', recipeId);
        const result = await api.upload<Record<string, unknown>>('/photos', formData);
        setPreviews((prev) => [...prev, { url: URL.createObjectURL(file), name: file.name }]);
        onUploadComplete?.([result]);
      } catch {
        setError(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
  }, [recipeId, onUploadComplete]);

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
        className='flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-opacity-60'
        style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className='text-3xl mb-2'>📷</div>
        <p className='text-sm font-medium' style={{ color: 'var(--text-primary)' }}>
          Drop photos here or click to browse
        </p>
        <p className='text-xs mt-1' style={{ color: 'var(--text-tertiary)' }}>
          JPEG, PNG, or WebP — Max 10MB each
        </p>
        <input
          ref={inputRef}
          type='file'
          accept='image/jpeg,image/png,image/webp'
          multiple
          className='hidden'
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {error && <p className='mt-2 text-sm' style={{ color: 'var(--error)' }}>{error}</p>}

      {uploading && (
        <p className='mt-2 text-sm' style={{ color: 'var(--text-secondary)' }}>Uploading...</p>
      )}

      {previews.length > 0 && (
        <div className='mt-4 grid grid-cols-3 gap-2'>
          {previews.map((preview) => (
            <div key={preview.name} className='relative aspect-square rounded overflow-hidden'>
              <img
                src={preview.url}
                alt={preview.name}
                className='w-full h-full object-cover'
                loading='eager'
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
