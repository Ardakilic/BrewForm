# D36 — Extract Duplicated UI Components (RecipeCard / BanDialog / Form Helpers)

**Severity:** Medium
**Status:** Open (2026-07-04)
**Relationship:** Gives `TECHNICAL_DEBT.md` §4.1 its dedicated plan. Complements [`D11-recipe-list-deduplication.md`](D11-recipe-list-deduplication.md) (resolved), which created `components/recipe-list/` — but three duplication clusters survived outside D11's scope.

---

## Problem

Three UI clusters are duplicated across pages, each already drifting or at risk of drifting:

### 1. HomePage re-implements `RecipeCard` (P2)

- `apps/web/src/pages/HomePage.tsx:94` — local `function RecipeCard({ recipe }: { recipe: RecipeListItem })`
- `apps/web/src/components/recipe-list/RecipeCard.tsx:14` — the canonical shared card with the **same props signature**

Any card styling/behaviour change (badge display, like counts, links) must be made twice or the home page silently diverges from the list pages.

### 2. Ban dialog + ban mutation duplicated across admin pages (P2)

- `apps/web/src/pages/admin/AdminUsersPage.tsx` — `banDialog` state at `:26`, ban/unban handlers at `:73-88` calling `adminApi.banUser`/`unbanUser`, inline dialog markup around `:341`
- `apps/web/src/pages/admin/AdminUserDetailPage.tsx` — the same state shape at `:19`, the same handler at `:50-52`, inline dialog markup around `:297`

Identical state machine (`{ user, reason, processing }`), identical API calls, identical modal markup — maintained twice.

### 3. `Section`/`Field` form helpers stranded in RecipeCreatePage (P3)

- `apps/web/src/pages/recipes/RecipeCreatePage.tsx:535` (`Section`) and `:545` (`Field`) — local helpers.
- Note: `RecipeEditPage.tsx` **no longer** has copies (the original §4.1 claim is partially stale) — but the helpers are generic form-layout primitives that belong in `components/form/`, and RecipeEditPage would benefit from reusing them.

### Optional stretch (P3)

- `apps/web/src/pages/admin/AdminRecipesPage.tsx:87` — inline recipe-card markup for the admin recipe list. Admin cards need extra affordances (visibility toggles, delete), so extraction may not pay off; evaluate, don't force.

---

## Proposed Fix

1. **HomePage → shared RecipeCard**: delete the local `RecipeCard` in `HomePage.tsx:94` and import `RecipeCard` from `components/recipe-list/`. Diff the two implementations first; if HomePage's variant has intentional differences (e.g. compact layout), add a variant prop to the shared card rather than keeping the fork.
2. **Extract `BanDialog` + `useBanUser`**:
   - Create `apps/web/src/components/admin/BanDialog.tsx` — controlled dialog taking `{ user, open, onClose, onConfirm(reason), processing }`.
   - Create `apps/web/src/hooks/useBanUser.ts` (or co-locate in `components/admin/`) — owns the `{ user, reason, processing }` state, calls `adminApi.banUser`/`adminApi.unbanUser`, exposes `openBanDialog(user)`, `confirmBan()`, `unban(userId)`, error state.
   - Replace the inline implementations in `AdminUsersPage.tsx` and `AdminUserDetailPage.tsx` with the shared pieces. Preserve each page's post-mutation refresh behaviour (list reload vs detail reload) via a callback.
3. **Move `Section`/`Field` to `components/form/`**: create `apps/web/src/components/form/Section.tsx` and `Field.tsx` (or one `index.tsx`), export from `components/form/index.ts`, and update `RecipeCreatePage.tsx` to import them. Adopt them in `RecipeEditPage.tsx` where equivalent inline markup exists.
4. **Stretch**: assess `AdminRecipesPage.tsx:87` — extract only if the shared card can absorb admin affordances without prop bloat.
5. i18n note: new shared components must use `t()` for their strings (coordinate with D40, which covers the admin pages these components live in).
6. Run `make ci` and the web test suite.

---

## Files to Change

| File | Change |
|------|--------|
| `apps/web/src/pages/HomePage.tsx` | Delete local `RecipeCard`; import shared |
| `apps/web/src/components/recipe-list/RecipeCard.tsx` | Variant prop if HomePage needs one |
| `apps/web/src/components/admin/BanDialog.tsx` | **New** shared dialog |
| `apps/web/src/hooks/useBanUser.ts` | **New** ban/unban mutation hook |
| `apps/web/src/pages/admin/AdminUsersPage.tsx` | Use `BanDialog` + `useBanUser` |
| `apps/web/src/pages/admin/AdminUserDetailPage.tsx` | Same |
| `apps/web/src/components/form/Section.tsx`, `Field.tsx`, `index.ts` | **New** form-layout primitives |
| `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | Import from `components/form/` |
| `apps/web/src/pages/recipes/RecipeEditPage.tsx` | Adopt form primitives |

---

## Test Plan

- **BanDialog component test** (Vitest + Testing Library): renders user name, requires/records reason, confirm calls `onConfirm` with the reason, cancel calls `onClose`, `processing` disables the confirm button.
- **useBanUser hook test**: mock `adminApi.banUser`/`unbanUser`; assert state transitions (open → processing → closed on success; processing reset + error surfaced on failure).
- **HomePage test**: renders shared `RecipeCard` for loader data (extend existing HomePage test if present).
- **Regression**: existing recipe-list component tests still pass; admin pages render (smoke) with the extracted dialog.
- Manual: ban + unban a user from both the users list and the user detail page; create a recipe via RecipeCreatePage.

---

## Acceptance Criteria

- [ ] Exactly one `RecipeCard` implementation for public recipe lists (admin stretch excluded).
- [ ] Ban dialog markup and ban/unban mutation logic exist in exactly one place each.
- [ ] `Section`/`Field` live in `components/form/` and are used by RecipeCreatePage (and RecipeEditPage where applicable).
- [ ] No behaviour change: ban reason still sent to the API; post-ban refresh works on both admin pages.
- [ ] New shared components have tests; `make ci` passes.

---

## Effort Estimate

**Medium** — ~1 day. The BanDialog extraction is the bulk (two call sites with slightly different refresh flows); RecipeCard and Section/Field moves are mechanical.
