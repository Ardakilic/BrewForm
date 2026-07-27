## ADDED Requirements

### Requirement: RecipeCard is the single source for recipe card renderings

Every recipe-card rendering in `apps/web` SHALL come from the shared
`apps/web/src/components/recipe-list/RecipeCard.tsx` — no page may hand-roll the card skeleton
(`<Link className='card hover:shadow-lg transition-shadow'>` + `<h3 className='font-semibold'>`
title + stats row). To absorb the three hand-rolled variants, `RecipeCard` SHALL be extended with:

- **A widened recipe prop:** a minimal structural shape
  (`{ id, slug, title, likeCount, commentCount, forkCount?, author? }` plus optional version data)
  or a union/pick over `RecipeListItemOutput` / `RecipeWithAuthorOutput` /
  `RecipeWithVersionsOutput`, so detail-page endpoints feed the card without casts
  (EquipmentDetailPage uses `RecipeWithAuthorOutput`, CoffeeVarietyDetailPage
  `RecipeWithVersionsOutput`).
- **`hideAuthor?: boolean`** — suppresses the author line (profile context makes it redundant, and
  it fixes the "by unknown" render when `author` is absent).
- **An optional version strip** — the brewMethod • drinkType • ★ rating row, rendered when version
  data is provided. `RecipeCard`'s docstring (RecipeCard.tsx:14-19) removed this strip because
  `GET /recipes` lacks `currentVersion`; `/coffee-varieties/:id/recipes` DOES return it, so the
  strip becomes opt-in rather than deleted at the call site.
- **i18n:** the hardcoded English `'by '` at `RecipeCard.tsx:28` SHALL be replaced with a `t()` key
  (key added in the i18n delta; EquipmentDetailPage already uses `t('recipe.focusMode.by')`).

The three offender pages SHALL adopt the extended card and delete their inline card JSX:
`apps/web/src/pages/users/UserProfilePage.tsx:226-243` (with `hideAuthor`),
`apps/web/src/pages/equipment/EquipmentDetailPage.tsx:162-181`, and
`apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx:209-243` (with the version strip).
Adoption resolves the audited drift deliberately: authors become clickable stop-propagation buttons
(the canonical `RecipeCard.tsx:30-40` behaviour) and fork count renders when the data provides it.

The author-button styling SHALL move into a shared `AuthorButton` component used by both
`RecipeCard` and `CollectionCard` (whose re-rolled copy at `CollectionCard.tsx:73-89` drifts to
`color: 'inherit'` vs the canonical `var(--accent-primary)`), and the stale leftover
`apps/web/src/components/recipe/RecipeCard.styles.ts` (`AUTHOR_BUTTON_STYLE` — the real card lives
in `components/recipe-list/`) SHALL be deleted. The existing `RecipeCard.test.tsx` suite SHALL be
extended to cover the new props.

**Reason:** The 2026-07-19 duplication audit found 3 pages copying the exact canonical card skeleton
with drift (non-clickable authors, missing fork counts, a re-added version strip) — ~70 lines of
parallel JSX that any card change must be applied to four times. The core demand: all recipe list
cards come from the same component.

#### Scenario: Offender pages render the shared card

- **WHEN** the sources of `UserProfilePage.tsx`, `EquipmentDetailPage.tsx`, and
  `CoffeeVarietyDetailPage.tsx` are inspected
- **THEN** each imports `RecipeCard` from `components/recipe-list/` and contains NO local
  `card hover:shadow-lg` recipe-card `<Link>` JSX for recipe entries

#### Scenario: hideAuthor and version strip behave

- **WHEN** `RecipeCard` is rendered with `hideAuthor` set
- **THEN** no author line renders (and no "by unknown" fallback appears)
- **WHEN** `RecipeCard` is rendered with version data (brewMethod, drinkType, rating)
- **THEN** the brewMethod • drinkType • ★ rating strip renders; without version data the card
  renders unchanged

#### Scenario: Stale styles file is deleted

