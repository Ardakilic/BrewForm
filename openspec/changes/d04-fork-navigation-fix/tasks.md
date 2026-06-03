## 1. Create Fork Page Component

- [x] 1.1 Create `apps/web/src/pages/recipes/RecipeForkPage.tsx` with loading, error, and fork states
- [x] 1.2 Fetch source recipe title via `recipeApi.get(id)` on mount to pre-fill fork name
- [x] 1.3 Render confirmation form with optional custom title input (maxLength 200)
- [x] 1.4 Call `recipeApi.fork(id, title)` on submit, navigate to `/recipes/${result.id}/edit` on success
- [x] 1.5 Include `<SEOHead noIndex />` and i18n keys (`recipe.fork`)
- [x] 1.6 Disable submit button while `forking === true` to prevent double-submission

## 2. Register Route

- [x] 2.1 Add `recipes/:id/fork` lazy route to `apps/web/src/router.tsx` after the `:id/edit` block
- [x] 2.2 Wrap with `<RequireAuth>` (forking requires authentication)

## 3. Verify

- [x] 3.1 Run `make lint` — all lint rules pass
- [x] 3.2 Run `make check` — web lint + API/shared/db type-check pass
- [x] 3.3 Run `make test` — 114 pass (2 pre-existing failures unrelated)
- [ ] 3.4 Run `make preview` — Vite build (skipped, requires full Docker stack)

## 4. Tests and Docblocks

- [x] 4.1 Add JSDoc docblock to `RecipeForkPage.tsx`
- [x] 4.2 Create `RecipeForkPage.test.tsx` with 21 test cases
- [x] 4.3 Add `htmlFor`/`id` label-input association for accessibility
- [x] 4.4 Run `make fmt` — passes
- [x] 4.5 Run `make test-web` — all 731 tests pass (21 new)
- [x] 4.6 Run `make lint` — passes
