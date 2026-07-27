# Frontend Component Duplication Inventory (DRY audit)

Audit date: 2026-07-19. Repo: /Users/arda/projects/BrewForm, branch chore/debt-fix (fe9aad2). All
line numbers 1-based against current working tree. All paths relative to repo root unless absolute.

Core user demand: "all recipe list cards should be coming from same component, do not repeat
yourself." Canonical recipe card: `apps/web/src/components/recipe-list/RecipeCard.tsx:21-56`.
Canonical recipe list view: `apps/web/src/components/recipe-list/RecipeListView.tsx:69-350`.

---

## 1. Recipe cards — page-by-page verification

### CLEAN (use shared RecipeCard / RecipeListView)

| Page                                        | Import evidence                                                                                                               | Render evidence                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| HomePage                                    | `apps/web/src/pages/HomePage.tsx:8` `import { RecipeCard } from '../components/recipe-list/index.ts'`                         | lines 75, 88: `latestRecipes.map((r) => <RecipeCard key={r.id} recipe={r} />)` |
| RecipeListPage (`/recipes`)                 | `apps/web/src/pages/recipes/RecipeListPage.tsx:15` `import { RecipeListView }`                                                | lines 62-73 render `<RecipeListView source='all' …>`                           |
| StarredRecipesPage (`/recipes/starred`)     | `apps/web/src/pages/recipes/StarredRecipesPage.tsx:15`                                                                        | lines 75-83 render `<RecipeListView source='starred' …>`                       |
| CollectionDetailPage → CollectionRecipeList | `apps/web/src/components/collections/CollectionRecipeList.tsx:7` `import { RecipeCard } from '../recipe-list/RecipeCard.tsx'` | line 149: `<RecipeCard recipe={item.recipe} />`                                |
| RecipeListView internal grid                | `apps/web/src/components/recipe-list/RecipeListView.tsx:24,332`                                                               | grid at 331-333                                                                |

### VIOLATIONS — hand-rolled recipe card JSX (3 sites)

All three copy the exact canonical card skeleton
`<Link className='card hover:shadow-lg transition-shadow'>` + `<h3 className='font-semibold'>`
title + stats row, with drift.

#### 1a. UserProfilePage — recipes tab

`apps/web/src/pages/users/UserProfilePage.tsx:226-243`

```tsx
profile.recipes.map((r) => (
  <Link
    key={r.id}
    to={`/recipes/${r.slug}`}
    className='card hover:shadow-lg transition-shadow'
  >
    <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
      {r.title}
    </h3>
    <div
      className='mt-1 flex gap-2 text-xs'
      style={{ color: 'var(--text-tertiary)' }}
    >
      <span>❤️ {r.likeCount}</span>
      <span>💬 {r.commentCount}</span>
    </div>
  </Link>
));
```

Drift vs canonical: no author line (profile context makes it redundant, but RecipeCard renders "by
unknown" when author is null — needs a `hideAuthor`/optional-author prop), no fork count (`🍴`
present in RecipeCard.tsx:52).

#### 1b. EquipmentDetailPage — "recipes using this equipment"

`apps/web/src/pages/equipment/EquipmentDetailPage.tsx:162-181`

```tsx
<Link
  key={r.id}
  to={`/recipes/${r.slug}`}
  className='card hover:shadow-lg transition-shadow'
>
  <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>
    {r.title}
  </h3>
  <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
    {t('recipe.focusMode.by')} {r.author.displayName || r.author.username}
  </p>
  <div className='mt-2 flex items-center gap-2 text-xs' style={{ color: 'var(--text-tertiary)' }}>
    <span>❤️ {r.likeCount}</span>
    <span>💬 {r.commentCount}</span>
  </div>
</Link>;
```

Drift: author is plain text — NOT clickable (canonical RecipeCard.tsx:30-40 renders a
stopPropagation author `<button>` navigating to `/u/:username`); no fork count; uses i18n
`recipe.focusMode.by` while RecipeCard hardcodes English `by` (RecipeCard.tsx:28 — itself an i18n
gap). Data type: `RecipeWithAuthorOutput` (line 16) vs canonical `RecipeListItemOutput`.

#### 1c. CoffeeVarietyDetailPage — "recipes using this variety"

`apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx:209-243`