- **WHEN** `ls apps/web/src/components/recipe/RecipeCard.styles.ts` is run
- **THEN** the file does not exist — `AuthorButton` owns the author-button styling, and both
  `RecipeCard` and `CollectionCard` import it

### Requirement: CollectionCard and the visibility emoji are single-sourced

All collection-card renderings SHALL come from the shared
`apps/web/src/components/collections/CollectionCard.tsx`. The hand-rolled collection card at
`apps/web/src/pages/users/UserProfilePage.tsx:253-269` SHALL be replaced with `CollectionCard` — it
already consumes the same `CollectionListItemOutput` type, so this is a drop-in replacement that
restores the visibility badge and description the inline copy silently dropped.

The `public → 🌐 / unlisted → 🔗 / private → 🔒` mapping SHALL exist exactly once — as a
`visibilityEmoji(visibility)` helper (or a `CollectionVisibilityBadge` component) in
`components/collections/` — replacing the three identical ternaries at `CollectionCard.tsx:46-50`,
`CollectionDetailPage.tsx:59-63`, and `AddToCollectionModal.tsx:175-179`.

**Reason:** UserProfilePage's inline copy loses the visibility badge and description (silent feature
drift), and the emoji mapping is copy-pasted ×3 — a fourth copy is one paste away.

#### Scenario: UserProfilePage renders CollectionCard

- **WHEN** the source of `UserProfilePage.tsx` is inspected
- **THEN** the collections tab maps items to `<CollectionCard>` and contains no inline collection
  card `<Link>` JSX; rendered cards show the visibility badge and description

#### Scenario: One visibility-emoji mapping

- **WHEN** `grep -rn "🌐" apps/web/src` is run
- **THEN** the collection visibility mapping appears only in the shared helper/badge —
  `CollectionCard`, `CollectionDetailPage`, and `AddToCollectionModal` all render it via the shared
  source

### Requirement: PaginationControls is the single pagination implementation

Offset-based pagination UI SHALL be rendered exclusively by the shared `PaginationControls`
component, moved from `components/recipe-list/` to `apps/web/src/components/ui/`. The component
SHALL translate its own labels via `useTranslation()` (every current call site passes the identical
`t('common.previous')` / `t('common.next')` / `t('common.pagination')` triple —
`RecipeListView.tsx:339-341`, `NotificationListPage.tsx:132-134` — so the label props become
optional or are dropped) and SHALL support a `variant: 'hide' | 'disable'` for the admin style
(disabled buttons at bounds instead of hidden buttons).

The four inline clones SHALL be replaced with the shared component:
`CoffeeVarietiesPage.tsx:260-287` and `EquipmentCatalogPage.tsx:279-306` (byte-for-byte copies of
the shared JSX), `AdminCoffeeVarietiesPage.tsx:573-598` (disable variant), and
`AdminAuditLogPage.tsx:124-137` (prev/next with no label — gains the page label on adoption).
`AdminUsersPage.tsx:283-317` (numbered page buttons) is a genuinely different presentation and MAY
remain, documented as an intentional exception.

**Reason:** The canonical component exists and is cloned inline in 4-5 pages — the two catalog pages
copied it byte-for-byte. Label-prop plumbing is pure noise when every site passes the same three
keys.

#### Scenario: Clone sites adopt the shared component

- **WHEN** the sources of `CoffeeVarietiesPage.tsx`, `EquipmentCatalogPage.tsx`,
  `AdminCoffeeVarietiesPage.tsx`, and `AdminAuditLogPage.tsx` are inspected
- **THEN** each imports `PaginationControls` from `components/ui/` and contains no inline prev/next
  pagination JSX

#### Scenario: Existing consumers keep working

- **WHEN** `RecipeListView` and `NotificationListPage` render with multiple pages
- **THEN** pagination renders through the relocated component with identical visible labels
  (`common.previous` / `common.next` / `common.pagination`), and their existing tests pass

### Requirement: Toast primitives provide app-wide mutation feedback

