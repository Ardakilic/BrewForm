import { useState } from 'react';
import { api } from '../../api/client';

export function AdminCachePage() {
  const [flushing, setFlushing] = useState(false);
  const [message, setMessage] = useState('');

  async function flushAll() {
    setFlushing(true);
    setMessage('');
    try {
      await api.post('/admin/cache/flush', {});
      setMessage('Cache flushed successfully!');
    } catch {
      setMessage('Failed to flush cache.');
    } finally {
      setFlushing(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Cache Management</h1>

      <div className="card">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Flush Cache</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          This will clear all cached data including taste note hierarchies, compatibility matrices, and search results.
        </p>
        <button type="button" onClick={flushAll} className="btn-primary" disabled={flushing}>
          {flushing ? 'Flushing...' : 'Flush All Cache'}
        </button>
        {message && (
          <p className="mt-3 text-sm" style={{ color: message.includes('Failed') ? 'var(--error)' : 'var(--success)' }}>
            {message}
          </p>
        )}
      </div>

      <div className="card mt-4">
        <h2 className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Cache Info</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The application uses Deno KV for caching frequently accessed data. Cache is automatically
          refreshed when underlying data changes, but you can manually flush it here.
        </p>
        <div className="mt-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          <p>Cache prefixes:</p>
          <ul className="list-disc list-inside mt-1">
            <li><code>taste:</code> — Taste note hierarchy and search results</li>
            <li><code>compatibility:</code> — Brew method compatibility matrix</li>
            <li><code>search:</code> — Recipe search results</li>
          </ul>
        </div>
      </div>
    </div>
  );
}