```tsx
{
  recipes.map((r) => {
    const v = r.versions[0];
    return (
      <Link key={r.id} to={`/recipes/${r.slug}`} className='card hover:shadow-lg transition-shadow'>
        <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{r.title}</h3>
        <p className='mt-1 text-sm' style={{ color: 'var(--text-secondary)' }}>
          {t('recipe.focusMode.by')} {r.author.displayName || r.author.username}
        </p>
        {v && (
          <div
            className='mt-1 flex flex-wrap gap-1 text-xs'
            style={{ color: 'var(--text-tertiary)' }}
          >
            <span>{v.brewMethod.replace(/_/g, ' ')}</span>
            <span>•</span>
            <span>{v.drinkType.replace(/_/g, ' ')}</span>
            {v.rating && <span>• ★ {v.rating}</span>}
          </div>
        )}
        <div
          className='mt-2 flex items-center gap-2 text-xs'
          style={{ color: 'var(--text-tertiary)' }}
        >
          <span>❤️ {r.likeCount}</span>
          <span>💬 {r.commentCount}</span>
        </div>
      </Link>
    );
  });
}
```

Drift: adds a brew-method/drink-type/★rating strip (223-233) — precisely the strip RecipeCard's
docstring (RecipeCard.tsx:14-19) says was removed because `GET /recipes` lacks `currentVersion`.
This endpoint (`/coffee-varieties/:id/recipes`, `RecipeWithVersionsOutput`) DOES have version data,
so the consolidated RecipeCard needs an optional `version`/`methodStrip` prop rather than deleting
the strip here.

#### Consolidation estimate (recipe cards)

Extend `RecipeCard` props:
`{ recipe: minimal shape { id, slug, title, likeCount, commentCount, forkCount?, author? }, hideAuthor?, versionStrip? }`
(or accept a union/pick type instead of exactly `RecipeListItemOutput`). Replace 3 sites (~70 lines
removed). Low risk; tests exist for RecipeCard (`RecipeCard.test.tsx`). Divergences to resolve
deliberately: clickable author (adopt canonical), fork count (show when available), i18n "by" (adopt
`t()`).

### NOT recipe cards (verified, no action)

- `apps/web/src/pages/admin/AdminRecipesPage.tsx:90-131` — admin `<table>` rows with
  `❤️{recipe.likeCount} 💬{recipe.commentCount}` (line 117); tabular admin UI, not a card. (Separate
  issue: local `Recipe` interface at 8-17 duplicates shared schema types.)
- `apps/web/src/pages/recipes/RecipeVersionsPage.tsx:83-115` — version rows, distinct purpose.
- `apps/web/src/components/recipe/ForkCard.tsx:9-25` — fork CTA card, distinct purpose.
- RecipeDetailPage / RecipeComparePage — no `card hover:shadow-lg` recipe-card markup found (rg over
  pages, only the 8 hits listed in §3.6).

---

## 2. Other entity cards/lists

### 2a. Collection cards — one shared component + one hand-rolled copy

Canonical: `apps/web/src/components/collections/CollectionCard.tsx:41-97` (name + visibility emoji +
description + optional author + recipe count).

- CLEAN: `apps/web/src/pages/collections/CollectionListPage.tsx:7,67` and
  `apps/web/src/pages/collections/CollectionsBrowsePage.tsx:7,63`
  (`<CollectionCard … showAuthor />`).
- VIOLATION: `apps/web/src/pages/users/UserProfilePage.tsx:253-269` — collections tab hand-rolls:

```tsx
collectionsData.data.map((c) => (
  <Link key={c.id} to={`/collections/${c.id}`} className='card hover:shadow-lg transition-shadow'>
    <h3 className='font-semibold' style={{ color: 'var(--text-primary)' }}>{c.name}</h3>
    <div className='mt-1 flex gap-2 text-xs' style={{ color: 'var(--text-tertiary)' }}>
      <span>{c.recipeCount} {t('collection.detail.recipes')}</span>
    </div>
  </Link>
));
```

Same data type (`CollectionListItemOutput`, UserProfilePage.tsx:7) as CollectionCard's prop —
drop-in replacement; the inline copy silently loses the visibility badge and description. ~17 lines
removed.

### 2b. Beans / Equipment (my list) / Setups — triplet of clone pages

`apps/web/src/pages/beans/BeanListPage.tsx`, `apps/web/src/pages/equipment/EquipmentListPage.tsx`,
`apps/web/src/pages/setups/SetupListPage.tsx` are structural clones ("my items" CRUD page). Parallel
blocks:

