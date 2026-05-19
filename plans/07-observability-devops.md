# Plan 07 -- Observability & DevOps

**Phase:** 7 of 8
**Issues:** M10, M11, M5, L1, L10, N8
**Estimated total:** 3-4 days
**Prerequisites:** Phase 1 (C2 ErrorBoundary) should be complete before M10 frontend integration

---

## Table of Contents

1. [M10 -- No Error Monitoring Service](#m10----no-error-monitoring-service)
2. [M11 -- No Web Vitals Tracking](#m11----no-web-vitals-tracking)
3. [M5 -- No Analytics / Usage Tracking](#m5----no-analytics--usage-tracking)
4. [L1 -- Vite Build Sourcemaps Disabled](#l1----vite-build-sourcemaps-disabled)
5. [L10 -- Cookie Consent is Cosmetic Only](#l10----cookie-consent-is-cosmetic-only)
6. [N8 -- No CI Test Job](#n8----no-ci-test-job)
7. [Dependency Graph](#dependency-graph)
8. [Implementation Order](#implementation-order)

---

## M10 -- No Error Monitoring Service

**Priority:** Medium
**Effort:** Medium (4-6 hours)
**Depends on:** C2 (ErrorBoundary) for frontend integration, L1 (sourcemaps) for readable stack traces

### Evidence

- Zero Sentry, Datadog, Rollbar, or any error monitoring library anywhere in the codebase.
- `apps/api/src/middleware/errorHandler.ts` -- logs to pino (structured JSON) via `createLogger('errorHandler')` but errors are only visible in Deno Deploy's ephemeral log viewer. No alerting, no aggregation, no deduplication.
- `apps/api/src/main.ts:52` -- `app.onError(errorHandler)` is the sole error handling surface; unhandled promise rejections in background jobs (cron, etc.) have no capture at all.
- Frontend has zero error reporting -- React render errors crash silently after the white screen.

### Impact

Production errors are invisible once the Deno Deploy log window scrolls past them. No alerting on error spikes, no stack trace aggregation, no affected-user counts. Debugging production issues requires reproducing them locally.

### Action Plan

#### Recommended approach: Sentry via HTTP API (Deno-native)

Sentry's official Node.js SDK (`@sentry/node`) depends on Node.js-specific APIs that do not work in Deno Deploy. The `@sentry/deno` package has not been verified to work reliably on Deno Deploy's isolate model. The most reliable approach for Deno Deploy is to use Sentry's **Envelope API** directly via `fetch` -- this is platform-agnostic and requires zero native dependencies.

Alternative services that also support plain HTTP ingestion: **Axiom**, **LogTail** (Better Stack), **HyperDX**. The pattern below uses Sentry as the example but the HTTP approach works identically with any service that accepts JSON error payloads.

#### Step 1: Create the error reporting utility

```ts
// apps/api/src/utils/errorReporting.ts
import { config } from '../config/index.ts';
import { createLogger } from './logger/index.ts';

const log = createLogger('errorReporting');

/**
 * Lightweight Sentry error reporter using the Envelope HTTP API.
 * Works in Deno Deploy without any Node.js-specific SDKs.
 *
 * Set SENTRY_DSN in environment to enable.
 * DSN format: https://<public_key>@<host>/<project_id>
 */

interface SentryDsnParts {
  publicKey: string;
  host: string;
  projectId: string;
}

function parseDsn(dsn: string): SentryDsnParts | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace('/', '');
    return {
      publicKey: url.username,
      host: `${url.protocol}//${url.host}`,
      projectId,
    };
  } catch {
    log.warn('Invalid SENTRY_DSN format, error reporting disabled');
    return null;
  }
}

const dsn = config.SENTRY_DSN ? parseDsn(config.SENTRY_DSN) : null;

interface ErrorContext {
  requestId?: string;
  userId?: string;
  url?: string;
  method?: string;
  extra?: Record<string, unknown>;
}

/**
 * Report an error to Sentry via the Envelope HTTP API.
 * Non-blocking -- fires and forgets. Never throws.
 */
export async function captureException(
  error: Error,
  context: ErrorContext = {},
): Promise<void> {
  if (!dsn) return;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Date.now() / 1000;

  const event = {
    event_id: eventId,
    timestamp,
    platform: 'javascript',
    server_name: 'brewform-api',
    environment: config.APP_ENV,
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack
            ? {
              frames: parseStackFrames(error.stack),
            }
            : undefined,
        },
      ],
    },
    tags: {
      runtime: 'deno',
      request_id: context.requestId,
    },
    user: context.userId ? { id: context.userId } : undefined,
    request: context.url
      ? {
        url: context.url,
        method: context.method,
      }
      : undefined,
    extra: context.extra,
  };

  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    dsn: config.SENTRY_DSN,
    sent_at: new Date().toISOString(),
  });
  const itemHeader = JSON.stringify({
    type: 'event',
    content_type: 'application/json',
  });
  const payload = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;

  try {
    const response = await fetch(
      `${dsn.host}/api/${dsn.projectId}/envelope/`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth':
            `Sentry sentry_version=7, sentry_client=brewform-deno/1.0, sentry_key=${dsn.publicKey}`,
        },
        body: payload,
      },
    );
    if (!response.ok) {
      log.warn({ status: response.status }, 'Sentry envelope rejected');
    }
  } catch (err) {
    // Never let error reporting break the application
    log.warn({ err }, 'Failed to send error to Sentry');
  }
}

