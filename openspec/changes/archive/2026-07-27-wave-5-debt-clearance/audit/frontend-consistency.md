# Frontend visual/UX consistency audit — apps/web (2026-07-19)

## 0. Styling system (discovered)

- Tailwind CSS v4 via `@tailwindcss/vite` (apps/web/vite.config.ts:3,25;
  apps/web/package.json:15-16). No tailwind.config — v4 CSS-first config.
- Single stylesheet: `apps/web/src/styles/globals.css`. Three themes via CSS vars on `:root` /
  `.dark` / `.coffee` (globals.css:31-86): `--bg-primary/secondary/tertiary`,
  `--text-primary/secondary/tertiary`, `--border-*`, `--accent-*`,
  `--success/--warning/--error/--info`.
- Shared component classes defined in `@layer base`: `.card` (globals.css:94-99), `.btn-primary`
  (100-109), `.btn-secondary` (111-122), `.input-field` (124-137), `.badge` (139-148). No
  `.btn-danger`, no `.page-container`, no heading classes.
- Two competing conventions for consuming theme vars: inline
  `style={{ color: 'var(--text-primary)' }}` (~439 occurrences across src) vs Tailwind arbitrary
  `text-[color:var(--text-primary)]` (~140 occurrences; concentrated in Navbar, Footer,
  TasteNotesFilter, CommentSection, BeanSection, MetadataBadges, ContactPage, RecipeVersionsPage,
  BreadcrumbNav).

## 1. Page shells (containers, h1, spacing)

### Container/width pattern

Dominant pattern: `mx-auto max-w-{2xl|4xl|6xl} px-6 py-8`.

- max-w-4xl list/detail: EquipmentListPage.tsx:95, BeanListPage.tsx:81, SetupListPage.tsx:78,
  UserProfilePage.tsx:133, EquipmentDetailPage.tsx:86, CoffeeVarietyDetailPage.tsx:118,
  RecipeDetailPage.tsx:166/246/252 (px-6, py-6 on 252), PrivacyPage.tsx:20, TermsPage.tsx:20
- max-w-6xl browse/grid: HomePage.tsx:54/67/80, EquipmentCatalogPage.tsx:104,
  CoffeeVarietiesPage.tsx:86, TasteNotesPage.tsx:236, RecipeComparePage.tsx:78,
  StarredRecipesPage.tsx:66, RecipeListView.tsx:156 (shared component)
- max-w-2xl forms: RecipeCreatePage.tsx:204, RecipeEditPage.tsx:177, RecipeForkPage.tsx:75,
  SettingsPage.tsx:129, ContactPage.tsx:63, NotificationListPage.tsx:93
- max-w-md auth: LoginPage.tsx:47, RegisterPage.tsx:114, ForgotPasswordPage.tsx:60,
  ResetPasswordPage.tsx:90 (all py-12 not py-8)

DIVERGENT — collections section uses Tailwind `container` class + px-4 instead:

- CollectionListPage.tsx:48 `container mx-auto px-4 py-8` (no max-w at all → up to 1536px wide on
  2xl screens vs 896px max-w-4xl siblings)
- CollectionsBrowsePage.tsx:49 same
- CollectionDetailPage.tsx:66 same
- CollectionCreatePage.tsx:49 / CollectionEditPage.tsx:81 `container mx-auto px-4 py-8 max-w-2xl`
  (px-4 gutter vs px-6 on every other form page)

DIVERGENT — RecipeVersionsPage.tsx:69 `mx-auto max-w-4xl px-4 py-12` (px-4 + py-12 for main content;
also loading/error at :50/:57 use `text-[color:...]` arbitrary classes).
RecipeFocusModePage.tsx:53/64 uses `px-4 sm:px-6` (only page with responsive gutter).

### h1 hierarchy

- text-4xl: HomePage.tsx:55 (color: var(--accent-primary) — only h1 in the app using accent color
  besides VerifyEmailPage.tsx:56/69); ErrorPage.tsx:26
- text-3xl: RecipeListView.tsx:158, EquipmentCatalogPage.tsx:107, CoffeeVarietiesPage.tsx:89,
  CoffeeVarietyDetailPage.tsx:164, TasteNotesPage.tsx:243, PrivacyPage.tsx:22, TermsPage.tsx:22,
  RecipeDetailPage.tsx:173-175 (`font-serif`), RecipeFocusModePage.tsx:118-120 (inline
  `fontFamily: 'Georgia, serif'` — different serif stack than RecipeDetail's Tailwind `font-serif`
  for the SAME recipe title), RecipeNotAvailablePage.tsx:16, ContactPage.tsx:65