| Block                                                                                                                        | BeanListPage | EquipmentListPage | SetupListPage |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------- | ------------- |
| centered `common.loading`                                                                                                    | 69-78        | 83-92             | 66-75         |
| header + toggle-form button                                                                                                  | 83-90        | 97-104            | 80-87         |
| inline create form, hand-rolled label+input groups                                                                           | 92-176       | 106-184           | 89-145        |
| `globalThis.confirm` delete                                                                                                  | 61           | 71                | 58            |
| empty state `text-center py-12`                                                                                              | 178-183      | 186-191           | 147-152       |
| card grid: `<div className='card'><div className='flex items-start justify-between'>` title + meta spans + red delete button | 185-218      | 193-221           | 154-187       |

The item card is the same JSX shape 3× (e.g. BeanListPage.tsx:187-216 vs
EquipmentListPage.tsx:195-219 vs SetupListPage.tsx:156-185): `h3 font-semibold` title, secondary
line, `text-xs text-tertiary` meta spans, `style={{ color: 'var(--error)' }}` delete button. None of
the three forms uses `components/form/Field` (label markup `block text-sm font-medium mb-1` repeated
12× across the three files). Consolidation:
`OwnedItemCard { title, subtitle?, meta: ReactNode, onDelete }` (~90 lines removed) + `Field`
adoption in the forms (~60 lines). Optionally a full `ManagedListPage` shell later.

### 2c. Coffee varieties + equipment catalogs — near-clone page pair

`apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx` and
`apps/web/src/pages/equipment/EquipmentCatalogPage.tsx` are the same page copy-pasted for a
different entity:

| Block                                                                                                             | CoffeeVarietiesPage | EquipmentCatalogPage |
| ----------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------- |
| `updateFilter(key, value)` URL-param helper (identical bodies)                                                    | 70-81               | 88-99                |
| category pill tabs (`rounded-full px-3 py-1.5 text-sm transition-colors` + active accent classes, identical)      | 97-113              | 115-143              |
| debounced search input                                                                                            | 116-124             | 146-154              |
| "active filters" + clear-all row                                                                                  | 127-140             | 157-170              |
| hand-rolled skeleton card grid                                                                                    | 145-157             | 175-185              |
| error + retry block                                                                                               | 159-177             | 188-206              |
| empty + clear-search block                                                                                        | 179-193             | 208-221              |
| entity card (`card hover:shadow-lg transition-shadow`, accent `rounded-full` type pill, line-clamped description) | 196-256             | 225-275              |
| inline pagination (exact clone of shared PaginationControls JSX)                                                  | 259-287             | 278-306              |

Also `EquipmentCatalogPage.tsx:12-19` defines a local `CatalogEquipmentItem` instead of shared
`EquipmentOutput`. Consolidation: extract `CategoryTabs`, `CatalogEntityCard` (title/brand + type
pill + clamped description), reuse `PaginationControls`, share error/empty/loading state blocks
(§3). ~150 lines removed across the pair; makes the third catalog (vendors? taste notes) cheap.

### 2d. Notifications — CLEAN

- `apps/web/src/pages/notifications/NotificationListPage.tsx:9,121` uses shared `NotificationItem`;
  `:8,128-135` uses shared `PaginationControls`.
- `apps/web/src/components/layout/NotificationDropdown.tsx:8,110` also uses `NotificationItem`. No
  duplication.

### 2e. Users (follow lists) — single site, OK

`FollowList` in `apps/web/src/pages/users/UserProfilePage.tsx:53-79` is the only user-row list (card
with displayName + @username). Not currently duplicated; fine to leave inline.

### 2f. Vendors / admin taste notes / admin equipment / admin coffee varieties

Admin CRUD pages (`AdminVendorsPage.tsx`, `AdminEquipmentPage.tsx`, `AdminTasteNotesPage.tsx`,
`AdminCoffeeVarietiesPage.tsx`, `AdminRecipesPage.tsx`, `AdminUsersPage.tsx`,
`AdminAuditLogPage.tsx`) each hand-roll: centered `common.loading` div (§3.4), a `<table>` with the
same header-row styling (`borderBottom: '2px solid var(--border-primary)'`), inline create/edit
forms with raw label markup, and `globalThis.confirm` deletes (except AdminCoffeeVarietiesPage which
built a bespoke modal — §3.3). No shared AdminTable/AdminForm primitives exist. Lower priority than
public pages but same disease.

---

## 3. Cross-cutting primitives