The app SHALL have a house-built, dependency-free toast system: a `ToastProvider` (React context +
reducer holding a small toast queue) rendered once in `Layout.tsx`, and a `useToast()` hook
returning `toast.success(i18nKey)` / `toast.error(i18nKey)`. The API accepts **i18n keys, not
prebuilt strings** — the toast component resolves them via `useTranslation()`, so toasts are
translated by construction. Toasts SHALL auto-dismiss after a timeout, carry `role="status"` and
`aria-live="polite"`, and be styled exclusively with the existing CSS theme variables so all three
themes (light/dark/coffee) render correctly. No toast library (sonner, react-hot-toast, notistack)
SHALL be added.

`useToast` is the feedback channel for mutations that are currently silent: T6's 14 empty-catch
fixes use `toast.error(...)` for user-facing failures, and currently-silent successful mutations
(e.g. list deletes) gain `toast.success(...)`. The primitive SHALL ship with a Vitest suite (render,
auto-dismiss, queueing, key resolution).

**Reason:** Zero toast infrastructure exists (rg for toast|snackbar → 0 hits); mutation feedback
ranges from silent navigation to full-page checkmark screens, and the T6 empty-catch fixes need a
way to surface failure that today does not exist (design.md Decision 2).

#### Scenario: Toast renders and auto-dismisses

- **WHEN** a component calls `toast.success('collection.created')`
- **THEN** a toast renders the translated string with `role="status"`/`aria-live="polite"` and is
  removed from the DOM after the dismiss timeout

#### Scenario: Toasts are themed

- **WHEN** the toast renders under the dark or coffee theme
- **THEN** its colors come from the CSS theme variables (no hardcoded hex, no hardcoded `white`
  text)

#### Scenario: No toast dependency added

- **WHEN** `apps/web/package.json` is inspected after the change
- **THEN** no toast/snackbar library has been added

### Requirement: ConfirmDialog replaces native confirms and bespoke modal shells

A shared modal shell (`components/ui/Modal.tsx`) and a promise-based confirm primitive SHALL exist:
`useConfirm()` returns a function used as
`if (await confirm({ titleKey, bodyKey, danger: true })) { … }`, with a single dialog component
mounted by the provider alongside the toasts in `Layout.tsx`, styled with `.card` / `.btn-danger`,
with focus trap and Escape-to-cancel handling. Like toasts, it takes **i18n keys** — eliminating the
`t(key) + '?'` concatenation anti-pattern.

All 9 `globalThis.confirm` sites SHALL migrate to `useConfirm()`: `EquipmentListPage.tsx:71`,
`SetupListPage.tsx:58`, `BeanListPage.tsx:61`, `SettingsPage.tsx:112`, `AdminRecipesPage.tsx:51`,
`AdminUserDetailPage.tsx:61`, `AdminVendorsPage.tsx:61`, `AdminTasteNotesPage.tsx:64`,
`AdminEquipmentPage.tsx:78`. The 3 hand-rolled overlay shells SHALL be consolidated:
`AdminCoffeeVarietiesPage.tsx:603-634` (inline delete-confirm modal) is replaced by `useConfirm()`;
`BanDialog.tsx:46-50` and `AddToCollectionModal.tsx:128-135` (which collect input, not just
confirmation) rebase their overlay markup on the shared `Modal` shell while keeping their own
content and existing props contracts (the BanDialog requirements in this spec remain satisfied). The
primitives SHALL ship with Vitest suites (confirm resolves true/false, Escape cancels, danger
styling).

**Reason:** Delete confirmation currently splits three ways (native `confirm()` — unthemeable,
main-thread-blocking, and the source of the `t(key)+'?'` concatenation — plus two bespoke modal
styles) for identical destructive actions. One promise-hook primitive fixes UX consistency, theming,
and i18n at once (design.md Decision 2).

#### Scenario: Zero native confirms remain

- **WHEN** `grep -rn "globalThis.confirm" apps/web/src` is run
- **THEN** zero hits are returned

