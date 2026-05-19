# Plan 07: Observability

**Priority:** 7
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 7
**Issues:** M10 (Error Monitoring), M11 (Web Vitals), M5 (Analytics), L10 (Cookie Consent)
**Effort:** ~12–16 hours
**Impact:** 🔍 Production error visibility, 📊 Performance data, 📈 Usage insights, ⚖️ Legal compliance

---

## M10 — No Error Monitoring Service

**Background:** Errors are logged to console only. No Sentry, Datadog, or Rollbar integration.

### Tasks
1. Integrate Sentry (`@sentry/deno` for API, `@sentry/react` for frontend)
2. Add to `apps/api/src/middleware/errorHandler.ts` — capture exceptions and send to Sentry
3. Enable sourcemap upload to Sentry (coordinated with L1)
4. Add frontend error tracking

---

## M11 — No Web Vitals or Performance Monitoring

**Background:** No LCP, CLS, INP, or TTFB tracking. No `PerformanceObserver`.

### Tasks
1. Install `web-vitals` library
2. Create performance monitoring API endpoint to log metrics
3. Track LCP, CLS, INP, TTFB on all page loads

---

## M5 — No Analytics/Usage Tracking

**Background:** Privacy page mentions "cookies for analytics" but no actual analytics integration exists.

### Tasks
1. Choose privacy-friendly analytics (Plausible, Umami, or Matomo)
2. Add analytics script to `index.html` with conditional loading based on cookie consent
3. Track: page views, recipe views, recipe creations, registrations, shares
4. Update CookieConsent component to actually gate analytics script loading

---

## L10 — Cookie Consent is Cosmetic Only

**Background:** Consent banner implies user choice but doesn't block or gate any scripts/trackers.

### Tasks
1. When analytics are added (M5), conditionally load script based on consent status
2. Store consent in actual cookie (not just localStorage) so server can check it

---

## Dependencies

- All items can be done independently
- M5 + L10 must be coordinated (analytics loading gated by consent)
- M10 + L1 should be coordinated (sourcemap strategy)
