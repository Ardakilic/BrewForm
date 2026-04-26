import { useState, useRef, useCallback } from 'react';
import { api } from '../../api/client';

interface Props {
  recipeId: string;
  onUploadComplete?: (photos: Record<string, unknown>[]) => void;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
        formData.append('photo', file);
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
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-opacity-60"
        style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <div className="text-3xl mb-2">📷</div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Drop photos here or click to browse
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
          JPEG, PNG, or WebP — Max 10MB each
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
        <p className="mt-2 text-sm" style={{ color: 'var(--error)' }}>{error}</p>
      )}

      {uploading && (
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>Uploading...</p>
      )}

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {previews.map((preview) => (
            <div key={preview.name} className="relative aspect-square rounded overflow-hidden">
              <img src={preview.url} alt={preview.name} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}