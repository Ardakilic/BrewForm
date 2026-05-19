# Plan 04: Code Quality Foundation

**Priority:** 4
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 4
**Issues:** H14 (Sanitization), H6 (`any` Types), H9 (i18n Buttons), H15 (Debounce + Pagination), M12 (Rate Limiter), M13 (Password Strength), M15 (Prisma Docs)
**Effort:** ~8–12 hours
**Impact:** 🛡️ XSS defense, 📐 Type safety, 🌐 Localization, ⚡ UX performance

---

## H14 — No Server-Side Content Sanitization

**Background:** User-generated content stored and rendered without HTML stripping. While React JSX provides some protection, no deliberate content security policy exists.

### Tasks
1. **Backend:** Add sanitization in service layer for:
   - Comments (`comment/service.ts`)
   - Recipes (`recipe/service.ts`)
   - User bios (`user/service.ts`)
   - Taste notes (`taste/service.ts`)
2. Use `jsr:@kt3k/sanitize-html` or strip HTML tags with `text.replace(/<[^>]*>/g, '')`
3. **Frontend:** Add defense-in-depth sanitization before rendering user content

---

## H6 — `any` Type Abuse in Frontend

**Background:** ~35–40 `any` occurrences in pages directory — no TypeScript protection on recipe data shapes.

### Tasks
1. Define typed API response interfaces using `@brewform/shared/types`
2. Replace `useState<any>` → `useState<RecipeDetail | null>` in RecipeDetailPage
3. Replace `useState<any[]>` → `useState<TasteNote[]>` etc.
4. Remove `as unknown as any[]` casts — use proper types
5. Update API client return types to return typed responses

---

## H9 — Print/Focus/Fork Button Text Not Internationalized

**Background:** Buttons hardcoded to English despite i18n keys existing (`recipe.print`, `recipe.focusMode`, `recipe.fork`).

### Tasks
1. Replace hardcoded strings in `RecipeDetailPage.tsx`:
   - `"Print"` → `{t('recipe.print')}`
   - `"Focus"` → `{t('recipe.focusMode')}`
   - `"Fork Recipe"` → `{t('recipe.fork')}`
2. Verify Turkish translations render correctly

---

## H15 — Search Input Has No Debounce

**Background:** Search fires API request on every keystroke. Pagination uses local array length instead of server `meta.total`.

### Tasks
1. Add `useDebounce` hook in `RecipeListPage.tsx` (300ms delay)
2. Fix pagination total: modify API client to return `{ items, meta }` instead of just `data.data`
3. Update `RecipeListPage.tsx:142`: `setTotal(data.meta.total)`
4. Same fix in `StarredRecipesPage.tsx:142`

---

## M12 — authRateLimitMiddleware is Dead Code

**Background:** Middleware defined at `rateLimit.ts:57` but never imported or used anywhere.

### Tasks
1. Import `authRateLimitMiddleware` in `apps/api/src/modules/auth/index.ts`
2. Apply to: `POST /login`, `POST /register`, `POST /forgot-password`

---

## M13 — Password Strength Validation is Length-Only

**Background:** Register schema: `z.string().min(8).max(128)` — no complexity rules. Login schema has no min length.

### Tasks
1. Update register schema with lowercase, uppercase, digit, special character requirements (min 12)
2. Update login schema: add `.min(1)`
3. Update reset-password schema to match new requirements

---

## M15 — 10 Stale Prisma References in Documentation

**Background:** Project uses Drizzle ORM, not Prisma. 10 stale references across 4 doc files.

### Tasks
1. Replace `@prisma/client` with `drizzle-orm` in `docs/decisions.md`, `docs/request-lifecycle.md`, `docs/notifications.md`
2. Replace `Prisma + migration` with `Drizzle + migration`
3. Clean up `docs/requirements-audit-report.md` Prisma references

---

## Dependencies

- H14 sanitization can use existing regex-based approach immediately; `sanitize-html` package is optional enhancement
- H6 types depend on `@brewform/shared/types` having correct definitions
- H15 debounce is independent; pagination fix requires API client change
- M12, M13, M15 are quick standalone fixes