### 3.1 Pagination — canonical exists, 5 duplicate implementations

Canonical: `apps/web/src/components/recipe-list/PaginationControls.tsx:17-48` (used by
RecipeListView.tsx:335-343 and NotificationListPage.tsx:128-135). Duplicates:

1. `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx:260-287` — byte-for-byte the same
   JSX as the shared component (conditional prev/next `btn-secondary`, `common.pagination` label
   with `{page}`/`{total}` replace).
2. `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx:279-306` — same clone.
3. `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx:573-598` — disabled-button variant, same
   label logic.
4. `apps/web/src/pages/admin/AdminUsersPage.tsx:283-317` — numbered page buttons variant.
5. `apps/web/src/pages/admin/AdminAuditLogPage.tsx:124-137` — prev/next with no page label and no
   upper bound. Consolidation: move `PaginationControls` to `components/ui/`, make the three label
   props optional (every call site passes identical
   `t('common.previous')`/`t('common.next')`/`t('common.pagination')` — see
   RecipeListView.tsx:339-341, NotificationListPage.tsx:132-134; the component could call
   `useTranslation()` itself), add `variant: 'hide' | 'disable'` for the admin style. Replaces sites
   1-3 and 5 directly (~80 lines); site 4 (numbered) optional follow-up.

### 3.2 Visibility badge (collections) — emoji mapping ×3

Identical `public→🌐 / unlisted→🔗 / private→🔒` ternary:

1. `apps/web/src/components/collections/CollectionCard.tsx:46-50`
2. `apps/web/src/pages/collections/CollectionDetailPage.tsx:59-63`
3. `apps/web/src/components/collections/AddToCollectionModal.tsx:175-179` Note recipes use a
   different, richer visibility badge
   (`apps/web/src/components/recipe/MetadataBadges.tsx:19-24,62-73`, colour dot + dashed draft
   border). Consolidation: `CollectionVisibilityBadge` (or `visibilityEmoji(v)` util) in
   components/collections; 3 sites.

### 3.3 Confirm dialogs / modal shells

Three hand-rolled overlay shells (all `fixed inset-0 … z-50` + `card max-w-* w-full`):

1. `apps/web/src/components/admin/BanDialog.tsx:46-50` (no backdrop-click close)
2. `apps/web/src/components/collections/AddToCollectionModal.tsx:128-135` (backdrop click +
   stopPropagation)
3. `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx:603-634` (inline delete-confirm modal,
   cancel/confirm buttons) Plus 9 sites using native `globalThis.confirm` for destructive deletes:
   `EquipmentListPage.tsx:71`, `SetupListPage.tsx:58`, `BeanListPage.tsx:61`,
   `SettingsPage.tsx:112`, `AdminRecipesPage.tsx:51`, `AdminUserDetailPage.tsx:61`,
   `AdminVendorsPage.tsx:61`, `AdminTasteNotesPage.tsx:64`, `AdminEquipmentPage.tsx:78`.
   Consolidation: `components/ui/Modal.tsx` shell +
   `ConfirmDialog { title, message, onConfirm, destructive }`. Rebase BanDialog/AddToCollectionModal
   on the shell; replace the AdminCoffeeVarietiesPage inline modal; migrate the 9 `confirm()` sites
   for UI consistency (currently a mix of native dialog and styled modal for identical actions).

### 3.4 Loading states — three competing idioms

1. Skeletons (canonical, `apps/web/src/components/ui/Skeleton.tsx`: `RecipeCardSkeletonGrid`:88-94,
   `PageSkeleton`:180-192, etc.) — used by HomePage.tsx:72,85, RecipeListView.tsx:317,
   EquipmentDetailPage.tsx:54-63, CoffeeVarietyDetailPage.tsx:62-78.
2. Hand-rolled skeleton card grids duplicating `RecipeCardSkeletonGrid`'s shape:
   CoffeeVarietiesPage.tsx:145-157, EquipmentCatalogPage.tsx:175-185.