/**
 * Parse a V8 stack trace string into Sentry-compatible frames.
 * Frames are reversed because Sentry expects most-recent-last.
 */
function parseStackFrames(
  stack: string,
): Array<{ filename: string; lineno?: number; colno?: number; function: string }> {
  const lines = stack.split('\n').slice(1); // skip the error message line
  const frames = lines
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3], 10),
          colno: parseInt(match[4], 10),
        };
      }
      const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (simpleMatch) {
        return {
          function: '<anonymous>',
          filename: simpleMatch[1],
          lineno: parseInt(simpleMatch[2], 10),
          colno: parseInt(simpleMatch[3], 10),
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{
      filename: string;
      lineno?: number;
      colno?: number;
      function: string;
    }>;

  return frames.reverse(); // Sentry expects most-recent frame last
}
```

#### Step 2: Add `SENTRY_DSN` to the config module

```ts
// apps/api/src/config/env.ts -- add to the config object:
SENTRY_DSN: Deno.env.get('SENTRY_DSN') || '',
```

#### Step 3: Integrate into errorHandler.ts

```ts
// apps/api/src/middleware/errorHandler.ts
import type { Context } from 'hono';
import { createLogger } from '../utils/logger/index.ts';
import { captureException } from '../utils/errorReporting.ts';
import { config } from '../config/index.ts';

const log = createLogger('errorHandler');

export function errorHandler(err: Error, c: Context) {
  const requestId = c.get('requestId') as string | undefined;
  const userId = c.get('userId') as string | undefined;

  if (err.name === 'PostgresError') {
    const pgErr = err as { code?: string };
    log.error({ err, requestId, pgCode: pgErr.code }, 'Database error');

    // Report all database errors to monitoring
    captureException(err, {
      requestId,
      userId,
      url: c.req.url,
      method: c.req.method,
      extra: { pgCode: pgErr.code },
    });

    if (pgErr.code === '23505') {
      return c.json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'A record with this value already exists',
          requestId,
        },
      }, 409);
    }
  }

  if (err.name === 'ZodError') {
    // Validation errors are expected -- do NOT report to Sentry
    const zodErr = err as unknown as {
      issues?: Array<{ path: (string | number)[]; message: string }>;
    };
    const details = zodErr.issues?.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    })) || [];
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
        requestId,
      },
    }, 400);
  }

  if (
    err.name === 'UnauthorizedError' ||
    (err instanceof Error &&
      (err.message === 'Invalid token' || err.message === 'jwt expired' ||
        err.message === 'jwt malformed'))
  ) {
    // Auth errors are expected -- do NOT report to Sentry
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        requestId,
      },
    }, 401);
  }

  // This is an unexpected error -- ALWAYS report to Sentry
  log.error({ err, requestId }, 'Unhandled error');
  captureException(err, {
    requestId,
    userId,
    url: c.req.url,
    method: c.req.method,
  });

  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.APP_ENV === 'production' ? 'Something went wrong' : err.message,
      requestId,
    },
  }, 500);
}
```

#### Step 4: Add global unhandled rejection capture

```ts
// apps/api/src/main.ts -- add near the top, after imports:
import { captureException } from './utils/errorReporting.ts';

// Capture unhandled promise rejections (e.g. from cron jobs)
globalThis.addEventListener('unhandledrejection', (event) => {
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));
  captureException(error, { extra: { type: 'unhandledrejection' } });
});
```

#### Step 5: Frontend error reporting

Create a lightweight browser-side reporter that sends errors to a custom API endpoint (avoids needing Sentry's browser SDK, which is 30KB+ gzipped).

```ts
// apps/web/src/utils/errorReporting.ts

const ERROR_ENDPOINT = `${import.meta.env.VITE_API_URL}/errors`;

interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  timestamp: number;
  userAgent: string;
}

/**
 * Report a frontend error to the API, which forwards it to Sentry.
 * Non-blocking, fire-and-forget. Never throws.
 */
export function reportError(error: Error, componentStack?: string): void {
  const report: ErrorReport = {
    message: error.message,
    stack: error.stack,
    componentStack,
    url: window.location.href,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };

  // Use sendBeacon for reliability (survives page unload)
  const blob = new Blob([JSON.stringify(report)], { type: 'application/json' });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ERROR_ENDPOINT, blob);
  } else {
    fetch(ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => {
      // Silently ignore -- error reporting must never break the app
    });
  }
}
```

#### Step 6: Create the API-side error ingestion endpoint

```ts
// apps/api/src/modules/errors/index.ts
import { Hono } from 'hono';
import { captureException } from '../../utils/errorReporting.ts';
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('frontend-errors');
const errors = new Hono();