- text-2xl: every other page incl. sibling list pages BeanListPage.tsx:84, SetupListPage.tsx:81,
  EquipmentListPage.tsx:98, CollectionListPage.tsx:50, NotificationListPage.tsx:97 — i.e. "My
  equipment/beans/setups/collections" get smaller h1 than "Recipes" list.
- Weight drift: EquipmentDetailPage.tsx:135 `text-2xl font-semibold` (only non-bold h1).
- Color drift: most inline style var(--text-primary); RecipeVersionsPage.tsx:77 +
  ContactPage.tsx:52,65 use `text-[color:var(--text-primary)]` arbitrary class instead.

### Header row pattern

List pages with actions use `flex items-center justify-between mb-6` + h1 + button:
BeanListPage.tsx:83-88, SetupListPage.tsx:80-85, EquipmentListPage.tsx:97-102,
CollectionListPage.tsx:49-54, NotificationListPage.tsx:96-108 — consistent structurally, but the
action buttons differ (see §4).

## 2. Breadcrumbs — 3 implementations + most pages none

1. `BreadcrumbNav` component (components/recipe/BreadcrumbNav.tsx) — used ONLY by
   RecipeDetailPage.tsx:169.
   - Hardcoded untranslated English "Recipes" label (BreadcrumbNav.tsx:45).
   - Untranslated brew-method labels from BREW_METHODS constants (BreadcrumbNav.tsx:9-17,68).
   - Hover via JS onMouseEnter/onMouseLeave mutating style.color (BreadcrumbNav.tsx:37-43) instead
     of CSS hover classes.
   - Uses `text-[color:var(...)]` arbitrary classes.
2. Hand-rolled inline breadcrumb in EquipmentDetailPage.tsx:97-117 (`nav aria-label='Breadcrumb'` +
   inline styles, translated via t('equipment.catalog.title')). Same visual recipe but separate
   markup.
3. Hand-rolled inline breadcrumb in CoffeeVarietyDetailPage.tsx:128-141 (translated, inline styles).

No breadcrumbs on: CollectionDetailPage (no back nav at all), UserProfilePage, NotificationListPage,
SettingsPage, TasteNotesPage. Instead assorted "back" links: RecipeVersionsPage.tsx:75
(`← {t('common.back')}` literal arrow in JSX), EquipmentDetailPage.tsx:75 error-state backToList,
CoffeeVarietyDetailPage.tsx:90, AdminUserDetailPage.tsx:117 + AdminUserCreatePage.tsx:81 (arrow
baked into i18n key 'admin.users.backToUsersArrow'), RecipeFocusModePage.tsx:112,
ForgotPasswordPage.tsx:53.

## 3. Date/number formatting

No shared absolute-date formatting helper exists. `utils/relative-date.ts` only returns structured
relative results (roastDateResult etc., relative-date.ts:43-68); `utils/stat-cards.ts:98` does
`ey.toFixed(1)` locally.

Bare `new Date(x).toLocaleDateString()` — NO locale argument, so it uses browser locale and ignores
the in-app language selector (i18n was otherwise completed in D40):

- pages/recipes/RecipeVersionsPage.tsx:93
- pages/admin/AdminUserDetailPage.tsx:209, 217
- pages/admin/AdminUsersPage.tsx:190
- pages/admin/AdminAuditLogPage.tsx:100
- components/layout/NotificationItem.tsx:101
- components/recipe/CommentSection.tsx:305, 395

Locale-aware (correct): PrivacyPage.tsx:27 and TermsPage.tsx:27 `toLocaleDateString(locale)`.

Third format on the same screen: components/recipe/BeanSection.tsx:33-34 local `formatDateISO`
renders raw ISO `YYYY-MM-DD` (used at BeanSection.tsx:231). RecipeDetailPage thus shows ISO dates
(bean section) and browser-locale dates (comments) simultaneously.

No Intl.NumberFormat anywhere; numbers via toFixed (StarRating.tsx:74, stat-cards.ts:98) — decimal
point never localized (tr locale uses comma).