#### Scenario: Confirm flow resolves the promise

- **WHEN** a delete button triggers `await confirm({ titleKey, bodyKey, danger: true })` and the
  user clicks the confirm button
- **THEN** the promise resolves `true` and the dialog closes; clicking cancel or pressing Escape
  resolves `false` and no mutation runs

#### Scenario: One overlay shell

- **WHEN** `grep -rn "fixed inset-0" apps/web/src` is run
- **THEN** overlay-shell markup exists only in `components/ui/Modal.tsx` — `BanDialog`,
  `AddToCollectionModal`, and the confirm dialog all compose it

### Requirement: EmptyState and LoadingState primitives normalize list-page states

Shared `EmptyState` and `LoadingState` primitives SHALL exist in `apps/web/src/components/ui/` and
replace the hand-rolled equivalents:

- **`EmptyState { message, action? }`** — the `text-center py-12` block with
  `color: var(--text-tertiary)` (the dominant idiom; the collections/notifications
  `--text-secondary` drift normalizes to tertiary), with an optional action slot (the clear-filters
  button on catalog pages, the CTA on not-found variants). Replaces the ~19 audited sites
  (RecipeListView.tsx:325-327, StarredRecipesPage.tsx:67-69, BeanListPage.tsx:180-182,
  SetupListPage.tsx:149-151, EquipmentListPage.tsx:188-190, CollectionListPage.tsx:60-62,
  CollectionsBrowsePage.tsx:56-58, CollectionDetailPage.tsx:100-102,
  NotificationListPage.tsx:113-115, EquipmentCatalogPage.tsx:208-221,
  CoffeeVarietiesPage.tsx:179-193, TasteNotesPage.tsx:293, and the detail-page not-found variants).
- **`LoadingState`** — the centered `t('common.loading')` block, replacing the ~18
  centered/left-aligned text-loading sites; the left-aligned un-centered admin variant normalizes to
  centered. The `Skeleton` components (`components/ui/Skeleton.tsx`) remain the preferred idiom for
  initial page loads; the two hand-rolled skeleton card grids (CoffeeVarietiesPage.tsx:145-157,
  EquipmentCatalogPage.tsx:175-185) SHALL use a generalized `CardSkeletonGrid` instead of
  duplicating `RecipeCardSkeletonGrid`'s shape, and the raw `animate-pulse` divs
  (AdminUserEditPage.tsx:136,140; AdminUsersPage.tsx:128) SHALL migrate to `Skeleton`.
  `RecipeListView`'s internal split (skeleton grid for `source='all'` but plain text for
  starred/user/collection at RecipeListView.tsx:315-321) SHALL be normalized to the skeleton grid
  for all sources.

Both primitives accept already-translated strings (callers pass `t()` results), matching the
`Section`/`Field` convention.

**Reason:** Loading UI currently splits four ways (Skeleton vs centered text vs left text vs raw
`animate-pulse` — including inside RecipeListView itself) and the empty-state block is hand-typed
19×. Two tiny primitives make the states consistent and the pages shorter.

#### Scenario: Empty states render through the primitive

- **WHEN** `grep -rn "text-center py-12" apps/web/src/pages` is run
- **THEN** zero hits remain — pages render `<EmptyState>` (the class lives only in the primitive)

#### Scenario: Loading normalized inside RecipeListView

- **WHEN** `RecipeListView` renders in the loading state with `source='starred'` (or
  user/collection)
- **THEN** the skeleton card grid renders — the same as `source='all'` — not a plain text line

#### Scenario: No raw animate-pulse in pages

- **WHEN** `grep -rn "animate-pulse" apps/web/src/pages` is run
- **THEN** zero hits — skeleton rendering comes from `components/ui/Skeleton.tsx`

### Requirement: ErrorState is the single themed error presentation

A shared `ErrorState` component SHALL exist in `apps/web/src/components/ui/` and replace the four
divergent page-level error styles. It SHALL:

- Render with `role='alert'` (today only `SessionRestoreBanner.tsx:45` announces errors; page
  banners are invisible to screen readers).