errors.post('/', async (c) => {
  const body = await c.req.json();

  const error = new Error(body.message || 'Frontend error');
  error.stack = body.stack || '';

  log.warn({ url: body.url, userAgent: body.userAgent }, 'Frontend error received');

  await captureException(error, {
    extra: {
      source: 'frontend',
      componentStack: body.componentStack,
      pageUrl: body.url,
      userAgent: body.userAgent,
    },
  });

  return c.json({ received: true });
});

export default errors;
```

Register in `apps/api/src/routes/index.ts`:

```ts
import errors from '../modules/errors/index.ts';
// ...
app.route('/errors', errors);
```

#### Step 7: Wire into React ErrorBoundary

After C2 (ErrorBoundary) is implemented, add error reporting to it. In the `RootErrorBoundary` from `apps/web/src/components/ErrorBoundary.tsx`:

```tsx
import { useRouteError, isRouteErrorResponse } from 'react-router';
import { reportError } from '../utils/errorReporting';

export function RootErrorBoundary() {
  const error = useRouteError();

  // Report to monitoring
  if (error instanceof Error) {
    reportError(error);
  }

  // ... existing UI rendering (see plan 01)
}
```

#### Step 8: Add global window.onerror handler

```tsx
// apps/web/src/main.tsx -- add before createRoot:
import { reportError } from './utils/errorReporting';

window.onerror = (_message, _source, _lineno, _colno, error) => {
  if (error) reportError(error);
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const error = event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));
  reportError(error);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### Environment Variables

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `SENTRY_DSN` | No | `https://abc123@o123.ingest.sentry.io/456` | Omit to disable reporting |

When `SENTRY_DSN` is empty, `captureException()` is a no-op. This means local development and tests produce zero external calls.

---

## M11 -- No Web Vitals Tracking

**Priority:** Medium
**Effort:** Small (2-3 hours)
**Depends on:** M5 (analytics endpoint to send metrics to) or M10 (custom endpoint)

### Evidence

- Zero matches for `web-vital`, `LCP`, `CLS`, `INP`, `PerformanceObserver` anywhere in `apps/web/src/`.
- No performance monitoring of any kind on the frontend.

### Impact

Cannot measure real-user performance. No data to identify slow pages, layout shifts, or interaction delays. Optimization decisions are guesswork.

### Action Plan

The `web-vitals` library (https://github.com/GoogleChrome/web-vitals) is a tiny (~1.5KB gzipped) browser-only library maintained by the Chrome team. It works in any browser context -- it does **not** use Deno runtime APIs and is safe to bundle with Vite.

#### Step 1: Add the web-vitals dependency

```json
// apps/web/deno.json -- add to imports:
"web-vitals": "npm:web-vitals@^4"
```

#### Step 2: Create the vitals reporting module

```ts
// apps/web/src/utils/webVitals.ts
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import type { Metric } from 'web-vitals';

/**
 * Initializes Web Vitals tracking and reports metrics.
 *
 * Tracked metrics:
 * - LCP (Largest Contentful Paint): loading performance
 * - CLS (Cumulative Layout Shift): visual stability
 * - INP (Interaction to Next Paint): responsiveness
 * - TTFB (Time to First Byte): server responsiveness
 * - FCP (First Contentful Paint): perceived load speed
 *
 * Call once in main.tsx after the app mounts.
 */
export function initWebVitals(): void {
  const reportMetric = (metric: Metric) => {
    // Option A: Send to analytics (if Plausible/Umami is configured)
    sendToAnalytics(metric);

    // Option B: Send to custom API endpoint
    sendToEndpoint(metric);

    // Always log in development for debugging
    if (import.meta.env.DEV) {
      console.debug(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)}`);
    }
  };

  onLCP(reportMetric);
  onCLS(reportMetric);
  onINP(reportMetric);
  onTTFB(reportMetric);
  onFCP(reportMetric);
}

function sendToAnalytics(metric: Metric): void {
  // If using Plausible, send as custom event
  // This is gated by consent -- see L10
  if (typeof window !== 'undefined' && 'plausible' in window) {
    (window as Record<string, unknown>).plausible?.('Web Vitals', {
      props: {
        metric: metric.name,
        value: Math.round(metric.value),
        rating: metric.rating, // 'good' | 'needs-improvement' | 'poor'
        page: window.location.pathname,
      },
    });
  }
}

function sendToEndpoint(metric: Metric): void {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType,
    url: window.location.href,
    timestamp: Date.now(),
  });

  // Use sendBeacon for reliability (survives page navigation/close)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${import.meta.env.VITE_API_URL}/vitals`,
      new Blob([body], { type: 'application/json' }),
    );
  }
}
```

#### Step 3: Create the API-side vitals ingestion endpoint

```ts
// apps/api/src/modules/vitals/index.ts
import { Hono } from 'hono';
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('vitals');
const vitals = new Hono();

/**
 * Ingests Web Vitals metrics from the frontend.
 * In production, these can be forwarded to a time-series database
 * or logged for later analysis via Deno Deploy's log drain.
 */
