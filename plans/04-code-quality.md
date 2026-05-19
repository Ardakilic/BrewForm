# Plan 04: Code Quality Foundation

**Priority:** 4
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 4
**Issues:** H14 (Sanitization), H6 (`any` Types), H9 (i18n Buttons), H15 (Debounce + Pagination), M12 (Rate Limiter), M13 (Password Strength), M15 (Prisma Docs)
**Effort:** ~8–12 hours
**Impact:** 🛡️ XSS defense, 📐 Type safety, 🌐 Localization, ⚡ UX performance

---

## H14 — No Server-Side Content Sanitization ✅ CONFIRMED

**Evidence:**
- Search for `DOMPurify`, `sanitize-html`, `sanitize` in `apps/web/src/` — **zero results** for content sanitization libraries.
- Search for sanitization in `apps/api/src/modules/comment/` — **zero results**. Comments stored unsanitized.
- [`apps/web/src/components/recipe/CommentSection.tsx:28-62`](apps/web/src/components/recipe/CommentSection.tsx) — `renderInlineMarkdown()` regex parser processes bold/italic/underline patterns. Does NOT strip HTML tags, zero-width characters, or homoglyph attacks from raw text.
- Only sanitization in codebase: `sanitizeUser()` strips `passwordHash` (not content), and SQL LIKE wildcard stripping in recipe search.

**Impact:** User-generated content (comments, bios, recipe descriptions, taste note labels) stored and rendered without HTML stripping. While React's JSX auto-escaping provides some protection, there's no deliberate content security policy.

**Context7 Note (Deno):** Use `jsr:@kt3k/sanitize-html` or similar for server-side HTML sanitization.

**Action Plan:**
1. **Backend** — Add sanitization in service layer for:
   - Comments (`comment/service.ts`)
   - Recipes (`recipe/service.ts`)
   - User bios (`user/service.ts`)
   - Taste notes (`taste/service.ts`)
2. Use `jsr:@kt3k/sanitize-html` or at minimum strip HTML tags: `text.replace(/<[^>]*>/g, '')`
3. **Frontend** — Add defense-in-depth sanitization before rendering user content

**Estimated effort:** Small (2-3 hours)

---

## H6 — `any` Type Abuse in Frontend ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:32`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `useState<any>(null)`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:35`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `useState<any[]>([])`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:87`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `const tasteNotes: any[]`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:89`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `const equipment: any[]`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:306`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `(prev: any) =>`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:309-310`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — `(result as any).avgRating`
- **Total in RecipeDetailPage.tsx:** 8 occurrences
- **RecipeCreatePage.tsx:** ~15 occurrences including `as unknown as any[]` for BREW_METHODS, DRINK_TYPES, VISIBILITY
- **RecipeEditPage.tsx:** ~12 occurrences with same anti-patterns
- **Total across pages directory (non-test):** ~35-40 `any` occurrences

**Impact:** TypeScript provides zero protection on recipe data shapes. Runtime type errors silently swallowed.

**Action Plan:**
1. Define typed API response interfaces in `apps/web/src/api/types.ts` using `@brewform/shared/types`:
   ```tsx
   import type { RecipeDetail } from '@brewform/shared/types';
   import type { TasteNote } from '@brewform/shared/types';
   ```
2. Replace `useState<any>` → `useState<RecipeDetail | null>` in RecipeDetailPage, RecipeCreatePage, RecipeEditPage
3. Replace `useState<any[]>` → `useState<TasteNote[]>` etc.
4. Remove module-level `as unknown as any[]` casts — use proper types from constants
5. Update API client return types to return typed responses instead of `Record<string, unknown>`

**Estimated effort:** Medium (4-6 hours across all pages)

---

## H9 — Print/Focus/Fork Button Text Not Internationalized ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:146-153`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — Print button: hardcoded `"Print"`, `aria-label='Print recipe'`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:156-163`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — Focus button: hardcoded `"Focus"`, `aria-label='Focus mode'`
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx:166-174`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — Fork button: hardcoded `"Fork Recipe"`, `aria-label='Fork recipe'`
- **i18n keys DO exist:** `recipe.print` ("Print"/"Yazdır"), `recipe.focusMode` ("Focus Mode"/"Odak Modu"), `recipe.fork` ("Fork Recipe"/"Tarifi Çatalla") in `en.json:28,51,52` — but never called.

**Impact:** Turkish users see English button text despite the rest of the UI being localized. Inconsistent UX.

**Action Plan:**
1. Replace hardcoded strings in RecipeDetailPage.tsx:
   ```tsx
   <button aria-label={t('recipe.print')}>{t('recipe.print')}</button>
   <button aria-label={t('recipe.focusMode')}>{t('recipe.focusMode')}</button>
   <button aria-label={t('recipe.fork')}>{t('recipe.fork')}</button>
   ```
2. Ensure buttons accommodate Turkish translation length

**Estimated effort:** Small (15 minutes)

---

## H15 — Search Input Has No Debounce ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/pages/recipes/RecipeListPage.tsx:283-289`](apps/web/src/pages/recipes/RecipeListPage.tsx) — Search input: `onChange={(e) => updateFilter('search', e.target.value)}` fires on **every keystroke**. No `setTimeout`, no `useDebouncedCallback`, no debounce utility.
- [`apps/web/src/pages/recipes/RecipeListPage.tsx:139-142`](apps/web/src/pages/recipes/RecipeListPage.tsx) — `setTotal(items.length)` uses local array length instead of server `meta.total`. The API client discards the meta wrapper.
- Same pagination bug in [`apps/web/src/pages/recipes/StarredRecipesPage.tsx:142`](apps/web/src/pages/recipes/StarredRecipesPage.tsx).