- Use a tinted presentation driven by theme variables: `--error-bg` SHALL be **defined in
  `globals.css` for all three themes** (`:root`, `.dark`, `.coffee`) — today it is undefined and the
  `var(--error-bg, #fef2f2)` fallback renders a light-pink banner with light-red text in dark/coffee
  themes (a contrast bug, not just inconsistency).
- Support an optional retry action (the catalog pages' error + retry block).

Adoption replaces: the solid `var(--error)` + white banners (LoginPage.tsx:54, RegisterPage.tsx:121,
ForgotPasswordPage.tsx:70, ResetPasswordPage.tsx:97, RecipeCreatePage.tsx:213,
RecipeEditPage.tsx:186, RecipeForkPage.tsx:82, SettingsPage.tsx:140), the tinted `--error-bg` admin
banners (AdminUserCreatePage.tsx:91, AdminUserEditPage.tsx:191, AdminUserDetailPage.tsx:260,
AdminUsersPage.tsx:94,103), the plain red-text paragraphs (EquipmentCatalogPage.tsx:191,
CoffeeVarietiesPage.tsx:162, RecipeFocusModePage.tsx:54), and ContactPage.tsx:73's
Tailwind-arbitrary variant.

**Reason:** Error UI diverges 4 ways with zero screen-reader announcement, and the undefined
`--error-bg` breaks two of the three themes. One themed component fixes presentation, accessibility,
and theming at the root.

#### Scenario: --error-bg is defined for every theme

- **WHEN** `apps/web/src/styles/globals.css` is inspected
- **THEN** `--error-bg` is defined under `:root`, `.dark`, and `.coffee`, and
  `grep -rn "#fef2f2" apps/web/src` returns zero hits (no fallback literal remains)

#### Scenario: Errors are announced

- **WHEN** a page-level error renders via `ErrorState`
- **THEN** the element carries `role='alert'` and its colors come from `--error`/`--error-bg` theme
  variables in all three themes

#### Scenario: Divergent banners are gone

- **WHEN** the listed pages render their error branches
- **THEN** each renders `<ErrorState>` — no inline solid-banner, tinted-banner, or red-paragraph
  error JSX remains in those files

### Requirement: Pages use the house page shell and heading scale

Page containers SHALL follow the house shell convention — `mx-auto max-w-<tier> px-6 py-8` with the
established width tiers: `max-w-md` auth (py-12), `max-w-2xl` forms, `max-w-4xl` list/detail,
`max-w-6xl` browse grids. The divergent shells SHALL be normalized:

- The five collections pages drop the Tailwind `container` class + `px-4` gutter:
  `CollectionListPage.tsx:48`, `CollectionsBrowsePage.tsx:49`, `CollectionDetailPage.tsx:66`
  (currently unbounded — up to 1536px wide vs their 896px `max-w-4xl` siblings) become
  `mx-auto max-w-4xl px-6 py-8`; `CollectionCreatePage.tsx:49` and `CollectionEditPage.tsx:81`
  become `mx-auto max-w-2xl px-6 py-8`.
- `RecipeVersionsPage.tsx:69` (`px-4 py-12`) normalizes to `px-6 py-8`.

The h1 scale SHALL be consistent within a tier: sibling list pages use the same size (today "My
beans/setups/equipment/collections" render `text-2xl` while the Recipes list renders `text-3xl` —
normalize the tier to one size), every page h1 is `font-bold` (EquipmentDetailPage.tsx:135's
`font-semibold` drift is fixed), and the recipe title uses one serif treatment
(RecipeFocusModePage.tsx:118-120's inline `fontFamily: 'Georgia, serif'` normalizes to the Tailwind
`font-serif` RecipeDetailPage.tsx:173-175 uses for the same title). The chosen shell and scale SHALL
be documented as a comment block in `globals.css` (or a shared constant) so new pages have a single
reference.

**Reason:** The collections section visibly diverges from every sibling page (wider content, tighter
gutters), and h1 size/weight/serif drift makes equivalent pages look unrelated. The house pattern
already dominates — this normalizes the stragglers and writes the convention down.

#### Scenario: Collections pages conform

- **WHEN** `grep -rn "container mx-auto" apps/web/src/pages` is run
- **THEN** zero hits — the five collections pages use the `mx-auto max-w-* px-6 py-8` shell

#### Scenario: One serif treatment for the recipe title

- **WHEN** `RecipeFocusModePage.tsx` is inspected
- **THEN** the recipe title uses the `font-serif` class — no inline `fontFamily` style — matching
  `RecipeDetailPage`

#### Scenario: Sibling list pages share an h1 size

- **WHEN** the h1 elements of BeanListPage, SetupListPage, EquipmentListPage, CollectionListPage,
  and the recipes list are inspected
- **THEN** they use the same text-size class and `font-bold`

### Requirement: Dates and numbers render through a shared locale-aware formatter

A shared formatter util SHALL exist (e.g. `apps/web/src/utils/format.ts`) exporting locale-aware
date and number helpers built on `Intl.DateTimeFormat` / `Intl.NumberFormat`, taking the active
locale from `I18nContext` (the two correct call sites today — `PrivacyPage.tsx:27` /
`TermsPage.tsx:27` `toLocaleDateString(locale)` — model the behaviour). All user-visible date
renders SHALL go through it:

- The 8 bare `toLocaleDateString()` sites (no locale argument — they follow the browser locale and
  ignore the in-app language selector): `RecipeVersionsPage.tsx:93`,
  `AdminUserDetailPage.tsx:209,217`, `AdminUsersPage.tsx:190`, `AdminAuditLogPage.tsx:100`,
  `NotificationItem.tsx:101`, `CommentSection.tsx:305,395`.
- `BeanSection.tsx:33-34`'s local `formatDateISO` (raw `YYYY-MM-DD` output at BeanSection.tsx:231 —
  a third date format on the same recipe page) SHALL be deleted in favour of the shared helper.