vitals.post('/', async (c) => {
  const metric = await c.req.json();

  log.info({
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    url: metric.url,
  }, 'Web vital received');

  // Future: store in Deno KV for aggregation, or forward to
  // a time-series backend (InfluxDB, Prometheus pushgateway, etc.)

  return c.json({ received: true });
});

export default vitals;
```

Register in `apps/api/src/routes/index.ts`:

```ts
import vitals from '../modules/vitals/index.ts';
// ...
app.route('/vitals', vitals);
```

#### Step 4: Initialize in main.tsx

```tsx
// apps/web/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { initWebVitals } from './utils/webVitals';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Initialize after mount -- metrics are collected asynchronously
initWebVitals();
```

### Web Vitals Thresholds Reference

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | <= 2.5s | <= 4.0s | > 4.0s |
| CLS | <= 0.1 | <= 0.25 | > 0.25 |
| INP | <= 200ms | <= 500ms | > 500ms |
| TTFB | <= 800ms | <= 1800ms | > 1800ms |
| FCP | <= 1.8s | <= 3.0s | > 3.0s |

---

## M5 -- No Analytics / Usage Tracking

**Priority:** Medium
**Effort:** Medium (4-6 hours)
**Depends on:** L10 (cookie consent) must be functional before analytics goes live

### Evidence

- `apps/web/src/pages/PrivacyPage.tsx:49` -- mentions "analytics" in the privacy policy text: `"We use cookies for authentication, preferences, and analytics."` This is purely cosmetic; no analytics code exists.
- `apps/api/src/modules/admin/index.ts` -- has admin analytics endpoints (`/analytics/users`, `/analytics/recipes`, `/analytics/top-recipes`, `/analytics/top-users`) but these are internal database queries, not user-behavior analytics.
- Zero imports of any analytics library (GA, Plausible, Umami, PostHog, Mixpanel) in the entire codebase.

### Impact

No data on user behavior, feature adoption, conversion funnels, or traffic sources. Cannot measure the impact of new features or marketing efforts. Product decisions are uninformed.

### Action Plan

#### Recommended solution: Plausible Analytics

**Why Plausible over alternatives:**

| Criteria | Plausible | Umami | Google Analytics |
|----------|-----------|-------|-----------------|
| GDPR-compliant by default | Yes | Yes | No (requires consent) |
| Cookie-free option | Yes | Yes | No |
| Self-hostable | Yes | Yes | No |
| Script size | ~1KB | ~2KB | ~45KB |
| Deno Deploy compatible | Yes (external script) | Yes | Yes |
| Custom events | Yes | Yes | Yes |

Plausible is recommended because:
1. Cookie-free mode means it works **without** consent for basic page views (no personal data stored)
2. Custom events (recipe views, registrations) **do** require consent
3. Tiny script (1KB) with zero impact on Core Web Vitals
4. Cloud-hosted option at plausible.io avoids self-hosting overhead
5. Simple one-line integration

#### Step 1: Add the Plausible script to index.html (consent-gated)

The script must NOT be added directly to `index.html` as a static `<script>` tag. Instead, it will be loaded dynamically by the consent context (see L10). However, we do define the data attributes here for reference:

```html
<!-- 
  NOTE: This script is NOT added to index.html directly.
  It is loaded dynamically by ConsentContext when the user accepts analytics.
  Shown here for reference only.
-->
<script 
  defer 
  data-domain="brewform.app" 
  src="https://plausible.io/js/script.js"
></script>
```

#### Step 2: Create the analytics utility module

```ts
// apps/web/src/utils/analytics.ts

declare global {
  interface Window {
    plausible?: (
      event: string,
      options?: { props?: Record<string, string | number | boolean> },
    ) => void;
  }
}

/**
 * Load the Plausible analytics script dynamically.
 * Called by ConsentContext when the user grants analytics consent.
 */
export function loadAnalytics(): void {
  if (document.querySelector('script[data-domain="brewform.app"]')) return;

  const script = document.createElement('script');
  script.defer = true;
  script.dataset.domain = 'brewform.app';
  script.src = 'https://plausible.io/js/script.js';
  document.head.appendChild(script);
}

/**
 * Remove the Plausible script (when user revokes consent).
 */
export function unloadAnalytics(): void {
  const script = document.querySelector('script[data-domain="brewform.app"]');
  if (script) script.remove();
}

/**
 * Track a custom event. No-op if analytics not loaded or consent not given.
 */
export function trackEvent(
  event: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (window.plausible) {
    window.plausible(event, props ? { props } : undefined);
  }
}

