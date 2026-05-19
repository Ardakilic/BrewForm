# Plan 07: Observability

**Priority:** 7
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 7
**Issues:** M10 (Error Monitoring), M11 (Web Vitals), M5 (Analytics), L10 (Cookie Consent)
**Effort:** ~12–16 hours
**Impact:** 🔍 Production error visibility, 📊 Performance data, 📈 Usage insights, ⚖️ Legal compliance

---

## M10 — No Error Monitoring Service ✅ CONFIRMED

**Evidence:**
- Search for `Sentry`, `sentry`, `datadog`, `rollbar` across entire project — **zero results** outside this document.
- [`apps/api/src/middleware/errorHandler.ts`](apps/api/src/middleware/errorHandler.ts) — Logs errors to console only.

**Impact:** Production errors happen silently. No stack traces, no error grouping, no alerting. Debugging requires reproducing issues manually.

**Action Plan:**
- [ ] 1. Integrate Sentry (`@sentry/deno` for API, `@sentry/react` for frontend)
- [ ] 2. Add to `apps/api/src/middleware/errorHandler.ts` — capture exceptions and send to Sentry
- [ ] 3. Enable sourcemaps in production for readable stack traces (note: conflicts with L1 — upload sourcemaps to Sentry instead of public serving)
- [ ] 4. Add frontend error tracking via `@sentry/react`

**Estimated effort:** Medium (3-4 hours)

---

## M11 — No Web Vitals or Performance Monitoring ✅ CONFIRMED

**Evidence:**
- Search for `web-vital`, `LCP`, `CLS`, `INP`, `TTFB`, `PerformanceObserver` in `apps/web/src/` — **zero results**.

**Impact:** No visibility into real-user performance. Can't track LCP, CLS, or INP regressions. Performance degradation goes unnoticed until users complain.

**Action Plan:**
- [ ] 1. Install `web-vitals` library and report metrics to analytics endpoint
- [ ] 2. Create a simple performance monitoring API endpoint that logs metrics to DB or external service
- [ ] 3. Track LCP, CLS, INP, TTFB on all page loads

**Estimated effort:** Medium (2-3 hours)

---

## M5 — No Analytics/Usage Tracking ✅ CONFIRMED

**Evidence:**
- Search for `analytics`, `gtag`, `plausible`, `posthog`, `GA4` in `apps/web/src/` — only `PrivacyPage.tsx:49` mentions "We use cookies for analytics" in text. No actual integration.
- `apps/api/src/modules/admin/index.ts` has internal `/analytics/*` endpoints for admin dashboard only.

**Impact:** No insight into user behavior. No data to drive product decisions, feature prioritization, or funnel optimization.

**Action Plan:**
- [ ] 1. Choose a privacy-friendly analytics solution (Plausible, Umami, or Matomo — self-hostable, GDPR-compliant)
- [ ] 2. Add the analytics script snippet to `index.html` with conditional loading based on cookie consent
- [ ] 3. Track key events: page views, recipe views, recipe creations, registrations, shares
- [ ] 4. Update CookieConsent component to actually gate analytics script loading (currently cosmetic only — see L10)

**Estimated effort:** Large (6-8 hours + ongoing maintenance)

---

## L10 — Cookie Consent is Cosmetic Only (Doesn't Block Scripts) ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/CookieConsent.tsx`](apps/web/src/components/CookieConsent.tsx) — Only reads/writes `localStorage.getItem('brewform_cookie_consent')`. Does not:
  - Set actual cookies
  - Block or conditionally load scripts/trackers
  - Gate any functionality behind consent

**Impact:** Legal risk — the consent banner implies user choice but enforces nothing. If analytics are added (M5), the consent mechanism must actually gate them.

**Action Plan:**
- [ ] 1. When analytics are added (M5), conditionally load the analytics script based on consent status
- [ ] 2. Store consent in an actual cookie (not just localStorage) so the server can check it

**Estimated effort:** Small (30 minutes, coordinated with M5)

---

## Dependencies

- All items can be done independently
- M5 + L10 must be coordinated (analytics loading gated by consent)
- M10 + L1 (from Plan 08) should be coordinated (sourcemap strategy)