User-visible decimal numbers SHALL use the number helper so the decimal separator localizes (tr uses
comma): `StarRating.tsx:74` and `stat-cards.ts:98`'s `toFixed(1)` render through it.

**Reason:** A recipe page currently shows ISO dates (bean section) and browser-locale dates
(comments) simultaneously, and the app's own language selector is ignored by every date except the
legal pages'. No shared helper exists, so each new page re-decides the format.

#### Scenario: Dates follow the app locale

- **WHEN** the locale is switched to tr and a page with dates (recipe comments, notifications, admin
  users) renders
- **THEN** dates render in the tr format via the shared helper — switching back to en re-renders
  them in the en format

#### Scenario: No bare toLocaleDateString remains

- **WHEN** `grep -rn "toLocaleDateString()" apps/web/src` is run
- **THEN** zero hits — all call sites pass through the shared formatter (which supplies the active
  locale)

#### Scenario: BeanSection stops rendering ISO dates

- **WHEN** `BeanSection` renders a roast date under the en or tr locale
- **THEN** the date renders in the active locale's format — `formatDateISO` no longer exists

### Requirement: Breadcrumbs render through a single i18n-ready component

Breadcrumb navigation SHALL be rendered by a single generic component —
`Breadcrumb { items:
{ label, to? }[] }` in `components/ui/` — with
`components/recipe/BreadcrumbNav.tsx` becoming a thin recipe-specific adapter over it. The two
hand-rolled inline breadcrumbs SHALL adopt it: `EquipmentDetailPage.tsx:97-117` and
`CoffeeVarietyDetailPage.tsx:128-145`. The component SHALL:

- Take already-translated labels (callers pass `t()` results) — fixing BreadcrumbNav's hardcoded
  untranslated English 'Recipes' (`BreadcrumbNav.tsx:45`) and untranslated brew-method labels
  (`BreadcrumbNav.tsx:9-17,68`); the keys land in the i18n delta.