**Impact:** Typing "chemex" fires 6 separate API requests. Pagination shows incorrect page counts (max 1 page even when server has 50+ results).

**Action Plan:**
1. Add debounce hook to RecipeListPage.tsx:
   ```tsx
   import { useState, useEffect, useRef } from 'react';

   function useDebounce<T>(value: T, delay: number): T {
     const [debouncedValue, setDebouncedValue] = useState(value);
     useEffect(() => {
       const timer = setTimeout(() => setDebouncedValue(value), delay);
       return () => clearTimeout(timer);
     }, [value, delay]);
     return debouncedValue;
   }

   // In component:
   const [search, setSearch] = useState('');
   const debouncedSearch = useDebounce(search, 300);
   // Use debouncedSearch in the fetch effect, not raw search
   ```
2. **Fix pagination total** — Modify `apps/web/src/api/client.ts` to return full response including `meta`:
   ```tsx
   // Instead of unwrapping to just data.data, return { items: data.data, meta: data.meta }
   ```
3. Update RecipeListPage.tsx line 142: `setTotal(data.meta.total)`
4. Update StarredRecipesPage.tsx line 142: same fix

**Estimated effort:** Small (1-2 hours)

---

## M12 — authRateLimitMiddleware is Dead Code ✅ CONFIRMED

**Evidence:**
- [`apps/api/src/middleware/rateLimit.ts:57`](apps/api/src/middleware/rateLimit.ts) — `export function authRateLimitMiddleware()` — **defined** (15-min window, 5 max attempts).
- Search for `authRateLimitMiddleware` in `apps/api/src/main.ts` — **not imported**.
- Search for `authRateLimitMiddleware` in `apps/api/src/modules/auth/` — **not imported**.
- Only reference is its own definition.

**Impact:** Auth endpoints have no brute-force protection. Unlimited login/register/forgot-password attempts.

**Action Plan:**
1. Import and apply in `apps/api/src/modules/auth/index.ts`:
   ```tsx
   import { authRateLimitMiddleware } from '../../middleware/rateLimit.ts';

   authRouter.use('/login', authRateLimitMiddleware());
   authRouter.use('/register', authRateLimitMiddleware());
   authRouter.use('/forgot-password', authRateLimitMiddleware());
   ```

**Estimated effort:** Small (10 minutes)

---

## M13 — Password Strength Validation is Length-Only ✅ CONFIRMED

**Evidence:**
- [`packages/shared/src/schemas/auth.ts:6`](packages/shared/src/schemas/auth.ts) — `password: z.string().min(8).max(128)` — **no complexity rules**
- [`packages/shared/src/schemas/auth.ts:12`](packages/shared/src/schemas/auth.ts) — Login password: `z.string()` — **no minimum length at all**
- [`packages/shared/src/schemas/auth.ts:27`](packages/shared/src/schemas/auth.ts) — Reset password: `z.string().min(8).max(128)` — same length-only

**Impact:** Weak passwords allowed. No uppercase, digit, or special character requirements. Login schema has zero validation on password field.

**Action Plan:**
1. Update register schema:
   ```tsx
   password: z.string()
     .min(12, 'Password must be at least 12 characters')
     .max(128)
     .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
     .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
     .regex(/[0-9]/, 'Password must contain at least one number')
     .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
   ```
2. Update login schema to at least `.min(1)`
3. Update reset password schema to match new register requirements

**Estimated effort:** Small (15 minutes)

---

## M15 — 10 Stale "Prisma" References in Documentation ✅ CONFIRMED

**Evidence:** 10 `Prisma` references across 4 doc files:

| File | Lines |
|------|-------|
| `docs/decisions.md:94` | `never import @prisma/client` |
| `docs/request-lifecycle.md:180` | `never import @prisma/client` |
| `docs/notifications.md:84` | `Prisma + migration` |
| `docs/requirements-audit-report.md` | 7 references: lines 96, 273, 299, 300, 437, 483, 484 |

The project uses **Drizzle ORM**, not Prisma.

**Impact:** Developers new to the project see Prisma references and waste time looking for non-existent packages. Documentation drift undermines trust.

**Action Plan:**
1. Replace all `@prisma/client` references with `drizzle-orm` in docs
2. Replace `Prisma + migration` with `Drizzle + migration`
3. Update `docs/requirements-audit-report.md` to remove resolved Prisma-related issues

**Estimated effort:** Small (30 minutes)

---

## Dependencies

- H14 sanitization can use existing regex-based approach immediately; `sanitize-html` package is optional enhancement
- H6 types depend on `@brewform/shared/types` having correct definitions
- H15 debounce is independent; pagination fix requires API client change
- M12, M13, M15 are quick standalone fixes
