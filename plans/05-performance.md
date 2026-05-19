# Plan 05: Performance

**Priority:** 5
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 5
**Issues:** H7 (Code Splitting), M17 (Lazy Images), M3 (Skeletons), L7 (Scroll Restoration), L2 (preconnect)
**Effort:** ~7–10 hours
**Impact:** ⚡ Bundle size, LCP, perceived performance, 🖱️ Navigation UX

---

## H7 — No Code Splitting (All Pages Eagerly Loaded)

**Background:** All 37 page imports are static — entire app bundle loads on first visit, including 14 admin pages.

### Tasks
1. Convert admin routes in `apps/web/src/router.tsx` to lazy imports using React Router v7's `lazy: () => import(...)`
2. Add `<Suspense fallback={<LoadingSpinner />}>` around `<Outlet />` in Layout.tsx
3. Lazy-load heavy pages: RecipeCreatePage, RecipeEditPage, SettingsPage
4. Keep public pages (HomePage, RecipeListPage, RecipeDetailPage) eagerly loaded

---

## M17 — No Image Lazy Loading or Responsive Images

**Background:** Zero `loading="lazy"`, `srcset`, or `<picture>` elements.

### Tasks
1. Add `loading="lazy"` to all `<img>` tags below the fold
2. Generate thumbnail variants on upload (PhotoUpload.tsx already has canvas logic)
3. Add `srcset` with thumbnail + full-size variants for recipe photos
4. Add explicit `width` and `height` attributes to prevent layout shift

---

## M3 — No Skeleton Loading States

**Background:** All loading states use `setLoading(true/false)` with conditional text — no skeleton placeholders.

### Tasks
1. Create `apps/web/src/components/ui/Skeleton.tsx` — reusable pulse animation component
2. Create skeleton variants: `RecipeCardSkeleton`, `RecipeDetailSkeleton`, `CommentSkeleton`
3. Replace `"Loading..."` text with skeleton components in loading states

---

## L7 — No Scroll Restoration on Navigation

**Background:** Scroll position not restored when navigating back — user loses their place.

### Tasks
1. Add `<ScrollRestoration />` from `react-router` inside Layout.tsx

---

## L2 — No preconnect or dns-prefetch Hints

**Background:** No resource hints for the API origin — delays connection setup.

### Tasks
1. Add to `apps/web/index.html` `<head>`:
   ```html
   <link rel="preconnect" href="https://api.brewform.app" />
   <link rel="dns-prefetch" href="https://api.brewform.app" />
   ```

---

## Dependencies

- H7 code splitting depends on React Router v7 lazy route API
- M17 lazy images can be done incrementally on each component
- M3 skeletons should be coordinated with H7 (Suspense fallbacks)
- L7 and L2 are standalone 5-minute fixes