3. Centered `t('common.loading')` text div — 18 sites in pages
   (`rg "common.loading" apps/web/src/pages`): EquipmentListPage.tsx:89, SetupListPage.tsx:72,
   BeanListPage.tsx:75, RecipeVersionsPage.tsx:51, RecipeFocusModePage.tsx:67,
   RecipeEditPage.tsx:171, RecipeForkPage.tsx:69, RecipeComparePage.tsx:59, TasteNotesPage.tsx:290,
   AdminRecipesPage.tsx:66, AdminCoffeeVarietiesPage.tsx:476, AdminAuditLogPage.tsx:70,
   AdminVendorsPage.tsx:160, AdminEquipmentPage.tsx:200, AdminBadgesPage.tsx:37,
   AdminTasteNotesPage.tsx:141, AdminCompatibilityPage.tsx:69, plus RecipeListView.tsx:319-321
   (starred branch) and AddToCollectionModal.tsx:151. Consolidation:
   `CardSkeletonGrid { count, variant }` generalising RecipeCardSkeletonGrid for catalog cards (2
   sites), and a `LoadingState` (centered text) component for the rest (or migrate to skeletons
   opportunistically).

### 3.5 Empty states

`text-center py-12` empty/notice block appears 19× (rg count). Representative:
RecipeListView.tsx:325-327, StarredRecipesPage.tsx:67-69, BeanListPage.tsx:180-182,
SetupListPage.tsx:149-151, EquipmentListPage.tsx:188-190, CollectionListPage.tsx:60-62,
CollectionsBrowsePage.tsx:56-58, CollectionDetailPage.tsx:100-102, NotificationListPage.tsx:113-115,
EquipmentCatalogPage.tsx:210-221 (+ clear-filters button), CoffeeVarietiesPage.tsx:181-192 (+
clear-filters button), TasteNotesPage.tsx:293, EquipmentDetailPage.tsx:66-78 /
CoffeeVarietyDetailPage.tsx:80-94 (not-found variants with CTA). Consolidation:
`EmptyState { message, action? }` — mechanical, ~15 sites.

### 3.6 Card link shell

`className='card hover:shadow-lg transition-shadow'` hand-typed at 8 sites (rg): RecipeCard.tsx:25,
CollectionCard.tsx:57, EquipmentDetailPage.tsx:166, EquipmentCatalogPage.tsx:230,
UserProfilePage.tsx:230,257, CoffeeVarietyDetailPage.tsx:215, CoffeeVarietiesPage.tsx:201. Collapses
automatically once §1/§2 consolidations land (only the two shared cards + CatalogEntityCard remain).

### 3.7 Form field label groups — two shared primitives + mass non-adoption

Two near-duplicate labelled-field wrappers exist:

- `apps/web/src/components/form/Field.tsx:14-24` (label element, required marker) — used ONLY by
  RecipeCreatePage.tsx and RecipeEditPage.tsx (rg for `components/form` imports).