// Pre-defined event helpers for type safety
export const analytics = {
  /** User viewed a recipe detail page */
  recipeView: (slug: string, brewMethod: string) =>
    trackEvent('Recipe View', { slug, brew_method: brewMethod }),

  /** User created a new recipe */
  recipeCreate: (brewMethod: string) =>
    trackEvent('Recipe Create', { brew_method: brewMethod }),

  /** User forked a recipe */
  recipeFork: (originalSlug: string) =>
    trackEvent('Recipe Fork', { original: originalSlug }),

  /** User registered a new account */
  registration: () => trackEvent('Registration'),

  /** User shared a recipe */
  recipeShare: (slug: string, method: string) =>
    trackEvent('Recipe Share', { slug, method }),

  /** User used the compare feature */
  recipeCompare: () => trackEvent('Recipe Compare'),

  /** User started the brew timer */
  brewTimerStart: (brewMethod: string) =>
    trackEvent('Brew Timer Start', { brew_method: brewMethod }),
};
```

#### Step 3: Integrate tracking into key pages

```tsx
// apps/web/src/pages/recipes/RecipeDetailPage.tsx
// Add to the useEffect that loads recipe data:
import { analytics } from '../../utils/analytics';

useEffect(() => {
  if (recipe) {
    analytics.recipeView(recipe.slug, recipe.brewMethod);
  }
}, [recipe?.slug]);
```

```tsx
// apps/web/src/pages/recipes/RecipeCreatePage.tsx
// Add after successful recipe creation:
import { analytics } from '../../utils/analytics';

// In the success handler:
analytics.recipeCreate(formData.brewMethod);
```

#### Step 4: Track page views via React Router

```tsx
// apps/web/src/hooks/usePageTracking.ts
import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Tracks page views on route changes.
 * Plausible auto-tracks the initial page load, but SPA navigations
 * need manual tracking since there's no full page reload.
 */
export function usePageTracking(): void {
  const location = useLocation();

  useEffect(() => {
    // Plausible's script handles SPA tracking via the History API
    // if using their hash-based or outbound-link extensions.
    // For the basic script, we trigger a manual pageview:
    if (window.plausible) {
      window.plausible('pageview');
    }
  }, [location.pathname]);
}
```

Use this hook in the `Layout` component:

```tsx
// apps/web/src/components/layout/Layout.tsx
import { usePageTracking } from '../../hooks/usePageTracking';

export function Layout() {
  usePageTracking();
  // ... existing layout code
}
```

### Tracked Events Summary

| Event | Trigger | Properties |
|-------|---------|-----------|
| Page View | Route change | (auto: path, referrer) |
| Recipe View | Recipe detail page load | slug, brew_method |
| Recipe Create | Successful recipe creation | brew_method |
| Recipe Fork | Successful fork | original slug |
| Registration | Successful account creation | -- |
| Recipe Share | Share button click | slug, method |
| Recipe Compare | Compare page load | -- |
| Brew Timer Start | Timer started | brew_method |

---

## L1 -- Vite Build Sourcemaps Disabled

**Priority:** Low
**Effort:** Small (15-30 minutes)
**Depends on:** M10 (error monitoring) -- sourcemaps are only useful if there is a monitoring service to consume them

### Evidence

- `apps/web/vite.config.ts:46` -- `sourcemap: false` in the build configuration.

### Impact

Without sourcemaps, production error stack traces reference minified/bundled code (e.g., `chunk-abc123.js:1:45678`), making them unusable for debugging. Error monitoring (M10) will capture errors but they will be unreadable.

### Action Plan

#### Option A: If error monitoring (M10) is implemented

Change `sourcemap: false` to `sourcemap: 'hidden'`:

```ts
// apps/web/vite.config.ts
build: {
  outDir: 'dist',
  sourcemap: 'hidden',  // Generates .map files but doesn't reference them in the bundle
  chunkSizeWarningLimit: 800,
},
```

The `'hidden'` option:
- Generates `.map` files alongside the bundles
- Does NOT add `//# sourceMappingURL=` comments to the JS files
- Result: end users cannot access sourcemaps, but you can upload them to Sentry for server-side symbolication

#### Sourcemap upload to Sentry

Since we are using Sentry's HTTP API (not the SDK), sourcemap upload uses the Sentry CLI or API. Add a step to the CI/CD pipeline:

```yaml
# Add to .github/workflows/ci.yml after the build step:
- name: Upload sourcemaps to Sentry
  if: github.ref == 'refs/heads/main'
  run: |
    npx @sentry/cli sourcemaps upload \
      --auth-token ${{ secrets.SENTRY_AUTH_TOKEN }} \
      --org your-org \
      --project brewform-web \
      --release ${{ github.sha }} \
      apps/web/dist/assets/
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}

- name: Remove sourcemaps from deploy artifact
  if: github.ref == 'refs/heads/main'
  run: find apps/web/dist -name "*.map" -delete
```

**Note:** Since Deno Deploy deploys automatically via GitHub integration (not CI), sourcemap upload must happen **before** the deploy triggers. The `find ... -delete` step ensures `.map` files are not deployed to production.

Alternatively, if Deno Deploy's build step is used, the sourcemap upload can be done as a post-build hook.

#### Option B: If error monitoring is NOT implemented

Keep `sourcemap: false`. There is no benefit to generating sourcemaps that nobody will consume, and they increase build time and artifact size.

```ts
// apps/web/vite.config.ts -- no change needed
build: {
  outDir: 'dist',
  sourcemap: false,  // Keep disabled until error monitoring is added
  chunkSizeWarningLimit: 800,
},
```

