# BrewForm Phase 9 — Frontend Features

## Status: READY

## Overview

Implement all pages and components: auth flows, recipe CRUD, taste note autocomplete, user profiles, onboarding, settings, photo upload, QR code, social features, search, admin panel, landing page, error pages, print/focus mode, and SEO.

---

## Pages & Components Inventory

### 1. Auth Pages

#### `apps/web/src/pages/auth/RegisterPage.tsx`
- Form: username, email, password, confirm password, optional display name
- Client-side validation with Zod `AuthRegisterSchema`
- Calls `authApi.register()`, stores tokens, redirects
- Redirects to onboarding if `user.onboardingCompleted === false`

#### `apps/web/src/pages/auth/ForgotPasswordPage.tsx`
- Email input, calls `authApi.forgotPassword()`
- Shows success message regardless of whether email exists (security)

#### `apps/web/src/pages/auth/ResetPasswordPage.tsx`
- Reads `token` from URL query params
- Password + confirm password fields
- Calls `authApi.resetPassword({ token, newPassword })`

### 2. Recipe Pages

#### `apps/web/src/pages/recipes/RecipeListPage.tsx`
- Search bar + filter sidebar (brew method, drink type, visibility, author)
- Paginated recipe grid using Base UI components
- Filter params in URL for shareability
- Uses `recipeApi.list(params)`

#### `apps/web/src/pages/recipes/RecipeDetailPage.tsx`
- Full recipe view with all version data
- Shows: title, author, visibility badge, brew parameters, taste notes, equipment, additional preparations, personal notes, rating, emoji tag, photos gallery
- Version history sidebar (if multiple versions)
- Action buttons: Edit, Fork, Print, Focus Mode, QR Code, Like, Favourite
- Comments section with OP-only reply
- If forked, shows "Forked from [original recipe]" link
- QR code generation for public/unlisted recipes

