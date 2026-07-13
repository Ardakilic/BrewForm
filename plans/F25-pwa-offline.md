# F25 — Offline Support / PWA

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below**
>
> - PWA shell (manifest, service worker, offline page, registration) is valid and purely additive — can ship independently.
> - Offline brew-log sync still POSTs `/api/v1/brew-logs`, which does not exist — blocked on F02 (and related F20). Ship the shell without sync or sequence after F02.
> - `sw.js` still contains TypeScript (typed `openIndexedDB(): Promise<IDBDatabase>`, `event.target as …`) inside a raw `.js` file — strip the types or compile the worker.

## Overview

Add Progressive Web App capabilities with service worker caching for recipe pages, offline brew logging with sync, and a web manifest for "Add to Home Screen" functionality.

## Goals

1. Enable "Add to Home Screen" with web manifest
2. Cache recipe detail pages for offline viewing
3. Allow offline brew logging with background sync
4. Show offline/online status indicator
5. Only enable PWA features in production builds

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Mobile user | Add BrewForm to my home screen | I can access it like a native app |
| US-2 | Mobile user | View recipe pages offline | I can reference recipes while brewing without internet |
| US-3 | Mobile user | Log brews offline | I can record brew data without connectivity |
| US-4 | Mobile user | See sync status of offline brew logs | I know when my data is safely uploaded |
| US-5 | Mobile user | See offline/online indicator | I know my connectivity status |

## Technical Design

### No New Tables

This is a frontend-only feature. No database schema changes required.

### Web Manifest

Create `apps/web/public/manifest.json`:

```json
{
  "name": "BrewForm",
  "short_name": "BrewForm",
  "description": "Coffee recipe management and brewing journal",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Service Worker

Create `apps/web/public/sw.js`:

```js
const CACHE_NAME = 'brewform-v1';
const RECIPE_CACHE = 'brewform-recipes-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
];

// Install event — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RECIPE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event — cache-first for recipes, network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for recipe pages
  if (url.pathname.startsWith('/recipes/')) {
    event.respondWith(
      caches.open(RECIPE_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;

          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            // Return offline page for recipes
            return cache.match('/offline.html');
          });
        });
      })
    );
    return;
  }

  // Network-first for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline' }),
          { headers: { 'Content-Type': 'application/json' }, status: 503 }
        );
      })
    );
    return;
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});

// Background sync for offline brew logs
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-brew-logs') {
    event.waitUntil(syncBrewLogs());
  }
});

/** Open the offline IndexedDB database. */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('brewform-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pendingBrewLogs')) {
        db.createObjectStore('pendingBrewLogs', { keyPath: 'id' });
      }
    };
  });
}

async function syncBrewLogs() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction('pendingBrewLogs', 'readwrite');
    const store = tx.objectStore('pendingBrewLogs');
    const logs = await store.getAll();

    for (const log of logs) {
      try {
        await fetch('/api/v1/brew-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log.data),
        });
        await store.delete(log.id);
      } catch (err) {
        console.error('Sync failed for log:', log.id, err);
      }
    }
  } catch (err) {
    console.error('syncBrewLogs failed:', err);
  }
}
```

### Offline Brew Logging

Create `apps/web/src/utils/offline-db.ts`:

```ts
/**
 * IndexedDB wrapper for offline brew log storage.
 */

const DB_NAME = 'brewform-offline';
const DB_VERSION = 1;

interface PendingBrewLog {
  id: string;
  data: Record<string, unknown>;
  createdAt: number;
  synced: boolean;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('pendingBrewLogs')) {
        db.createObjectStore('pendingBrewLogs', { keyPath: 'id' });
      }
    };
  });
}

export async function savePendingBrewLog(data: Record<string, unknown>): Promise<string> {
  const db = await openDB();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingBrewLogs', 'readwrite');
    const store = tx.objectStore('pendingBrewLogs');

    const log: PendingBrewLog = {
      id,
      data,
      createdAt: Date.now(),
      synced: false,
    };

    store.put(log);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingBrewLogs(): Promise<PendingBrewLog[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingBrewLogs', 'readonly');
    const store = tx.objectStore('pendingBrewLogs');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deletePendingBrewLog(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingBrewLogs', 'readwrite');
    const store = tx.objectStore('pendingBrewLogs');
    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncPendingBrewLogs(): Promise<{ synced: number; failed: number }> {
  const logs = await getPendingBrewLogs();
  let synced = 0;
  let failed = 0;

  for (const log of logs) {
    try {
      const response = await fetch('/api/v1/brew-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log.data),
      });

      if (response.ok) {
        await deletePendingBrewLog(log.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
```

### Offline Indicator Component

Create `apps/web/src/components/ui/OfflineIndicator.tsx`:

```tsx
import { useState, useEffect } from 'react';

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) {
      // Sync pending logs when coming back online
      import('../../utils/offline-db.ts').then(({ syncPendingBrewLogs }) => {
        syncPendingBrewLogs().then(({ synced }) => {
          if (synced > 0) {
            setPendingCount(0);
          }
        });
      });
    }
  }, [isOnline]);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg ${
      isOnline ? 'bg-yellow-500' : 'bg-red-500'
    } text-white text-sm`}>
      {isOnline ? (
        <span>Syncing {pendingCount} pending logs...</span>
      ) : (
        <span>Offline — brew logs will sync when connected</span>
      )}
    </div>
  );
}
```

### Service Worker Registration

Modify `apps/web/src/main.tsx`:

```tsx
// Register service worker in production only
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('SW registered:', registration.scope);
    }).catch((err) => {
      console.error('SW registration failed:', err);
    });
  });
}
```

### Manifest Link

Modify `apps/web/index.html`:

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#3b82f6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="/icons/icon-192x192.png">
```

### Offline Page

Create `apps/web/public/offline.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline — BrewForm</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #374151; }
    p { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're offline</h1>
    <p>Please check your internet connection and try again.</p>
    <p>Cached recipe pages are still available.</p>
  </div>
</body>
</html>
```

## API Endpoints

No new endpoints — offline functionality is client-side only.

## Acceptance Criteria

- [ ] Web manifest is accessible at /manifest.json
- [ ] Service worker is registered in production
- [ ] Recipe pages are cached for offline viewing
- [ ] Offline page is shown when navigating to uncached pages offline
- [ ] Brew logs can be created offline and stored in IndexedDB
- [ ] Pending brew logs sync when connection is restored
- [ ] Offline/online indicator is visible
- [ ] PWA only enabled in production builds
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Create `apps/web/public/manifest.json`
2. Create `apps/web/public/sw.js` — service worker
3. Create `apps/web/public/offline.html` — offline fallback page
4. Create `apps/web/src/utils/offline-db.ts` — IndexedDB wrapper
5. Create `apps/web/src/components/ui/OfflineIndicator.tsx`
6. Modify `apps/web/src/main.tsx` — register service worker
7. Modify `apps/web/index.html` — add manifest and meta tags
8. Generate PWA icons (72x72, 96x96, 128x128, 144x144, 192x192, 512x512)
9. Write tests for offline-db utility
10. Run `make check && make lint && make test`

## Dependencies

- Existing Vite build configuration
- Existing frontend router
- Browser APIs: Service Worker, IndexedDB, navigator.onLine