---

## L10 -- Cookie Consent is Cosmetic Only

**Priority:** Low
**Effort:** Small (2-3 hours)
**Depends on:** M5 (analytics) -- consent gating is meaningless without something to gate

### Evidence

- `apps/web/src/components/CookieConsent.tsx` -- reads/writes `localStorage.getItem('brewform_cookie_consent')` with values `'accepted'` or `'rejected'`.
- The consent value is **never read** by any other component or utility. It gates nothing.
- No analytics, no third-party scripts, no tracking pixels exist to be gated.

### Impact

When analytics (M5) is added, loading tracking scripts without checking consent violates GDPR. The consent mechanism exists but is decorative.

### Action Plan

#### Step 1: Create a ConsentContext

```tsx
// apps/web/src/contexts/ConsentContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { loadAnalytics, unloadAnalytics } from '../utils/analytics';

type ConsentStatus = 'undecided' | 'accepted' | 'rejected';

interface ConsentContextValue {
  /** Current consent status */
  consent: ConsentStatus;
  /** Whether analytics scripts should be active */
  analyticsEnabled: boolean;
  /** User accepts cookies/analytics */
  accept: () => void;
  /** User rejects cookies/analytics */
  reject: () => void;
  /** Reset consent (show banner again) */
  reset: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

const STORAGE_KEY = 'brewform_cookie_consent';

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentStatus>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'accepted') return 'accepted';
    if (stored === 'rejected') return 'rejected';
    return 'undecided';
  });

  const analyticsEnabled = consent === 'accepted';

  // Load/unload analytics based on consent
  useEffect(() => {
    if (analyticsEnabled) {
      loadAnalytics();
    } else {
      unloadAnalytics();
    }
  }, [analyticsEnabled]);

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    // Also set as a cookie for potential server-side checking
    document.cookie = `${STORAGE_KEY}=accepted; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
    setConsent('accepted');
  }, []);

  const reject = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'rejected');
    document.cookie = `${STORAGE_KEY}=rejected; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
    setConsent('rejected');
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = `${STORAGE_KEY}=; path=/; max-age=0`;
    setConsent('undecided');
  }, []);

  return (
    <ConsentContext.Provider value={{ consent, analyticsEnabled, accept, reject, reset }}>
      {children}
    </ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent must be used within ConsentProvider');
  return ctx;
}
```

#### Step 2: Refactor CookieConsent.tsx to use the context

```tsx
// apps/web/src/components/CookieConsent.tsx
import { useConsent } from '../contexts/ConsentContext';
import { useTranslation } from '../contexts/I18nContext';

export function CookieConsent() {
  const { consent, accept, reject } = useConsent();
  const { t } = useTranslation();

  if (consent !== 'undecided') return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 p-4"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)',
        zIndex: 50,
      }}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('cookie.consent')}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={reject} className="btn-secondary text-sm">
            {t('cookie.reject')}
          </button>
          <button type="button" onClick={accept} className="btn-primary text-sm">
            {t('cookie.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### Step 3: Add ConsentProvider to the App tree

```tsx
// apps/web/src/App.tsx
import { RouterProvider } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { I18nProvider } from './contexts/I18nContext';
import { ConsentProvider } from './contexts/ConsentContext';
import { router } from './router';

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ConsentProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ConsentProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
```

#### Step 4: Gate web vitals custom events on consent

Update `apps/web/src/utils/webVitals.ts` to check consent before sending to Plausible:

```ts
// In the sendToAnalytics function:
function sendToAnalytics(metric: Metric): void {
  // Plausible custom events require consent
  // The plausible global is only defined when the script is loaded (consent given)
  // So this check is inherently consent-gated
  if (window.plausible) {
    window.plausible('Web Vitals', {
      props: {
        metric: metric.name,
        value: Math.round(metric.value),
        rating: metric.rating,
        page: window.location.pathname,
      },
    });
  }
}
```

The custom API endpoint (`/vitals`) for raw metric collection does **not** require consent because it collects no personally identifiable information -- it only receives metric name, value, and page path. This is equivalent to server access logs.

#### Consent Flow Diagram

```
User visits BrewForm
  |
  v
ConsentProvider reads localStorage
  |
  +-- 'accepted' -> loadAnalytics() -> Plausible script injected
  |
  +-- 'rejected' -> no scripts loaded
  |
  +-- undefined -> show CookieConsent banner
         |
         +-- User clicks Accept -> accept() -> loadAnalytics()
         |
         +-- User clicks Reject -> reject() -> nothing loaded