#### `apps/web/src/pages/recipes/RecipeCreatePage.tsx`
- Multi-section form following §2 dive-in properties structure
- Sections: Coffee Identity, Dates, Brew Configuration, Equipment, Yield, Temperature, Additional Preparations, Taste Notes, Personal Notes, Photos
- Setup autocomplete dropdown (fills equipment fields from user's setups)
- Taste note autocomplete component (described below)
- Hard + soft validation per §5
- Version bump checkbox on edit
- Visibility selector (draft/private/unlisted/public)

#### `apps/web/src/pages/recipes/RecipeEditPage.tsx`
- Same form as create, pre-filled with current version data
- "Bump Version" toggle
- If bumping, current version becomes immutable, new version is created

#### `apps/web/src/pages/recipes/RecipeComparePage.tsx`
- Side-by-side comparison of two public recipes
- URL format: `/recipes/compare/:id1/:id2`
- Shows: brew method, dose, yield, ratio, time, temp, taste notes, equipment
- Highlights differences

#### `apps/web/src/pages/recipes/RecipePrintView.tsx`
- Clean, printer-friendly layout
- Strips nav, sidebar, comments, social elements
- Shows: title, method, all parameters, taste notes, personal notes
- `@media print` styles in CSS
- Accessible via Print button on recipe detail

#### `apps/web/src/pages/recipes/RecipeFocusMode.tsx`
- Distraction-free reading view
- No nav, no comments, centered content
- Comfortable reading typography
- Toggle via "Focus" button on recipe detail

### 3. Taste Note Autocomplete Component

#### `apps/web/src/components/taste/TasteAutocomplete.tsx`

Key implementation per §2.10:
- Activates after 3+ characters typed
- 2-second debounce (cancels previous search on each keypress)
- Case-insensitive search against full breadcrumb path
- If a match hits a parent, show all its children
- Shows hierarchy as `Parent > Child > Grandchild`
- Selected notes shown as removable chips
- "SCAA Flavor Wheel Reference" link opens `https://notbadcoffee.com/flavor-wheel-en/` in new tab

```tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../api/index.ts';

interface TasteNote {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
}

interface Props {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function TasteAutocomplete({ selectedIds, onSelectionChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TasteNote[]>([]);
  const [allNotes, setAllNotes] = useState<TasteNote[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.get<TasteNote[]>('/taste-notes/flat').then(setAllNotes).catch(() => {});
  }, []);

  const search = useCallback((q: string) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    const lower = q.toLowerCase();
    const matched = allNotes.filter((note) => note.name.toLowerCase().includes(lower));
    const parentIds = new Set<string>();
    matched.forEach((note) => {
      if (note.parentId) parentIds.add(note.parentId);
    });
    const expanded = allNotes.filter((note) =>
      matched.some((m) => m.id === note.id) || parentIds.has(note.id)
    );
    const unique = Array.from(new Map(expanded.map((n) => [n.id, n])).values());
    unique.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
    setResults(unique);
  }, [allNotes]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 2000);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  function toggleNote(id: string) {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  }

  const selectedNotes = allNotes.filter((n) => selectedIds.includes(n.id));

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedNotes.map((note) => (
          <span key={note.id} className="badge cursor-pointer" onClick={() => toggleNote(note.id)}>
            {note.name} ×
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder="Search taste notes (type 3+ characters)..."
        className="input-field"
      />
      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border"
            style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-primary)' }}>
          {results.map((note) => (
            <li
              key={note.id}
              className="cursor-pointer px-3 py-2 hover:opacity-80"
              style={{ paddingLeft: `${note.depth * 1.5 + 0.75}rem`, color: 'var(--text-primary)' }}
              onClick={() => toggleNote(note.id)}
            >
              {selectedIds.includes(note.id) ? '✓ ' : ''}{note.name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <a href="https://notbadcoffee.com/flavor-wheel-en/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)' }}>
          SCAA Flavor Wheel Reference
        </a>
      </p>
    </div>
  );
}
```

### 4. User Profile Page

#### `apps/web/src/pages/users/UserProfilePage.tsx`
- Shows: avatar, displayName, bio, follower/following counts, badges, featured recipes
- Recipe grid (public recipes only for other users; all recipes for self)
- Follow/Unfollow button (if not self)
- Tabs: Recipes | Badges | Followers | Following

### 5. Onboarding Flow

#### `apps/web/src/components/onboarding/OnboardingWizard.tsx`

Multi-step wizard per §3.18:
1. **Welcome** — brief intro, "Get Started" button
2. **Add Equipment** — prompt to add machine, grinder, accessories → creates first Setup
3. **Add Beans** — prompt to add coffee they currently have
4. **Log First Brew** — simplified recipe creation with inline tips
5. **Explore** — link to popular recipes and brewers to follow

Each step can be skipped. `user.onboardingCompleted` flag tracks completion.

```tsx
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.tsx';

const STEPS = ['welcome', 'equipment', 'beans', 'first-brew', 'explore'];

export function OnboardingWizard() {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  function next() { setStep(Math.min(step + 1, STEPS.length - 1)); }
  function skip() {
    // Mark onboarding as complete via API
    api.patch('/preferences', { onboardingCompleted: true });
    // Redirect to home
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12 text-center">
      {STEPS[step] === 'welcome' && <WelcomeStep />}
      {STEPS[step] === 'equipment' && <EquipmentStep next={next} />}
      {STEPS[step] === 'beans' && <BeansStep next={next} />}
      {STEPS[step] === 'first-brew' && <FirstBrewStep next={next} />}
      {STEPS[step] === 'explore' && <ExploreStep />}
      <div className="mt-6 flex justify-between">
        <button onClick={skip} className="btn-secondary">Skip</button>
        {step < STEPS.length - 1 && <button onClick={next} className="btn-primary">Next</button>}
      </div>
    </div>
  );
}
```

### 6. Settings/Preferences Page

#### `apps/web/src/pages/SettingsPage.tsx`
- Unit system (metric/imperial) toggle
- Temperature unit (Celsius/Fahrenheit) toggle  
- Theme selector (Light/Dark/Coffee)
- Locale dropdown
- Timezone dropdown (auto-detected)
- Date format dropdown
- Email notification toggles (new follower, recipe liked, recipe commented, followed user posted)
- Saves preferences via `PATCH /api/v1/preferences`

### 7. Photo Upload Component

#### `apps/web/src/components/photos/PhotoUpload.tsx`
- Drag & drop area + file picker
- Validates: JPEG/PNG/WebP, max 10MB per §2.9
- Shows preview thumbnails with sort order
- Calls `api.upload('/photos', formData)` per photo
- Supports multiple photos per recipe

### 8. QR Code Component

#### `apps/web/src/components/qrcode/RecipeQRCode.tsx`
- Generates QR code for public/unlisted recipes
- Only visible on public/unlisted recipes
- Download buttons for PNG and SVG
- Uses `GET /api/v1/qrcode/recipe/:slug.png` and `.svg` endpoints

### 9. Social Features

#### `apps/web/src/components/recipe/LikeButton.tsx`
- Toggle like/unlike with icon and count
- Calls `POST /api/v1/recipes/:id/like` and `DELETE /api/v1/recipes/:id/like`

#### `apps/web/src/components/recipe/FavouriteButton.tsx`
- Toggle favourite
- Calls `POST /api/v1/recipes/:id/favourite` and `DELETE /api/v1/recipes/:id/favourite`

#### `apps/web/src/components/recipe/CommentSection.tsx`
- Lists comments with pagination
- OP badge on recipe author's comments
- Reply form for recipe author only
- Calls `POST /api/v1/comments/recipe/:recipeId` for new comments

#### `apps/web/src/components/user/FollowButton.tsx`
- Follow/unfollow toggle
- Shows follower/following count on profile page

### 10. Search Page

#### `apps/web/src/pages/SearchPage.tsx`
- Uses `SearchSchema` query params
- Search bar + filter sidebar (brew method, drink type, author)
- Results grid with sort options (date, likes, rating)
- Active filters shown as removable chips
- URL reflects current search state (shareable)

### 11. Admin Panel

#### `apps/web/src/pages/admin/AdminLayout.tsx`
- Sidebar navigation with sections: Users, Recipes, Equipment, Vendors, Taste Notes, Compatibility Matrix, Badges, Audit Log, Cache

#### `apps/web/src/pages/admin/AdminUsersPage.tsx`
- User list with search, ban/unban toggle

#### `apps/web/src/pages/admin/AdminRecipesPage.tsx`
- All recipes with visibility control

#### `apps/web/src/pages/admin/AdminEquipmentPage.tsx`
- CRUD for equipment

#### `apps/web/src/pages/admin/AdminVendorsPage.tsx`
- CRUD for vendors

#### `apps/web/src/pages/admin/AdminTasteNotesPage.tsx`
- CRUD for taste notes with "flush cache" notice

#### `apps/web/src/pages/admin/AdminCompatibilityPage.tsx`
- Table view of brew method vs equipment type compatibility matrix
- Toggle cells between compatible/incompatible
- "Flush Cache" button

#### `apps/web/src/pages/admin/AdminBadgesPage.tsx`
- List badge definitions, view awarded badges

#### `apps/web/src/pages/admin/AdminAuditLogPage.tsx`
- Paginated audit log viewer with entity filter

#### `apps/web/src/pages/admin/AdminCachePage.tsx`
- "Flush All Cache" and "Flush Specific Keys" buttons
- Cache status display

### 12. Error Pages

#### `apps/web/src/pages/ErrorPage.tsx`
```tsx
interface Props {
  statusCode: number;
  message: string;
  illustration: string;
}

export function ErrorPage({ statusCode, message, illustration }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="text-8xl">{illustration}</div>
      <h1 className="mt-4 text-4xl font-bold" style={{ color: 'var(--text-primary)' }}>{statusCode}</h1>
      <p className="mt-2 text-lg" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      <a href="/" className="btn-primary mt-6">Go Home</a>
    </div>
  );
}

export const NotFoundPage = () => <ErrorPage statusCode={404} message="Looks like this cup is empty. The page you're looking for doesn't exist." illustration="🫗" />;
export const ServerErrorPage = () => <ErrorPage statusCode={500} message="Something went wrong. We're brewing a fix." illustration="💔" />;
export const ForbiddenPage = () => <ErrorPage statusCode={403} message="You don't have permission to access this page." illustration="🔒" />;
```

### 13. SEO & Social Sharing

#### `apps/web/src/components/SEOHead.tsx`
```tsx
import { useEffect } from 'react';

interface Props {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
}

export function SEOHead({ title, description, image, url, type = 'website' }: Props) {
  useEffect(() => {
    document.title = title ? `${title} | BrewForm` : 'BrewForm — Coffee Brewing Recipes';
    setMeta('description', description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.');
    setMeta('og:title', title || 'BrewForm');
    setMeta('og:description', description || 'Digitalize, share, and discover coffee brewing recipes and tasting notes.');
    setMeta('og:image', image || '/og-default.png');
    setMeta('og:url', url || window.location.href);
    setMeta('og:type', type);
    setMeta('twitter:card', 'summary_large_image');
  }, [title, description, image, url, type]);

  return null;
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
```

#### Server-side meta tag service

For public recipe pages, the backend serves a lightweight endpoint `GET /api/v1/recipes/:slug/meta` that returns OG tag data for social crawlers. The frontend also handles client-side OG tags for SPA routes.

#### `apps/web/src/pages/recipes/RecipeDetailPage.tsx` (SEO section)
- Uses `<SEOHead>` component with recipe title, description, photo, and slug URL
- Canonical URL: `https://brewform.github.io/recipes/:slug`

### 14. Print & Focus Mode Components

#### `apps/web/src/components/recipe/PrintButton.tsx`
- Opens the recipe in a print-friendly URL: `/recipes/:slug/print`
- Uses `window.open()` with print stylesheet

#### `apps/web/src/pages/recipes/RecipePrintViewPage.tsx`
- Minimal layout: just recipe content, no nav/footer
- Print-specific CSS via `@media print`

#### `apps/web/src/components/recipe/FocusModeButton.tsx`
- Toggles focus mode class on body
- Hides nav, footer, sidebar, comments
- Centers content with comfortable typography

### 15. Router Updates

Update `apps/web/src/router.tsx` to include all new routes:

```tsx
import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout/Layout.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { RequireAuth } from './components/auth/RequireAuth.tsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'recipes', element: <RecipeListPage /> },
      { path: 'recipes/:slug', element: <RecipeDetailPage /> },
      { path: 'recipes/:slug/print', element: <RecipePrintViewPage /> },
      { path: 'recipes/:slug/focus', element: <RecipeFocusModePage /> },
      { path: 'recipes/new', element: <RequireAuth><RecipeCreatePage /></RequireAuth> },
      { path: 'recipes/:id/edit', element: <RequireAuth><RecipeEditPage /></RequireAuth> },
      { path: 'recipes/compare/:id1/:id2', element: <RecipeComparePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'u/:username', element: <UserProfilePage /> },
      { path: 'settings', element: <RequireAuth><SettingsPage /></RequireAuth> },
      { path: 'setups', element: <RequireAuth><SetupListPage /></RequireAuth> },
      { path: 'beans', element: <RequireAuth><BeanListPage /></RequireAuth> },
      { path: 'equipment', element: <RequireAuth><EquipmentListPage /></RequireAuth> },
      { path: 'taste-notes', element: <TasteNotesPage /> },
      { path: 'onboarding', element: <RequireAuth><OnboardingWizard /></RequireAuth> },
      { path: 'privacy', element: <PrivacyPage /> },
      { path: 'terms', element: <TermsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin',
    element: <RequireAuth requireAdmin><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'users', element: <AdminUsersPage /> },
      { path: 'recipes', element: <AdminRecipesPage /> },
      { path: 'equipment', element: <AdminEquipmentPage /> },
      { path: 'vendors', element: <AdminVendorsPage /> },
      { path: 'taste-notes', element: <AdminTasteNotesPage /> },
      { path: 'compatibility', element: <AdminCompatibilityPage /> },
      { path: 'badges', element: <AdminBadgesPage /> },
      { path: 'audit-log', element: <AdminAuditLogPage /> },
      { path: 'cache', element: <AdminCachePage /> },
    ],
  },
]);
```

### 16. Auth Guard Component

#### `apps/web/src/components/auth/RequireAuth.tsx`
```tsx
import { Navigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext.tsx';

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function RequireAuth({ children, requireAdmin }: Props) {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (requireAdmin && !user?.isAdmin) return <Navigate to="/" />;
  return <>{children}</>;
}
```

### 17. Setup Pages

#### `apps/web/src/pages/setups/SetupListPage.tsx`
- List user's setups
- Create/edit/delete setups
- Auto-fill from setup when creating a recipe

### 18. Bean & Equipment Pages

#### `apps/web/src/pages/beans/BeanListPage.tsx`
- List user's beans with add/edit/delete

#### `apps/web/src/pages/equipment/EquipmentListPage.tsx`
- List user's equipment inventory
- Autocomplete search when adding equipment to a recipe

---

## Key Design Decisions

- **All theme colors use CSS custom properties** — components never hardcode colors. The `.coffee` theme gives the distinctive brown pantone palette.
- **Taste autocomplete uses client-side filtering** — the full taste notes list is fetched once and cached, then filtered locally with 2-second debounce per §2.10.
- **SEO for SPA** — client-side `<SEOHead>` component sets meta tags. For social crawler support, the backend has a `/meta` endpoint that returns OG data.
- **Print view** — separate route `/recipes/:slug/print` with `@media print` CSS. No nav, footer, or social elements.
- **Focus mode** — toggle that adds a class to hide everything except the recipe content.
- **Onboarding** — driven by `user.onboardingCompleted` flag. Redirected from login if false.
- **Admin routes** — protected by `RequireAuth` with `requireAdmin` prop. Admin sidebar layout separate from main layout.