- `apps/web/src/components/recipe-list/FilterField.tsx:7-19` (div + label, same classes) — used only
  inside RecipeListView. Raw duplicated label markup
  `className='block text-sm font-medium mb-1' style={{ color: 'var(--text-secondary)' }}` appears
  ~45× in 15 files (rg -c): SettingsPage 8, BeanListPage 5, AdminUserEditPage 5, AdminUserCreatePage
  5, EquipmentListPage 4, AdminEquipmentPage 4, SetupListPage 3, AdminCoffeeVarietiesPage 3,
  AdminVendorsPage 3, AdminTasteNotesPage 2, RecipeCreatePage 1, RecipeEditPage 1, RecipeForkPage 1,
  FilterField 1 (the primitive itself), BanDialog 1. Consolidation: merge FilterField into Field
  (Field with optional `required`; FilterField's div wrapper is functionally the same), then adopt
  Field across the 13 non-adopting files. Mechanical but wide (~45 label blocks → one-liner each).

### 3.8 Author link/button

Canonical style const: `apps/web/src/components/recipe/RecipeCard.styles.ts:1-8`
(`AUTHOR_BUTTON_STYLE`), used by recipe-list/RecipeCard.tsx:2,37. Duplicate:
`apps/web/src/components/collections/CollectionCard.tsx:73-89` re-rolls the same stopPropagation
author `<button>` with an inline style object (80-86:
`background:none, border:none, padding:0, cursor:pointer, color:'inherit'`) — drift:
`color: inherit` vs canonical `var(--accent-primary)`. Consolidation:
`AuthorButton { author, className? }` component used by both cards (2 sites, prevents a 3rd
copy-paste).

### 3.9 Type/category pill badge (accent, rounded-full)

Same accent-background pill for entity type/category at 4 sites:

- EquipmentCatalogPage.tsx:248-258, EquipmentDetailPage.tsx:120-127
  (`equipment.type.replace(/_/g,' ')`)
- CoffeeVarietiesPage.tsx:207-223, CoffeeVarietyDetailPage.tsx:148-161 (category with per-category
  i18n ternary duplicated across the two variety files) Consolidation: `TypeBadge { label }` + a
  shared `varietyCategoryLabel(t, category)` helper.

### 3.10 Breadcrumbs

Generic `<nav aria-label='Breadcrumb'><ol className='flex items-center gap-1 flex-wrap text-xs'>`
shell duplicated:

- `apps/web/src/components/recipe/BreadcrumbNav.tsx:31-81` (recipe-specific, canonical-ish)
- EquipmentDetailPage.tsx:97-117
- CoffeeVarietyDetailPage.tsx:128-145 Consolidation: generic `Breadcrumb { items: {label, to?}[] }`;
  BreadcrumbNav becomes a thin adapter. 3 sites.

### 3.11 Star ratings — CLEAN

`apps/web/src/components/recipe/StarRating.tsx` is the only rating display/input; the `★ {v.rating}`
inline in CoffeeVarietyDetailPage.tsx:231 disappears with the RecipeCard consolidation (§1c).
`FavouriteButton.tsx:49` / `LikeButton.tsx:47` are single implementations.

---

## 4. Prioritised consolidation plan (feeds tech-debt spec)

| #  | Item                                 | Canonical                                        | Duplicate sites                                                                                                                                                                       | Est. effort                                |
| -- | ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1  | Recipe cards                         | extend `recipe-list/RecipeCard`                  | UserProfilePage.tsx:226-243; EquipmentDetailPage.tsx:162-181; CoffeeVarietyDetailPage.tsx:209-243                                                                                     | S-M (prop design for author/version strip) |
| 2  | Collection card                      | `collections/CollectionCard`                     | UserProfilePage.tsx:253-269                                                                                                                                                           | S                                          |
| 3  | Pagination                           | `recipe-list/PaginationControls` → `ui/`         | CoffeeVarietiesPage.tsx:260-287; EquipmentCatalogPage.tsx:279-306; AdminCoffeeVarietiesPage.tsx:573-598; AdminAuditLogPage.tsx:124-137; (AdminUsersPage.tsx:283-317 numbered variant) | S                                          |
| 4  | Catalog page pair                    | new CategoryTabs/CatalogEntityCard/shared states | CoffeeVarietiesPage vs EquipmentCatalogPage (§2c table)                                                                                                                               | M                                          |
| 5  | "My items" triplet                   | new OwnedItemCard + Field adoption               | BeanListPage/EquipmentListPage/SetupListPage (§2b table)                                                                                                                              | M                                          |
| 6  | Modal/ConfirmDialog                  | new `ui/Modal` + `ui/ConfirmDialog`              | BanDialog.tsx:46-50; AddToCollectionModal.tsx:128-135; AdminCoffeeVarietiesPage.tsx:603-634; 9× globalThis.confirm                                                                    | M                                          |
| 7  | Collection visibility badge          | new `CollectionVisibilityBadge`                  | CollectionCard.tsx:46-50; CollectionDetailPage.tsx:59-63; AddToCollectionModal.tsx:175-179                                                                                            | XS                                         |
| 8  | Field ⇄ FilterField merge + adoption | `form/Field`                                     | FilterField.tsx:7-19 + ~45 raw label blocks in 13 files (§3.7)                                                                                                                        | M (mechanical)                             |
| 9  | EmptyState / LoadingState            | new `ui/EmptyState`, `ui/LoadingState`           | ~19 + ~18 sites (§3.4/§3.5)                                                                                                                                                           | M (mechanical)                             |
| 10 | AuthorButton                         | new, from RecipeCard.styles.ts                   | RecipeCard.tsx:30-40; CollectionCard.tsx:73-89                                                                                                                                        | XS                                         |
| 11 | TypeBadge + Breadcrumb               | new                                              | §3.9 (4 sites), §3.10 (3 sites)                                                                                                                                                       | S                                          |

## 5. Explicitly CLEAN (no action)

- HomePage, RecipeListPage, StarredRecipesPage, CollectionRecipeList, CollectionListPage,
  CollectionsBrowsePage, NotificationListPage, NotificationDropdown — all on shared components.
- StarRating/LikeButton/FavouriteButton/FollowButton — single implementations.
- ForkCard, RecipeVersionsPage rows, AdminRecipesPage table — different presentations, not card
  duplicates.
- FollowList (UserProfilePage.tsx:53-79) — single site.