```

---

## N8 -- No CI Test Job

**Priority:** Medium
**Effort:** Medium (2-3 hours including CI debugging)
**Depends on:** None (can be done independently)

### Evidence

- `.github/workflows/ci.yml` -- Has `quality` job (lint, format, typecheck, build) and a `test` job with PostgreSQL.
- `.github/workflows/pr.yml` -- Has `check` job and a `test-unit` job that only runs shared package tests.
- **CORRECTION:** The deep-dive analysis stated there was no test job, but `ci.yml` already has a `test` job with PostgreSQL service container. However, `pr.yml` only runs `packages/shared` tests, not the full API test suite. The CI pipeline is partially complete.

**Actual gaps:**
1. `pr.yml` lacks the full test suite -- only runs `deno task --cwd packages/shared test`, missing API tests entirely.
2. `ci.yml`'s test job lacks `STORAGE_DRIVER: local` for tests that involve file uploads.
3. Neither workflow runs frontend (Vitest) tests.
4. No web (Vitest) tests in any CI pipeline.

### Impact

PRs can be merged without running API tests -- only shared package tests run on PRs. The full test suite only runs on merge to main (via `ci.yml`), at which point regressions are already in production. Frontend tests are never run in CI.

### Action Plan

#### Updated `pr.yml` with full test suite

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install

      - name: Generate Drizzle migration
        run: deno task db:generate

      - name: Build email templates
        run: deno run -A apps/api/scripts/build-email-templates.ts

      - name: Format check
        run: deno fmt --check

      - name: Lint
        run: deno lint apps/ packages/

      - name: Type check
        run: deno task check

      - name: Build
        run: deno task build

  test-unit:
    runs-on: ubuntu-latest
    needs: check
    env:
      DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173
      LOG_LEVEL: info
      LOG_FORMAT: json

    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install

      - name: Run shared package tests
        run: deno task --cwd packages/shared test

  test-api:
    runs-on: ubuntu-latest
    needs: check
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_USER: brewform
          POSTGRES_PASSWORD: brewform
          POSTGRES_DB: brewform_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
      JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
      CACHE_DRIVER: memory
      APP_ENV: test
      APP_PORT: 8000
      CORS_ALLOWED_ORIGINS: http://localhost:5173
      LOG_LEVEL: info
      LOG_FORMAT: json
      STORAGE_DRIVER: local

    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install

      - name: Generate Drizzle migration
        run: |
          deno task db:generate
          git diff --exit-code

      - name: Build email templates
        run: deno run -A apps/api/scripts/build-email-templates.ts

      - name: Run database migrations
        run: deno task db:migrate

      - name: Seed test database
        run: deno run --allow-all packages/db/src/seed.ts

      - name: Run API tests
        run: deno task test:api

      - name: Run DB package tests
        run: deno task test:db

  test-web:
    runs-on: ubuntu-latest
    needs: check

    steps:
      - uses: actions/checkout@v6

      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x

      - name: Install dependencies
        run: deno install

      - name: Run frontend tests
        run: deno task --cwd apps/web test
```

#### Key differences from current `pr.yml`:

| Aspect | Current `pr.yml` | Updated `pr.yml` |
|--------|------------------|-------------------|
| Unit tests | `packages/shared` only | `packages/shared` (standalone) |
| API tests | None | Full suite with PostgreSQL service |
| DB tests | None | With PostgreSQL service |
| Web tests | None | Vitest frontend tests |
| Parallelism | Sequential | `test-unit`, `test-api`, `test-web` run in parallel after `check` |

#### Updated `ci.yml` -- ensure parity

The existing `ci.yml` test job is mostly correct. Ensure these additions:

```yaml
# In the ci.yml test job's env block, add if not present:
env:
  DATABASE_URL: postgresql://brewform:brewform@localhost:5432/brewform_test
  JWT_SECRET: test-secret-for-ci-only-minimum-16-chars
  CACHE_DRIVER: memory
  APP_ENV: test
  APP_PORT: 8000
  CORS_ALLOWED_ORIGINS: http://localhost:5173
  LOG_LEVEL: info
  LOG_FORMAT: json
  STORAGE_DRIVER: local  # <-- ensure this is present
```

Add a web test step to `ci.yml`'s test job:

```yaml
      - name: Run frontend tests
        run: deno task --cwd apps/web test
```

#### Add a deno task for web tests (if not present)

Check that `apps/web/deno.json` has a `test` task. If not:

```json
{
  "tasks": {
    "test": "deno run -A npm:vitest run"
  }
}
```

#### Coverage reporting

The existing `ci.yml` already handles coverage well:

```yaml
      - name: Run tests with coverage
        run: deno task test-coverage

      - name: Generate coverage report
        run: deno coverage coverage/

      - name: Generate lcov report
        run: deno coverage coverage/ --lcov > coverage/lcov.info

      - name: Upload coverage artifact
        uses: actions/upload-artifact@v7
        with:
          name: coverage-report
          path: coverage/
```

**Optional enhancement:** Add a coverage threshold check to fail the build if coverage drops:

```yaml
      - name: Check coverage threshold
        run: |
          COVERAGE=$(deno coverage coverage/ 2>&1 | grep "^All files" | awk '{print $NF}' | tr -d '%')
          echo "Coverage: ${COVERAGE}%"
          if (( $(echo "$COVERAGE < 60" | bc -l) )); then
            echo "::error::Coverage ${COVERAGE}% is below threshold of 60%"
            exit 1
          fi
```

---

## Dependency Graph

