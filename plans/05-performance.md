# Plan 05: Performance

**Priority:** 5
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 5
**Issues:** H7 (Code Splitting), M17 (Lazy Images), M3 (Skeletons), L7 (Scroll Restoration), L2 (preconnect)
**Effort:** ~7–10 hours
**Impact:** ⚡ Bundle size, LCP, perceived performance, 🖱️ Navigation UX

---

## H7 — No Code Splitting (All Pages Eagerly Loaded) ✅ CONFIRMED

**Evidence:**
- Search for `React.lazy`, `lazy(`, `dynamic import` in `apps/web/src/` — **zero results**
- Search for `Suspense` in `apps/web/src/` — **zero results**
- [`apps/web/src/router.tsx:1-40`](apps/web/src/router.tsx) — All 37 page imports are static `import { X } from './pages/...'`. Zero `import()` calls.

**Impact:** Entire application JS bundle (including 14 admin pages) loads on first visit, even for non-admin users. Increases TTFB and Time to Interactive.

**Context7 Note (React Router v7 lazy routes):** Use `lazy: () => import('./Page')` on route definitions. React Router handles async loading internally. Slimmer alternative: `lazy: async () => ({ Component: (await import('./Page')).default })`.

**Action Plan:**
1. Convert admin routes in `apps/web/src/router.tsx` to lazy imports:
   ```tsx
   {
     path: '/admin',
     lazy: () => import('./pages/admin/AdminLayout'),
     children: [
       {
         index: true,
         lazy: () => import('./pages/admin/AdminDashboard'),
       },
       // ... other admin routes
     ],
   }
   ```
2. Add `<Suspense fallback={<LoadingSpinner />}>` around `<Outlet />` in Layout.tsx
3. Lazy-load heavy pages: RecipeCreatePage, RecipeEditPage, SettingsPage
4. Keep public pages (HomePage, RecipeListPage, RecipeDetailPage) eagerly loaded for fast initial navigation

**Estimated effort:** Medium (3-4 hours)

---

## M17 — No Image Lazy Loading or Responsive Images ✅ CONFIRMED

**Evidence:**
- Search for `loading="lazy"` in `apps/web/src/` — **zero results**.
- No `<img loading="lazy">`, no `srcset`, no `<picture>` elements anywhere.

**Impact:** All images load eagerly on page load, increasing LCP and bandwidth. No responsive image variants for different viewport sizes.

**Action Plan:**
1. Add `loading="lazy"` to all `<img>` tags below the fold
2. Generate thumbnail variants on upload (PhotoUpload.tsx already has canvas logic)
3. Add `srcset` with thumbnail + full-size variants for recipe photos
4. Add explicit `width` and `height` attributes to prevent layout shift (CLS)

**Estimated effort:** Small (1-2 hours)

---

## M3 — No Skeleton Loading States ✅ CONFIRMED

**Evidence:**
- Search for `skeleton`, `shimmer`, `Skeleton` across `apps/web/src/` — **zero results**.
- All loading states use simple `setLoading(true/false)` with conditional text like `"Loading..."`.

**Impact:** Users see abrupt text-to-content transitions rather than smooth loading placeholders. Perceived performance is worse than actual performance.

**Action Plan:**
1. Create `apps/web/src/components/ui/Skeleton.tsx`:
   ```tsx
   export function Skeleton({ className = '' }: { className?: string }) {
     return (
       <div className={`animate-pulse bg-[var(--bg-tertiary)] rounded ${className}`} />
     );
   }
   ```
2. Create skeleton variants: `RecipeCardSkeleton`, `RecipeDetailSkeleton`, `CommentSkeleton`
3. Use in loading states instead of `"Loading..."` text

**Estimated effort:** Medium (3-4 hours)

---

## L7 — No Scroll Restoration on Navigation ✅ CONFIRMED

**Evidence:**
- Search for `ScrollRestoration`, `scrollRestoration` in `apps/web/src/` — **zero results**.
- [`apps/web/src/App.tsx`](apps/web/src/App.tsx) — No scroll restoration imported.

**Impact:** When users navigate back, they lose their scroll position and have to manually scroll down. Frustrating UX on recipe lists and search results.

**Context7 Note (React Router built-in):** Import `<ScrollRestoration />` from `react-router` and render it inside the layout. Automatically restores scroll position on back/forward navigation.

**Action Plan:**
1. Add to `apps/web/src/components/layout/Layout.tsx`:
   ```tsx
   import { ScrollRestoration } from 'react-router';
   // First element inside the Layout component:
   <ScrollRestoration />
   ```

**Estimated effort:** Small (5 minutes)

---

## L2 — No preconnect or dns-prefetch Hints ✅ CONFIRMED

**Evidence:**
- [`apps/web/index.html`](apps/web/index.html) — Only `<link rel="icon">`. No preconnect/dns-prefetch tags.

**Impact:** Browser must wait for DNS resolution and connection setup when fetching from the API origin. Adds ~100-300ms latency to first API call.

**Action Plan:**
1. Add to `apps/web/index.html` `<head>`:
   ```html
   <link rel="preconnect" href="https://api.brewform.app" />
   <link rel="dns-prefetch" href="https://api.brewform.app" />
   ```

**Estimated effort:** Small (5 minutes)

---

## Dependencies

- H7 code splitting depends on React Router v7 lazy route API
- M17 lazy images can be done incrementally on each component
- M3 skeletons should be coordinated with H7 (Suspense fallbacks)
- L7 and L2 are standalone 5-minute fixes
