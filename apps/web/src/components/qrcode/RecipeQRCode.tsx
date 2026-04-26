import { useState } from 'react';

interface Props {
  slug: string;
  visibility: string;
}

export function RecipeQRCode({ slug, visibility }: Props) {
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [loading, setLoading] = useState(false);

  if (visibility === 'private' || visibility === 'draft') {
    return null;
  }

  function getQRUrl(ext: 'png' | 'svg') {
    return `/api/v1/qrcode/recipe/${slug}.${ext}`;
  }

  async function download() {
    setLoading(true);
    try {
      const url = getQRUrl(format);
      const response = await fetch(url);
      const blob = await response.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `brewform-${slug}-qr.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>QR Code</h4>
      <div className="flex items-center gap-3">
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as 'png' | 'svg')}
          className="input-field w-auto"
        >
          <option value="png">PNG</option>
          <option value="svg">SVG</option>
        </select>
        <button type="button" onClick={download} className="btn-primary text-sm" disabled={loading}>
          {loading ? 'Downloading...' : 'Download QR Code'}
        </button>
      </div>
      <div className="mt-3">
        <img
          src={getQRUrl('png')}
          alt="Recipe QR Code"
          className="w-32 h-32"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    </div>
  );
}