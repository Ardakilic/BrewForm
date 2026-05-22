# Plan 05 -- Performance Optimizations

**Priority:** High (H7), Medium (M3, M17), Low (L2, L7)
**Scope:** Bundle splitting, skeleton loading, image optimization, resource hints, scroll restoration
**Dependencies:** None -- all items are independent and can be implemented in any order

---

## Tech Stack Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19.1 |
| Routing | React Router | v7.5 |
| Build | Vite | 8 (with @deno/vite-plugin) |
| Styling | Tailwind CSS | v4.1 |
| Deployment | Deno Deploy | Static SPA |

---

## Table of Contents

1. [H7 -- No Code Splitting (All Pages Eagerly Loaded)](#h7--no-code-splitting-all-pages-eagerly-loaded)
2. [M3 -- No Skeleton Loading States](#m3--no-skeleton-loading-states)
3. [M17 -- No Image Lazy Loading](#m17--no-image-lazy-loading)
4. [L2 -- No preconnect/dns-prefetch Hints](#l2--no-preconnectdns-prefetch-hints)
5. [L7 -- No Scroll Restoration](#l7--no-scroll-restoration)

---

## H7 -- No Code Splitting (All Pages Eagerly Loaded)

**Priority:** High
**Status:** CONFIRMED

### Evidence

- `apps/web/src/router.tsx:1-40` -- 40 static imports, zero `import()` calls
- Zero `React.lazy`, zero `Suspense` anywhere in the codebase
- 13 admin pages (`AdminLayout`, `AdminDashboard`, `AdminUsersPage`, `AdminRecipesPage`, `AdminEquipmentPage`, `AdminVendorsPage`, `AdminTasteNotesPage`, `AdminCompatibilityPage`, `AdminBadgesPage`, `AdminAuditLogPage`, `AdminCachePage`, `AdminUserCreatePage`, `AdminUserEditPage`, `AdminUserDetailPage`) bundled into the main chunk and shipped to every visitor
- Heavy pages like `RecipeCreatePage`, `RecipeEditPage`, `RecipeComparePage`, `SettingsPage` loaded eagerly even though most sessions never visit them

### Impact

- Main JS bundle contains code for all 40+ pages regardless of which page the user visits
- Admin code (~13 page components + AdminLayout) adds dead weight for 99%+ of users who are not admins
- Slower initial page load, higher Time to Interactive (TTI), wasted bandwidth on mobile
- Vite's `chunkSizeWarningLimit` is already raised to 800 kB (`apps/web/vite.config.ts:47`), suggesting the bundle is large

### Action Plan

**Strategy:** Use React Router v7.5's built-in `lazy` route property to split the admin tree and heavy authenticated pages into separate chunks. Keep high-traffic public pages (`HomePage`, `RecipeListPage`, `RecipeDetailPage`, `LoginPage`, `RegisterPage`) eagerly loaded for instant navigation.

**Pages to lazy-load (17 routes):**

| Category | Pages |
|----------|-------|
| Admin (13) | `AdminLayout`, `AdminDashboard`, `AdminUsersPage`, `AdminUserCreatePage`, `AdminUserEditPage`, `AdminUserDetailPage`, `AdminRecipesPage`, `AdminEquipmentPage`, `AdminVendorsPage`, `AdminTasteNotesPage`, `AdminCompatibilityPage`, `AdminBadgesPage`, `AdminAuditLogPage`, `AdminCachePage` |
| Heavy auth (4) | `RecipeCreatePage`, `RecipeEditPage`, `SettingsPage`, `RecipeComparePage` |

**Note on `RecipeComparePage`:** Verified against the current router — it is a **public** route (no `RequireAuth` wrapper). The plan preserves this correctly. Recipe comparison is a read-only feature accessible without login.

**Pages to keep eagerly loaded (public hot paths):**

`HomePage`, `RecipeListPage`, `RecipeDetailPage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `NotFoundPage`, `RecipeNotAvailablePage`, `StarredRecipesPage`, `RecipeFocusModePage`, `UserProfilePage`, `SetupListPage`, `BeanListPage`, `EquipmentListPage`, `TasteNotesPage`, `OnboardingWizard`, `PrivacyPage`, `TermsPage`

#### React Router v7.5 `lazy` Pattern

In React Router v7, the `lazy` property on a route expects the resolved module to export route properties as named exports. The most common pattern destructures the component and re-exports it as `Component`:

```tsx
// Pattern A: Named export with destructuring (recommended)
{
  path: '/admin',
  lazy: async () => {
    const { AdminLayout } = await import('./pages/admin/AdminLayout');
    return { Component: AdminLayout };
  },
}

// Pattern B: If the module uses default export
{
  path: '/admin',
  lazy: async () => {
    const mod = await import('./pages/admin/AdminLayout');
    return { Component: mod.default };
  },
}
```

The `lazy` function can also return `loader`, `action`, `errorElement`, and other route properties -- but for this codebase we only need `Component`.

**IMPORTANT:** When a route uses `lazy`, it must NOT also have an `element` property. The `Component` returned by `lazy` replaces the `element`. For routes that wrap children in `<RequireAuth>`, the auth guard is moved into the lazy-loaded component or handled in the parent layout.

#### Step 1: Modify `apps/web/src/main.tsx` — Root Suspense boundary

The router has two top-level entries (`/` and `/admin`). The `<Suspense>` in `Layout.tsx` only covers children of the `/` route. The `/admin` route is a peer, rendered outside `Layout`. Without a root-level Suspense, a user directly loading any `/admin/*` URL will see a blank page until the lazy chunk resolves.

```tsx
// apps/web/src/main.tsx
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { PageSkeleton } from './components/ui/Skeleton';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<PageSkeleton />}>
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
```

**Note:** The in-`Layout` `<Suspense>` in `Layout.tsx` (added in Step 2 below) should remain. It provides an in-layout fallback (preserving `Navbar` and `Footer`) for in-app navigation to lazy routes under `/`. Both Suspense boundaries coexist without conflict — the nearest one wins per React's rules.

#### Step 2: Modified `apps/web/src/router.tsx` (full file)

```tsx
import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout';
import { RequireAuth } from './components/auth/RequireAuth';

// Eagerly loaded: high-traffic public pages and lightweight auth pages
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { RecipeListPage } from './pages/recipes/RecipeListPage';
import { StarredRecipesPage } from './pages/recipes/StarredRecipesPage';
import { RecipeDetailPage } from './pages/recipes/RecipeDetailPage';
import { RecipeFocusModePage } from './pages/recipes/RecipeFocusModePage';
import { RecipeNotAvailablePage } from './pages/recipes/RecipeNotAvailablePage';
import { UserProfilePage } from './pages/users/UserProfilePage';
import { SetupListPage } from './pages/setups/SetupListPage';
import { BeanListPage } from './pages/beans/BeanListPage';
import { EquipmentListPage } from './pages/equipment/EquipmentListPage';
import { TasteNotesPage } from './pages/TasteNotesPage';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { RootErrorBoundary } from './components/ErrorBoundary';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RootErrorBoundary />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'recipes', element: <RecipeListPage /> },
      {
        path: 'recipes/starred',
        element: (
          <RequireAuth>
            <StarredRecipesPage />
          </RequireAuth>
        ),
      },
      { path: 'recipes/unavailable', element: <RecipeNotAvailablePage /> },
      {
        path: 'recipes/new',
        lazy: async () => {
          const { RecipeCreatePage } = await import('./pages/recipes/RecipeCreatePage');
          return {
            Component: function RecipeCreatePageGuarded() {
              return <RequireAuth><RecipeCreatePage /></RequireAuth>;
            },
          };
        },
      },
      {
        path: 'recipes/compare/:id1/:id2',
        lazy: async () => {
          const { RecipeComparePage } = await import('./pages/recipes/RecipeComparePage');
          return { Component: RecipeComparePage };
        },
      },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      {
        path: 'recipes/:id/edit',
        lazy: async () => {
          const { RecipeEditPage } = await import('./pages/recipes/RecipeEditPage');
          return {
            Component: function RecipeEditPageGuarded() {
              return <RequireAuth><RecipeEditPage /></RequireAuth>;
            },
          };
        },
      },
      { path: 'u/:username', element: <UserProfilePage /> },
      {
        path: 'settings',
        lazy: async () => {
          const { SettingsPage } = await import('./pages/settings/SettingsPage');
          return {
            Component: function SettingsPageGuarded() {
              return <RequireAuth><SettingsPage /></RequireAuth>;
            },
          };
        },
      },
      {
        path: 'setups',
        element: (
          <RequireAuth>
            <SetupListPage />
          </RequireAuth>
        ),
      },
      {
        path: 'beans',
        element: (
          <RequireAuth>
            <BeanListPage />
          </RequireAuth>
        ),
      },
      {
        path: 'equipment',
        element: (
          <RequireAuth>
            <EquipmentListPage />
          </RequireAuth>
        ),
      },
      { path: 'taste-notes', element: <TasteNotesPage /> },
      {
        path: 'onboarding',
        element: (
          <RequireAuth>
            <OnboardingWizard />
          </RequireAuth>
        ),
      },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    lazy: async () => {
      const { AdminLayout } = await import('./pages/admin/AdminLayout');
      return {
        Component: function AdminLayoutGuarded() {
          return <RequireAuth requireAdmin><AdminLayout /></RequireAuth>;
        },
      };
    },
    errorElement: <RootErrorBoundary />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { AdminDashboard } = await import('./pages/admin/AdminDashboard');
          return { Component: AdminDashboard };
        },
      },
      {
        path: 'users',
        lazy: async () => {
          const { AdminUsersPage } = await import('./pages/admin/AdminUsersPage');
          return { Component: AdminUsersPage };
        },
      },
      {
        path: 'users/new',
        lazy: async () => {
          const { AdminUserCreatePage } = await import('./pages/admin/AdminUserCreatePage');
          return { Component: AdminUserCreatePage };
        },
      },
      {
        path: 'users/:id',
        lazy: async () => {
          const { AdminUserDetailPage } = await import('./pages/admin/AdminUserDetailPage');
          return { Component: AdminUserDetailPage };
        },
      },
      {
        path: 'users/:id/edit',
        lazy: async () => {
          const { AdminUserEditPage } = await import('./pages/admin/AdminUserEditPage');
          return { Component: AdminUserEditPage };
        },
      },
      {
        path: 'recipes',
        lazy: async () => {
          const { AdminRecipesPage } = await import('./pages/admin/AdminRecipesPage');
          return { Component: AdminRecipesPage };
        },
      },
      {
        path: 'equipment',
        lazy: async () => {
          const { AdminEquipmentPage } = await import('./pages/admin/AdminEquipmentPage');
          return { Component: AdminEquipmentPage };
        },
      },
      {
        path: 'vendors',
        lazy: async () => {
          const { AdminVendorsPage } = await import('./pages/admin/AdminVendorsPage');
          return { Component: AdminVendorsPage };
        },
      },
      {
        path: 'taste-notes',
        lazy: async () => {
          const { AdminTasteNotesPage } = await import('./pages/admin/AdminTasteNotesPage');
          return { Component: AdminTasteNotesPage };
        },
      },
      {
        path: 'compatibility',
        lazy: async () => {
          const { AdminCompatibilityPage } = await import('./pages/admin/AdminCompatibilityPage');
          return { Component: AdminCompatibilityPage };
        },
      },
      {
        path: 'badges',
        lazy: async () => {
          const { AdminBadgesPage } = await import('./pages/admin/AdminBadgesPage');
          return { Component: AdminBadgesPage };
        },
      },
      {
        path: 'audit-log',
        lazy: async () => {
          const { AdminAuditLogPage } = await import('./pages/admin/AdminAuditLogPage');
          return { Component: AdminAuditLogPage };
        },
      },
      {
        path: 'cache',
        lazy: async () => {
          const { AdminCachePage } = await import('./pages/admin/AdminCachePage');
          return { Component: AdminCachePage };
        },
      },
    ],
  },
]);
```

#### Why This Works

1. **Vite automatically code-splits** on dynamic `import()` -- each lazy route becomes its own chunk
2. **Admin chunk isolation** -- the entire `/admin` tree (13 pages + layout) is a separate chunk never loaded by regular users
3. **Heavy page isolation** -- `RecipeCreatePage`, `RecipeEditPage`, `RecipeComparePage`, `SettingsPage` become their own chunks
4. **Suspense boundary required** -- React Router v7 uses React Suspense internally for lazy route loading. A `<Suspense>` boundary is **required** so lazy routes can suspend properly; omitting it would cause a blank page on direct URL loads. Two boundaries are used: a root one in `main.tsx` (covers all routes) and an in-layout one in `Layout.tsx` (preserves Navbar/Footer for in-app navigation)
5. **RequireAuth preserved** -- auth guards are composed inline within the `lazy` callback's returned `Component`
6. **Named guard components** -- all `RequireAuth` wrappers use named functions (e.g., `function RecipeCreatePageGuarded()`) instead of anonymous arrow functions. This gives React DevTools meaningful display names and ensures stable component identity if caching behavior changes

#### Suspense Boundaries

Two Suspense boundaries are required:

**Root boundary in `main.tsx`** (see Step 1 above) -- covers all lazy routes app-wide, including the top-level `/admin` route. Without this, direct loads to `/admin/*` show a blank page.

**In-layout boundary in `Layout.tsx`** (see L7 section for the complete file) -- preserves `Navbar` and `Footer` during in-app navigation to lazy routes under `/`. The skeleton is shown inside the layout frame rather than as a full blank screen.

#### Expected Bundle Impact

| Before | After |
|--------|-------|
| Single main chunk with all 40 pages | Main chunk with ~20 eagerly loaded pages |
| Admin code in every user's bundle | Admin chunk loaded only on `/admin/*` |
| Heavy pages in initial load | Separate chunks loaded on navigation |

Estimated main bundle reduction: 25-40% (depends on page component sizes). Admin users see no difference -- their chunks load transparently on first `/admin` navigation and are cached by the browser thereafter.

---

## M3 -- No Skeleton Loading States

**Priority:** Medium
**Status:** CONFIRMED

### Evidence

- Zero dedicated skeleton/shimmer components in `apps/web/src/components/`
- `apps/web/src/pages/recipes/RecipeDetailPage.tsx` -- loading state renders plain text: `{t('common.loading')}`
- `apps/web/src/components/auth/RequireAuth.tsx` -- loading state renders "Loading..." text
- `apps/web/src/components/recipe/CommentSection.tsx` -- uses `setLoading(true/false)` with conditional button text
- Some admin pages (`AdminUserDetailPage.tsx`, `AdminUsersPage.tsx`, `AdminUserEditPage.tsx`) use inline `animate-pulse` divs but they are ad hoc, not reusable components

**Note on line numbers:** After the rebase, line numbers in the original evidence may have shifted. Verify the BEFORE code blocks match the current file state before applying each step.

### Impact

- Users see blank space or "Loading..." text during data fetches, creating a perception of slowness
- No visual preview of page structure during loading -- higher perceived latency
- Cumulative Layout Shift (CLS) when content replaces empty space

### Action Plan

#### Step 1: Create base `Skeleton` component

**New file: `apps/web/src/components/ui/Skeleton.tsx`**

```tsx
import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Base Skeleton
// ---------------------------------------------------------------------------

interface SkeletonProps {
  className?: string;
  /** Width as CSS value (e.g. '70%', '10rem') */
  width?: string;
  /** Height as CSS value (e.g. '1.25rem', '8rem') */
  height?: string;
  /** Render as a circle (for avatars) */
  circle?: boolean;
  style?: CSSProperties;
}

/**
 * Base skeleton placeholder with pulse animation.
 * Uses CSS variables for theme-aware colors so it works in light, dark, and coffee modes.
 */
export function Skeleton({ className = '', width, height, circle, style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${circle ? 'rounded-full' : 'rounded'} ${className}`}
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        width,
        height,
        ...style,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SkeletonText -- renders N lines of varying width
// ---------------------------------------------------------------------------

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  // Vary the last line width to look natural
  const widths = ['65%', '75%', '70%', '80%', '60%', '85%'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height='0.75rem'
          width={i === lines - 1 ? widths[Math.min(i, widths.length - 1)] : '100%'}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeCardSkeleton
// ---------------------------------------------------------------------------

export function RecipeCardSkeleton() {
  return (
    <div className='card space-y-3'>
      {/* Title */}
      <Skeleton height='1.25rem' width='70%' />
      {/* Author */}
      <Skeleton height='0.875rem' width='40%' />
      {/* Brew method / drink type badges */}
      <div className='flex gap-2'>
        <Skeleton height='0.75rem' width='4rem' />
        <Skeleton height='0.75rem' width='4rem' />
        <Skeleton height='0.75rem' width='3rem' />
      </div>
      {/* Likes / comments / forks */}
      <div className='flex gap-3'>
        <Skeleton height='0.75rem' width='2rem' />
        <Skeleton height='0.75rem' width='2rem' />
        <Skeleton height='0.75rem' width='2rem' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeCardSkeletonGrid -- grid of N recipe card skeletons
// ---------------------------------------------------------------------------

interface RecipeCardSkeletonGridProps {
  count?: number;
}

export function RecipeCardSkeletonGrid({ count = 6 }: RecipeCardSkeletonGridProps) {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: count }, (_, i) => (
        <RecipeCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecipeDetailSkeleton -- mirrors RecipeDetailPage layout
// ---------------------------------------------------------------------------

export function RecipeDetailSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-8 space-y-6'>
      {/* Breadcrumb */}
      <Skeleton height='0.875rem' width='12rem' />

      {/* Title + badges */}
      <div className='space-y-3'>
        <Skeleton height='2rem' width='60%' />
        <div className='flex gap-2'>
          <Skeleton height='1.5rem' width='5rem' className='rounded-full' />
          <Skeleton height='1.5rem' width='5rem' className='rounded-full' />
        </div>
      </div>

      {/* Stat cards row */}
      <div className='grid grid-cols-2 gap-4 sm:grid-cols-4'>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className='card space-y-2'>
            <Skeleton height='0.75rem' width='3rem' />
            <Skeleton height='1.5rem' width='4rem' />
          </div>
        ))}
      </div>

      {/* Brew timeline */}
      <div className='card space-y-3'>
        <Skeleton height='1.25rem' width='8rem' />
        <div className='space-y-2'>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height='2.5rem' />
          ))}
        </div>
      </div>

      {/* Notes section */}
      <div className='card space-y-3'>
        <Skeleton height='1.25rem' width='6rem' />
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentSkeleton -- single comment placeholder
// ---------------------------------------------------------------------------

export function CommentSkeleton() {
  return (
    <div className='flex gap-3 py-3'>
      {/* Avatar */}
      <Skeleton circle width='2.5rem' height='2.5rem' />
      {/* Content */}
      <div className='flex-1 space-y-2'>
        <div className='flex items-center gap-2'>
          <Skeleton height='0.875rem' width='6rem' />
          <Skeleton height='0.75rem' width='4rem' />
        </div>
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentSectionSkeleton -- N comment skeletons
// ---------------------------------------------------------------------------

interface CommentSectionSkeletonProps {
  count?: number;
}

export function CommentSectionSkeleton({ count = 3 }: CommentSectionSkeletonProps) {
  return (
    <div className='divide-y' style={{ borderColor: 'var(--border-primary)' }}>
      {Array.from({ length: count }, (_, i) => (
        <CommentSkeleton key={i} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSkeleton -- full-page fallback for Suspense boundaries
// ---------------------------------------------------------------------------

export function PageSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-12 space-y-6'>
      <Skeleton height='2rem' width='50%' />
      <Skeleton height='1rem' width='30%' />
      <div className='space-y-4'>
        <Skeleton height='8rem' />
        <Skeleton height='8rem' />
        <Skeleton height='4rem' />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserProfileSkeleton
// ---------------------------------------------------------------------------

export function UserProfileSkeleton() {
  return (
    <div className='mx-auto max-w-4xl px-6 py-8 space-y-6'>
      <div className='flex items-center gap-4'>
        <Skeleton circle width='4rem' height='4rem' />
        <div className='space-y-2'>
          <Skeleton height='1.5rem' width='10rem' />
          <Skeleton height='0.875rem' width='6rem' />
        </div>
      </div>
      <SkeletonText lines={2} />
      <RecipeCardSkeletonGrid count={3} />
    </div>
  );
}
```

#### Step 2: Replace loading text in `RecipeDetailPage`

**File: `apps/web/src/pages/recipes/RecipeDetailPage.tsx`**

Replace the loading block:

```tsx
// BEFORE:
if (loading) {
  return (
    <div
      className='mx-auto max-w-4xl px-6 py-12 text-center'
      style={{ color: 'var(--text-secondary)' }}
    >
      {t('common.loading')}
    </div>
  );
}

// AFTER:
if (loading) {
  return <RecipeDetailSkeleton />;
}
```

Add import at top of file:
```tsx
import { RecipeDetailSkeleton } from '../../components/ui/Skeleton';
```

#### Step 3: Replace loading text in `RequireAuth`

**File: `apps/web/src/components/auth/RequireAuth.tsx`**

```tsx
// BEFORE:
import { Navigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className='flex min-h-[40vh] items-center justify-center'>
        <div className='text-lg' style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to='/login' />;
  if (requireAdmin && !user?.isAdmin) return <Navigate to='/' />;
  return <>{children}</>;
}

// AFTER:
import { Navigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { PageSkeleton } from '../ui/Skeleton';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!isAuthenticated) return <Navigate to='/login' />;
  if (requireAdmin && !user?.isAdmin) return <Navigate to='/' />;
  return <>{children}</>;
}
```

#### Step 4: Refactor inline admin skeletons (optional cleanup)

The admin pages (`AdminUserDetailPage.tsx`, `AdminUsersPage.tsx`, `AdminUserEditPage.tsx`) already use inline `animate-pulse` divs. These can be replaced with the `Skeleton` component for consistency:

```tsx
// BEFORE (AdminUserDetailPage.tsx):
if (loading) {
  return (
    <div className='space-y-4'>
      <div className='h-8 w-48 rounded animate-pulse' style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className='h-48 rounded animate-pulse' style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      <div className='h-24 rounded animate-pulse' style={{ backgroundColor: 'var(--bg-tertiary)' }} />
    </div>
  );
}

// AFTER:
if (loading) {
  return (
    <div className='space-y-4'>
      <Skeleton height='2rem' width='12rem' />
      <Skeleton height='12rem' />
      <Skeleton height='6rem' />
    </div>
  );
}
```

#### Step 5: Replace loading text in `RecipeListPage`

**File: `apps/web/src/pages/recipes/RecipeListPage.tsx`**

Replace the loading block:

```tsx
// BEFORE:
{loading
  ? (
    <div className='text-center py-12' style={{ color: 'var(--text-secondary)' }}>
      {t('common.loading')}
    </div>
  )
  : ...results...

// AFTER:
{loading
  ? <RecipeCardSkeletonGrid />
  : ...results...
```

Add import at top of file:
```tsx
import { RecipeCardSkeletonGrid } from '../../components/ui/Skeleton';
```

#### Step 6: Replace loading text in `UserProfilePage`

**File: `apps/web/src/pages/users/UserProfilePage.tsx`**

Replace the loading block:

```tsx
// BEFORE:
if (loading) {
  return (
    <div
      className='mx-auto max-w-4xl px-6 py-12 text-center'
      style={{ color: 'var(--text-secondary)' }}
    >
      {t('common.loading')}
    </div>
  );
}

// AFTER:
if (loading) {
  return <UserProfileSkeleton />;
}
```

Add import at top of file:
```tsx
import { UserProfileSkeleton } from '../../components/ui/Skeleton';
```

#### Step 7: Forward-planned skeleton components

The following exported components are ready for use but not wired in this plan because their target files lack a content-level loading state to replace:

| Component | Target file | Reason deferred |
|---|---|---|
| `RecipeCardSkeleton` | _(internal use by `RecipeCardSkeletonGrid`)_ | Used internally — no separate wiring needed |
| `CommentSkeleton` | `CommentSection.tsx` | No initial content fetch loading state exists (the `loading` flag controls button submission text, not a content placeholder) |
| `CommentSectionSkeleton` | `CommentSection.tsx` | Same as above — requires adding a new loading state to track initial comment fetch before this can be used |

These are built now to keep the skeleton library complete and avoid duplicate effort. They can be wired in a follow-up when `CommentSection` gains an initial fetch loading indicator.

#### Design Principles

- All skeletons use `var(--bg-tertiary)` for the pulse color -- this automatically adapts to light, dark, and coffee themes
- Tailwind's built-in `animate-pulse` provides the animation (no custom CSS needed)
- Skeletons mirror the real layout dimensions to minimize CLS when content loads
- Each skeleton is a pure component with no side effects -- safe to use as Suspense fallbacks

---

## M17 -- No Image Lazy Loading

**Priority:** Medium
**Status:** CONFIRMED

### Evidence

- Zero `loading="lazy"` attributes in `apps/web/src/`
- Zero `srcset` or `<picture>` elements
- No explicit `width`/`height` on any `<img>` tags (CLS risk)
- Image locations found:
  - `apps/web/src/components/qrcode/RecipeQRCode.tsx` -- QR code image (fixed 128x128)
  - `apps/web/src/components/photos/PhotoUpload.tsx` -- upload preview thumbnails
  - `apps/web/src/pages/admin/AdminUserDetailPage.tsx` -- user avatar (80x80)
  - `apps/web/src/pages/users/UserProfilePage.tsx` -- user avatar (64x64)

**Note on line numbers:** After the rebase, line numbers in the original evidence may have shifted. Verify the BEFORE code blocks match the current file state before applying each change.

### Impact

- All images (including those far below the fold) are fetched immediately on page load
- No explicit dimensions causes layout shift (CLS) when images load
- Wastes bandwidth on images the user may never scroll to

### Action Plan

#### Image 1: QR Code (`RecipeQRCode.tsx`)

```tsx
// BEFORE:
<img
  src={getQRUrl()}
  alt='Recipe QR Code'
  className='w-32 h-32'
/>

// AFTER:
<img
  src={getQRUrl()}
  alt='Recipe QR Code'
  className='w-32 h-32'
  loading='lazy'
  width={128}
  height={128}
/>
```

**Note:** QR codes are typically below the fold (in a share section). `loading="lazy"` is appropriate.

#### Image 2: Photo Upload Previews (`PhotoUpload.tsx`)

```tsx
// BEFORE:
<img src={preview.url} alt={preview.name} className='w-full h-full object-cover' />

// AFTER:
<img
  src={preview.url}
  alt={preview.name}
  className='w-full h-full object-cover'
  loading='eager'
  width={200}
  height={200}
/>
```

**Note:** `preview.url` is a blob URL (`blob:http://...`) — an in-memory object URL pointing to data the browser already holds locally. Blob URLs carry zero network cost, so `loading="lazy"` is incorrect here: it would defer rendering and delay the preview appearing immediately after the user selects a file. Use `loading="eager"` (the default) for instant display. Keep `width`/`height` to prevent CLS.

#### Image 3: Admin User Avatar (`AdminUserDetailPage.tsx`)

```tsx
// BEFORE:
<img
  src={user.avatarUrl}
  alt=''
  className='w-20 h-20 rounded-full object-cover'
/>

// AFTER:
<img
  src={user.avatarUrl}
  alt=''
  className='w-20 h-20 rounded-full object-cover'
  loading='lazy'
  width={80}
  height={80}
/>
```

#### Image 4: User Profile Avatar (`UserProfilePage.tsx`)

```tsx
// BEFORE:
<img
  src={profile.avatarUrl}
  alt=''
  className='w-16 h-16 rounded-full object-cover'
/>

// AFTER:
<img
  src={profile.avatarUrl}
  alt=''
  className='w-16 h-16 rounded-full object-cover'
  loading='lazy'
  width={64}
  height={64}
/>
```

**Exception:** If an avatar is the very first visible element (above the fold), `loading="eager"` (the default) is acceptable. In this app, both avatar images appear within page content that is below the initial viewport on most screen sizes, so `lazy` is appropriate.

#### Future Consideration: Responsive Images

For a future iteration, consider:

```tsx
<picture>
  <source srcset="/images/hero.webp" type="image/webp" />
  <source srcset="/images/hero.jpg" type="image/jpeg" />
  <img src="/images/hero.jpg" alt="..." loading="lazy" width={800} height={600} />
</picture>
```

This is not needed now because the app serves user-uploaded content and API-generated QR codes (not optimizable at the HTML level), but it would be relevant if static marketing images or recipe photos with multiple resolutions are added.

---

## L2 -- No preconnect/dns-prefetch Hints

**Priority:** Low
**Status:** CONFIRMED

### Evidence

- `apps/web/index.html` -- only contains `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
- No `preconnect`, `dns-prefetch`, or `preload` hints
- API calls go to `/api/v1` (same origin in production via Deno Deploy) or a proxied backend in dev
- Google Fonts (`Inter`, `JetBrains Mono`) are referenced in `globals.css` via `--font-sans` and `--font-mono` but are system-fallback fonts (no external font loading detected)

### Impact

- If the API is on a separate domain in production, the browser must perform DNS + TCP + TLS handshake before the first API call -- adding 100-300ms of latency
- Resource hints cost zero bytes at runtime and are purely beneficial

### Action Plan

**Modified `apps/web/index.html`:**

```html
<!DOCTYPE html>
<html lang="en" class="light">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BrewForm</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />

    <!-- Resource hints: preconnect to API origin (adjust domain for production) -->
    <!--
      If the API is on the same origin (e.g., Deno Deploy serving both SPA and API),
      these hints are unnecessary and can be removed. Add them when the API is on a
      separate domain (e.g., api.brewform.com).
    -->
    <!-- <link rel="preconnect" href="https://api.brewform.com" crossorigin /> -->
    <!-- <link rel="dns-prefetch" href="https://api.brewform.com" /> -->

    <!-- If using Google Fonts or an external font CDN, uncomment: -->
    <!-- <link rel="preconnect" href="https://fonts.googleapis.com" /> -->
    <!-- <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /> -->
    <!-- <link rel="dns-prefetch" href="https://fonts.googleapis.com" /> -->
  </head>
  <body>
    <script>
      if (sessionStorage.redirect) {
        var redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        history.replaceState(null, '', redirect);
      }
    </script>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Key considerations:**

1. **Same-origin API:** BrewForm currently proxies `/api/v1` to the same origin in production (Deno Deploy). In this configuration, `preconnect` to the API is unnecessary because the connection is already established. The hints are commented out with instructions to uncomment when the API moves to a separate domain.

2. **When to uncomment:** If the deployment changes to `api.brewform.com` (separate subdomain or service), uncomment the preconnect/dns-prefetch lines and set the correct hostname.

3. **`crossorigin` attribute:** Required on `preconnect` when the connection will be used for CORS requests (API calls with `Authorization` header). Without it, the browser opens a second connection.

4. **`dns-prefetch` as fallback:** Older browsers that do not support `preconnect` still benefit from `dns-prefetch`. It only resolves DNS (no TCP/TLS), so it is strictly less useful but has broader support.

5. **Font CDN:** The current codebase uses system fonts with `Inter` and `JetBrains Mono` as preferences (not loaded from a CDN). If Google Fonts or another CDN is added later, the preconnect hints for `fonts.googleapis.com` and `fonts.gstatic.com` should be uncommented.

6. **Deferral option:** Because all hints are commented out under the current same-origin architecture, L2 produces zero runtime change today. If preferred, this item can be deferred entirely and re-introduced alongside a future domain-split architecture change (e.g., moving the API to `api.brewform.com`). The commented-out HTML in `index.html` adds minimal maintenance noise, so shipping now or deferring are both acceptable.

---

## L7 -- No Scroll Restoration

**Priority:** Low
**Status:** CONFIRMED

### Evidence

- Zero instances of `ScrollRestoration` in `apps/web/src/`
- Zero `scrollRestoration` in any file
- Users who scroll down a recipe list, click a recipe, then press the browser back button are returned to the top of the list instead of their previous scroll position

### Impact

- Broken back-button navigation experience -- users lose their position in long lists
- Especially painful on mobile where recipe lists require significant scrolling
- Standard web behavior that users expect to work

### Action Plan

React Router v7 provides a `<ScrollRestoration />` component that automatically saves and restores scroll positions across navigation.

#### Modified `apps/web/src/components/layout/Layout.tsx` (full file)

This is the same file modified in H7 (Suspense boundary). The complete file with all performance changes applied:

```tsx
import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { ScrollRestoration } from 'react-router';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { CookieConsent } from '../CookieConsent';
import { PageSkeleton } from '../ui/Skeleton';

export function Layout() {
  return (
    <div className='flex min-h-screen flex-col'>
      <ScrollRestoration />
      <Navbar />
      <main className='flex-1'>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
```

#### How `ScrollRestoration` Works

1. **Automatic save:** On every navigation, it saves `window.scrollY` keyed by the current location
2. **Automatic restore:** When navigating back (via browser back button or `navigate(-1)`), it restores the saved scroll position
3. **New pages scroll to top:** Forward navigation to a new URL scrolls to the top (expected behavior)
4. **Hash links respected:** If the URL has a `#hash`, it scrolls to that element instead
5. **Session storage backed:** Scroll positions survive page refreshes

#### Placement

`<ScrollRestoration />` must be rendered inside a route that uses `createBrowserRouter` (which this app does). It should be placed as a child of the root layout, before any content that scrolls. It renders no visible DOM -- it is a side-effect-only component.

**Note:** `ScrollRestoration` is inside `Layout`, which is not rendered for `/admin` routes. Admin pages do not benefit from scroll restoration. This is acceptable -- admin is internal tooling with shorter, less scroll-heavy pages.

---

## Implementation Order

Recommended order based on impact and dependency:

| Step | Issue | Effort | Files Changed |
|------|-------|--------|--------------|
| 1 | L7 -- Scroll Restoration | 5 min | `Layout.tsx` |
| 2 | M3 -- Skeleton Components | 45 min | New `Skeleton.tsx`, `RecipeDetailPage.tsx`, `RequireAuth.tsx`, `RecipeListPage.tsx`, `UserProfilePage.tsx` |
| 3 | H7 -- Code Splitting | 25 min | `main.tsx`, `router.tsx`, `Layout.tsx` (already done in step 1-2) |
| 4 | M17 -- Image Lazy Loading | 10 min | `RecipeQRCode.tsx`, `PhotoUpload.tsx`, `AdminUserDetailPage.tsx`, `UserProfilePage.tsx` |
| 5 | L2 -- Resource Hints | 5 min | `index.html` |

**Total estimated effort:** ~90 minutes

Steps 1 and 2 should be done first because step 3 (code splitting) references the modified `Layout.tsx` that includes both `ScrollRestoration` and `Suspense`, and `main.tsx` imports `PageSkeleton` from the new `Skeleton.tsx`. Steps 4 and 5 are independent and can be done in any order.

---

## Verification Checklist

After implementing all changes:

- [ ] `deno task dev` starts without errors
- [ ] Navigate to `/recipes` -- page loads eagerly (no loading flash)
- [ ] Navigate to `/admin` -- observe network tab shows a separate chunk being loaded
- [ ] Navigate to `/recipes/new` -- observe lazy chunk load
- [ ] Navigate to `/settings` -- observe lazy chunk load
- [ ] **Direct load** `/admin/users` (hard refresh or new tab) -- `PageSkeleton` shows briefly, then admin page loads (no blank page)
- [ ] Scroll down recipe list, click a recipe, press back -- scroll position is restored
- [ ] Open recipe detail with slow network throttle -- skeleton is visible during load
- [ ] Open recipe list with slow network throttle -- `RecipeCardSkeletonGrid` is visible
- [ ] Open user profile with slow network throttle -- `UserProfileSkeleton` is visible
- [ ] Check `RequireAuth` loading state -- shows `PageSkeleton` instead of "Loading..." text
- [ ] Inspect `<img>` tags in DevTools -- QR code and avatars have `loading="lazy"`, photo previews use `loading="eager"`; all have `width` and `height`
- [ ] Run `deno task build` -- verify no new warnings, check chunk sizes in output
- [ ] Test in light, dark, and coffee themes -- skeletons use correct background colors
- [ ] Lighthouse performance audit -- compare TTI and bundle size before/after

---

## Files Created / Modified Summary

| File | Action | Issue |
|------|--------|-------|
| `apps/web/src/components/ui/Skeleton.tsx` | **CREATE** | M3 |
| `apps/web/src/main.tsx` | MODIFY | H7 |
| `apps/web/src/router.tsx` | MODIFY | H7 |
| `apps/web/src/components/layout/Layout.tsx` | MODIFY | H7, L7, M3 |
| `apps/web/src/pages/recipes/RecipeDetailPage.tsx` | MODIFY | M3 |
| `apps/web/src/pages/recipes/RecipeListPage.tsx` | MODIFY | M3 |
| `apps/web/src/components/auth/RequireAuth.tsx` | MODIFY | M3 |
| `apps/web/src/components/qrcode/RecipeQRCode.tsx` | MODIFY | M17 |
| `apps/web/src/components/photos/PhotoUpload.tsx` | MODIFY | M17 |
| `apps/web/src/pages/admin/AdminUserDetailPage.tsx` | MODIFY | M17 (+ optional M3 cleanup) |
| `apps/web/src/pages/users/UserProfilePage.tsx` | MODIFY | M17, M3 |
| `apps/web/index.html` | MODIFY | L2 |