- Use CSS hover classes, not the JS `onMouseEnter`/`onMouseLeave` style mutation at
  `BreadcrumbNav.tsx:37-43`.
- Carry a translated `aria-label` (the `a11y.*` key from the i18n delta) instead of the literal
  `aria-label='Breadcrumb'` duplicated across all three implementations.

**Reason:** Three breadcrumb implementations exist for one visual pattern, and the only shared one
shows untranslated English to tr-locale users on every recipe page.

#### Scenario: One breadcrumb implementation

- **WHEN** `grep -rn "aria-label" apps/web/src | grep -i breadcrumb` is run
- **THEN** the breadcrumb nav landmark exists only in the shared `Breadcrumb` component —
  `EquipmentDetailPage` and `CoffeeVarietyDetailPage` contain no inline `<nav>` breadcrumb markup

#### Scenario: Breadcrumb labels are translated

- **WHEN** `RecipeDetailPage` renders under the tr locale
- **THEN** the breadcrumb's 'Recipes' segment and brew-method segment render their Turkish
  translations, and hover styling works without JS mouse handlers

### Requirement: Accent and danger actions use the shared button classes

Accent-colored actions SHALL use `.btn-primary` (whose text color is `var(--bg-primary)`, correct in
all three themes) — no element may hand-roll
`backgroundColor: 'var(--accent-primary)', color: 'white'` (in dark theme, real buttons render dark
text on gold while hand-rolled ones render white on the same gold — visibly mismatched). The
hand-rolled accent buttons at `EmailVerificationBanner.tsx:31` and `Layout.tsx:26` SHALL adopt
`.btn-primary`; the accent type/category pills (`EquipmentCatalogPage.tsx:248-258`,
`EquipmentDetailPage.tsx:120-127`, `CoffeeVarietiesPage.tsx:207-223`,
`CoffeeVarietyDetailPage.tsx:148-161`) SHALL be extracted into a shared `TypeBadge { label }`
component sourcing its colors from theme variables (the per-category i18n ternary duplicated across
the two variety files moves into a shared `varietyCategoryLabel` helper).

A **`.btn-danger`** class SHALL be added to `globals.css` (themed via `--error`, text color from a
theme variable — not hardcoded white) and adopted by destructive actions, replacing both current
idioms: the red text-link deletes (EquipmentListPage.tsx:214, BeanListPage.tsx:211,
SetupListPage.tsx:180, AdminUserDetailPage.tsx:297, AdminVendorsPage.tsx:201,
AdminEquipmentPage.tsx:247, AdminTasteNotesPage.tsx:155, AdminRecipesPage.tsx:125,
AdminUsersPage.tsx:224) and the solid red buttons (AdminCoffeeVarietiesPage.tsx:627,
SettingsPage.tsx:380). The `ConfirmDialog`'s danger button uses the same class.

**Reason:** `.btn-primary`/`.btn-secondary` are widely adopted, but hand-rolled accent elements
hardcode white text (broken in dark theme) and no `.btn-danger` exists, so danger styling splits
between red links and ad-hoc solid red buttons.

#### Scenario: No hand-rolled white-on-accent elements

- **WHEN** `grep -rn "color: 'white'" apps/web/src` is run
- **THEN** zero hits paired with accent or error backgrounds — accent buttons use `.btn-primary`,
  pills use `TypeBadge`, danger buttons use `.btn-danger`

#### Scenario: btn-danger exists and is themed

- **WHEN** `globals.css` is inspected and a destructive button renders in each theme
- **THEN** `.btn-danger` is defined alongside `.btn-primary`/`.btn-secondary`, and its
  background/text colors come from theme variables in light, dark, and coffee themes

#### Scenario: Destructive list actions adopt the class

- **WHEN** the delete buttons on BeanListPage, SetupListPage, EquipmentListPage, and the admin CRUD
  pages are inspected