```
L10 (Cookie Consent) ──────────┐
                                v
M5 (Analytics) ← ── ── ── ── M11 (Web Vitals, for Plausible integration)
                                ^
                                |
C2 (ErrorBoundary, Phase 1) ──>  M10 (Error Monitoring)
                                      |
                                      v
                                L1 (Sourcemaps)

N8 (CI Test Job) ── independent, no dependencies
```

**Reading the graph:**
- M10 depends on C2 being done first (for frontend error boundary integration)
- L1 depends on M10 (sourcemaps are useless without a service to consume them)
- M11's Plausible integration depends on M5 (analytics must be set up first)
- M5 depends on L10 (analytics must be gated by consent)
- N8 has no dependencies and can be implemented immediately

---

## Implementation Order

### Step 1: CI Test Job (N8) -- Day 1

No dependencies. Immediate value. Prevents regressions from being merged.

**Files to modify:**
- `.github/workflows/pr.yml` -- add `test-api`, `test-web` jobs
- `.github/workflows/ci.yml` -- add `STORAGE_DRIVER`, web tests
- `apps/web/deno.json` -- ensure `test` task exists

### Step 2: Error Monitoring (M10) -- Day 1-2

Core infrastructure that all other observability depends on.

**Files to create:**
- `apps/api/src/utils/errorReporting.ts`
- `apps/api/src/modules/errors/index.ts`
- `apps/web/src/utils/errorReporting.ts`

**Files to modify:**
- `apps/api/src/config/env.ts` -- add `SENTRY_DSN`
- `apps/api/src/middleware/errorHandler.ts` -- add `captureException` calls
- `apps/api/src/main.ts` -- add unhandled rejection listener
- `apps/api/src/routes/index.ts` -- register `/errors` route
- `apps/web/src/main.tsx` -- add global error handlers
- `apps/web/src/components/ErrorBoundary.tsx` -- add `reportError` call (after C2)

### Step 3: Sourcemaps (L1) -- Day 2

Quick config change, depends on M10 being set up.

**Files to modify:**
- `apps/web/vite.config.ts` -- change `sourcemap: false` to `sourcemap: 'hidden'`
- `.github/workflows/ci.yml` -- add sourcemap upload step (optional)

### Step 4: Cookie Consent (L10) -- Day 2

Wire up consent before adding analytics.

**Files to create:**
- `apps/web/src/contexts/ConsentContext.tsx`

**Files to modify:**
- `apps/web/src/components/CookieConsent.tsx` -- refactor to use context
- `apps/web/src/App.tsx` -- add `ConsentProvider`

### Step 5: Analytics (M5) -- Day 3

Requires L10 consent to be functional.

**Files to create:**
- `apps/web/src/utils/analytics.ts`
- `apps/web/src/hooks/usePageTracking.ts`

**Files to modify:**
- `apps/web/src/components/layout/Layout.tsx` -- add `usePageTracking`
- `apps/web/src/pages/recipes/RecipeDetailPage.tsx` -- add recipe view tracking
- `apps/web/src/pages/recipes/RecipeCreatePage.tsx` -- add recipe create tracking

### Step 6: Web Vitals (M11) -- Day 3

Requires M5 for Plausible integration, or can standalone with custom endpoint.

**Files to create:**
- `apps/web/src/utils/webVitals.ts`
- `apps/api/src/modules/vitals/index.ts`

**Files to modify:**
- `apps/web/deno.json` -- add `web-vitals` dependency
- `apps/web/src/main.tsx` -- call `initWebVitals()`
- `apps/api/src/routes/index.ts` -- register `/vitals` route

---

## Verification Checklist

- [ ] **N8:** PR pipeline runs full API test suite with PostgreSQL -- verify by opening a test PR
- [ ] **N8:** PR pipeline runs frontend Vitest tests -- verify in workflow logs
- [ ] **M10:** Throw a test error in API -- verify it appears in Sentry dashboard
- [ ] **M10:** Trigger a React render error -- verify it arrives at `/errors` endpoint and forwards to Sentry
- [ ] **M10:** `SENTRY_DSN` unset in local dev -- verify zero external fetch calls
- [ ] **L1:** Production build generates `.map` files -- verify with `ls apps/web/dist/assets/*.map`
- [ ] **L1:** Deployed bundle does NOT contain `sourceMappingURL` comments -- verify with `grep sourceMappingURL apps/web/dist/assets/*.js`
- [ ] **L10:** Click "Reject" -- verify Plausible script is NOT in the DOM
- [ ] **L10:** Click "Accept" -- verify Plausible script IS in the DOM
- [ ] **L10:** Refresh after accepting -- verify analytics loads immediately (persisted consent)
- [ ] **M5:** Navigate between pages -- verify page views appear in Plausible dashboard
- [ ] **M5:** View a recipe -- verify custom event appears in Plausible dashboard
- [ ] **M11:** Load any page -- verify web vitals are logged in dev console (`[Web Vitals] LCP: ...`)
- [ ] **M11:** Load any page in production -- verify vitals arrive at `/vitals` endpoint