## 4. Buttons/links

Shared classes `.btn-primary`/`.btn-secondary` (globals.css:100-122) widely used, BUT:

- Sizing bolted on ad hoc: `btn-primary text-sm min-h-11 px-4` (CollectionListPage.tsx:53) vs bare
  `btn-primary` (BeanListPage.tsx:87, SetupListPage.tsx:84, EquipmentListPage.tsx:101,
  RecipeCreatePage.tsx:535). min-h-11 tap-target treatment exists only on collections pages +
  RecipeDetailPage (4 uses).
- Hand-rolled "primary" elements use `backgroundColor: 'var(--accent-primary)', color: 'white'` —
  EquipmentDetailPage.tsx:123, CoffeeVarietyDetailPage.tsx:151, EquipmentCatalogPage.tsx:252,
  CoffeeVarietiesPage.tsx:211, EmailVerificationBanner.tsx:31, Layout.tsx:26 — while `.btn-primary`
  uses `color: var(--bg-primary)` (globals.css:101). In dark theme `--bg-primary` = #1c1917, so real
  buttons render DARK text on gold accent while hand-rolled ones render WHITE text on the same gold:
  visibly mismatched.
- No `.btn-danger`. Danger actions split between: red text links `style={{ color: 'var(--error)' }}`
  (EquipmentListPage.tsx:214, BeanListPage.tsx:211, SetupListPage.tsx:180,
  AdminUserDetailPage.tsx:297, AdminVendorsPage.tsx:201, AdminEquipmentPage.tsx:247,
  AdminTasteNotesPage.tsx:155, AdminRecipesPage.tsx:125, AdminUsersPage.tsx:224) and solid red
  buttons `backgroundColor: 'var(--error)', color: white` (AdminCoffeeVarietiesPage.tsx:627,
  SettingsPage.tsx:380).
- FollowButton.tsx:71 rolls its own primary/secondary toggle styles.

## 5. Loading / error / empty states

### Loading — 3 divergent patterns

1. Skeleton components (components/ui/Skeleton.tsx): HomePage, EquipmentDetailPage:56,
   EquipmentCatalogPage, RecipeDetailPage:110, AdminUserDetailPage:69, CoffeeVarietiesPage,
   CoffeeVarietyDetailPage:62-64.
2. Centered text `t('common.loading')` in `py-12 text-center` div: EquipmentListPage.tsx:83-89,
   SetupListPage.tsx:66-72, BeanListPage.tsx:69-75, RecipeVersionsPage.tsx:48-51,
   RecipeEditPage.tsx:168-171, RecipeForkPage.tsx:63-69, RecipeComparePage.tsx:53-59,
   RecipeFocusModePage.tsx:67; left-aligned un-centered variant in admin pages
   (AdminVendorsPage.tsx:160, AdminCompatibilityPage.tsx:69, AdminBadgesPage.tsx:37,
   AdminEquipmentPage.tsx:200, AdminRecipesPage.tsx:66, AdminTasteNotesPage.tsx:141,
   AdminAuditLogPage.tsx:70, AdminCoffeeVarietiesPage.tsx:476) and TasteNotesPage.tsx:290.
3. Raw `animate-pulse` divs NOT using Skeleton component: AdminUserEditPage.tsx:136,140;
   AdminUsersPage.tsx:128. Inside RecipeListView itself: skeleton grid for source='all' but plain
   text for starred/user/collection sources (RecipeListView.tsx:315-321).

### Error — 4 divergent styles, none with role='alert'

1. Solid banner `backgroundColor: 'var(--error)', color: 'white'` + `mb-4 rounded p-3 text-sm`:
   LoginPage.tsx:54, RegisterPage.tsx:121, ForgotPasswordPage.tsx:70, ResetPasswordPage.tsx:97,
   RecipeCreatePage.tsx:213, RecipeEditPage.tsx:186, RecipeForkPage.tsx:82, SettingsPage.tsx:140
   (shared w/ success).
2. Tinted banner `backgroundColor: 'var(--error-bg, #fef2f2)', color: 'var(--error)'`:
   AdminUserCreatePage.tsx:91, AdminUserEditPage.tsx:191, AdminUserDetailPage.tsx:260,
   AdminUsersPage.tsx:94,103. **`--error-bg` is NOT defined in globals.css (only `--error`)** →
   fallback #fef2f2 always used → light-pink banner with light-red text in dark/coffee themes
   (contrast/theming bug, not just inconsistency).