- **THEN** they use `.btn-danger` (or the shared ConfirmDialog's danger button) — no inline
  `color: 'var(--error)'` link-styling for destructive actions remains

## MODIFIED Requirements

### Requirement: Section and Field form-layout primitives live in components/form/

The directory `apps/web/src/components/form/` SHALL exist and SHALL export `Section` and `Field`
components from `apps/web/src/components/form/index.ts`. `Section` keeps its existing contract: a
`<div className='card'>` containing an `<h2 className='font-semibold mb-4'>` with
`style={{ color: 'var(--text-primary)' }}` showing `{title}`, followed by `{children}`.

`Field` SHALL be extended to be the app's single labelled-field wrapper:

```typescript
// Field.tsx
export function Field(
  { label, required, htmlFor, error, children }: {
    label: string;
    required?: boolean;
    htmlFor?: string; // label-input association (previously only hand-rolled auth forms had it)
    error?: string; // field-level validation text (previously only admin user forms had it)
    children: React.ReactNode;
  },
): React.JSX.Element;
```

- `Field` renders a `<div>` containing a `<label className='block text-sm font-medium mb-1'>` (with
  `htmlFor` when given) with `style={{ color: 'var(--text-secondary)' }}` showing `{label}` followed
  by `{required && ' *'}`, then `{children}`, then — when `error` is set — a
  `<p className='text-xs mt-1' style={{ color: 'var(--error)' }}>` with the error text (the
  admin-form idiom at `AdminUserCreatePage.tsx:113-185`).
- `apps/web/src/components/recipe-list/FilterField.tsx` SHALL be deleted — it duplicates `Field`'s
  markup (`FilterField.tsx:7-19`); `RecipeListView` imports `Field` instead.
- Both components accept already-translated strings as props (the caller passes `t()` results) — the
  components themselves do NOT call `t()`.

Adoption SHALL be completed across the 13 non-adopting files: the ~45 raw
`block text-sm font-medium mb-1` label blocks (SettingsPage ×8, BeanListPage ×5, AdminUserEditPage
×5, AdminUserCreatePage ×5, EquipmentListPage ×4, AdminEquipmentPage ×4, SetupListPage ×3,
AdminCoffeeVarietiesPage ×3, AdminVendorsPage ×3, AdminTasteNotesPage ×2, RecipeForkPage, BanDialog,
plus the auth pages' `mb-1 block text-sm font-medium` variant and the collections forms'
`block text-sm mb-1` variant) SHALL be replaced with `<Field>`. Auth pages keep their label-input
association by passing `htmlFor`; admin user forms keep their field-level errors by passing `error`;
required fields get a consistent `*` marker via `required`.

**Reason:** (Extends the D36 requirement.) Two near-duplicate primitives existed (`Field` vs
`FilterField`) and only 2 of ~12 forms adopted either — ~45 raw label blocks drifted: `htmlFor` only
on auth pages, error text only on admin user forms, required markers only on recipe create/edit.
Wave 5 merges the primitives and completes adoption, making association, errors, and required
markers uniform.

#### Scenario: components/form/ exports Section and Field

- **WHEN** `apps/web/src/components/form/index.ts` is inspected
- **THEN** it re-exports `Section` from `./Section.tsx` and `Field` from `./Field.tsx`, and
  `apps/web/src/components/recipe-list/FilterField.tsx` does not exist

#### Scenario: Field renders association, required marker, and error

- **WHEN** `<Field label='Title' required htmlFor='title' error='Required'>...</Field>` is rendered
- **THEN** the label shows "Title *" with `for="title"`, the children follow, and the error text
  renders in `var(--error)` below

#### Scenario: Raw label blocks are gone

- **WHEN** `grep -rln "block text-sm font-medium mb-1" apps/web/src` is run
- **THEN** the class appears only in `components/form/Field.tsx` — the 13 previously non-adopting
  files render labels through `<Field>`

#### Scenario: RecipeListView filters use Field

- **WHEN** `RecipeListView` renders its filter bar
- **THEN** filter fields render through the shared `Field` (no `FilterField` import), and the
  existing RecipeListView tests pass