3. Plain red text paragraph: EquipmentCatalogPage.tsx:191, CoffeeVarietiesPage.tsx:162,
   RecipeFocusModePage.tsx:54.
4. Tailwind arbitrary variant: ContactPage.tsx:73 `bg-[color:var(--error)] text-white`. Only
   SessionRestoreBanner.tsx:45 uses role='alert'; page-level error banners are not announced to
   screen readers.

### Empty — mostly consistent, minor drift

Standard: `text-center py-12` + `color: var(--text-tertiary)`: SetupListPage.tsx:149,
BeanListPage.tsx:180, EquipmentListPage.tsx:188, EquipmentCatalogPage.tsx:210,
RecipeListView.tsx:325, StarredRecipesPage.tsx:67. Drift: collections + notifications use
`--text-secondary` (CollectionListPage.tsx:60, CollectionsBrowsePage.tsx:56,
CollectionDetailPage.tsx:100, NotificationListPage.tsx:113); TasteNotesPage.tsx:293 wraps in
`.card`.

## 6. Form patterns

Shared primitives exist: components/form/Field.tsx (label + `label-text text-sm font-medium`,
required `*` marker at Field.tsx:19) and Section.tsx (`.card` + h2). Consumed ONLY by
RecipeCreatePage.tsx:8 and RecipeEditPage.tsx:9.

All other forms hand-roll labels with drift:

- BeanListPage.tsx:99-101 / SetupListPage / EquipmentListPage: `block text-sm font-medium mb-1` +
  inline color, no htmlFor
- LoginPage.tsx:61-63 / RegisterPage / auth: `mb-1 block text-sm font-medium` WITH htmlFor/id (only
  section doing label-for association)
- CollectionCreatePage.tsx:55 / CollectionEditPage: `block text-sm mb-1` (no font-medium)
- SettingsPage.tsx (9 labels), AdminUserCreatePage/AdminUserEditPage (7 labels each): own variants
- Required-field `*` marker exists only in Field.tsx consumers; auth/collection/admin required
  fields have no visual marker.

Field-level validation error text (`<p className='text-xs mt-1' style={{color:'var(--error)'}}>`)
exists ONLY on admin user forms: AdminUserCreatePage.tsx:113,131,149,167,185;
AdminUserEditPage.tsx:217,235,254,272,290. All other forms surface only a top-level banner
(RecipeCreatePage.tsx:213) or per-section text (RecipeCreatePage.tsx:284). Help/hint text has no
shared pattern.

## 7. Mutation feedback (toasts)

NO toast/snackbar system exists (rg for toast|snackbar|sonner|notistack → 0 hits in src).
Post-mutation feedback per page:

- Navigate away silently: RecipeCreatePage.tsx:148 (jsdoc), RecipeForkPage.tsx:44,
  CollectionCreatePage, AdminUserCreatePage.tsx:10
- Inline success/error banner that persists until next action: SettingsPage.tsx:136-146 (solid
  green/red)
- Full-page success replacement: AdminUserEditPage.tsx:163-166 (checkmark glyph page),
  ContactPage.tsx:50-56, ResetPasswordPage.tsx:57-64, RegisterPage.tsx:80 (verify-email notice)
- Inline status line: AdminCachePage.tsx:58 (green/red text)
- Silent optimistic list refresh, no confirmation: Bean/Setup/EquipmentList deletes,
  NotificationListPage mark-read Delete confirmation UX also splits 4 ways:
  `globalThis.confirm(t('common.delete') + '?')` string-concat (EquipmentListPage.tsx:71,
  BeanListPage.tsx:61; SetupListPage.tsx:58 `t('setup.delete') + '?'`) vs dedicated deleteConfirm
  i18n keys via confirm() (SettingsPage.tsx:112, AdminUserDetailPage.tsx:61,
  AdminTasteNotesPage.tsx:64, AdminVendorsPage.tsx:61, AdminRecipesPage.tsx:51,
  AdminEquipmentPage.tsx:78) vs custom in-page modal (AdminCoffeeVarietiesPage.tsx:611-629) vs
  BanDialog modal component (components/admin/BanDialog.tsx).
