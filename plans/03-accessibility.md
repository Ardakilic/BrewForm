# Plan 03: Accessibility Quick Wins

**Priority:** 3
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 3
**Issues:** H3 (Skip Link), H4 (Dynamic lang), H8 (Form Labels), L12 (Semantic HTML), L3 (focus-visible)
**Effort:** ~3–4 hours
**Impact:** ♿ WCAG compliance (2.4.1, 3.1.1, 3.3.2, 4.1.2)

---

## H3 — No Skip Navigation Link ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/layout/Layout.tsx:6-17`](apps/web/src/components/layout/Layout.tsx) — Renders `<Navbar />`, `<main>`, `<Footer />`, `<CookieConsent />`. No skip link element.
- [`apps/web/src/components/layout/Layout.tsx:10`](apps/web/src/components/layout/Layout.tsx) — `<main className='flex-1'>` has no `id` attribute a skip link could target.
- Search for `skip-to-content`, `skipLink`, `skip.link` — **zero results** across entire codebase.

**Impact:** WCAG 2.4.1 (Bypass Blocks) violation. Keyboard users must tab through the entire navbar on every page load.

**Action Plan:**
- [ ] 1. Add to `apps/web/src/components/layout/Layout.tsx` as first focusable element:
   ```tsx
   <a
     href='#main-content'
     className='sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--accent-primary)] focus:text-white focus:rounded focus:outline-none'
   >
     {t('a11y.skipToContent')}
   </a>
   ```
- [ ] 2. Add `id="main-content"` and `tabIndex={-1}` to `<main>` in Layout.tsx
- [ ] 3. Add i18n key `a11y.skipToContent`: `"Skip to main content"` / `"Ana içeriğe geç"` in `packages/shared/src/i18n/en.json` and `tr.json`

**Estimated effort:** Small (30 minutes)

---

## H4 — lang Attribute Hardcoded ✅ CONFIRMED

**Evidence:**
- [`apps/web/index.html:2`](apps/web/index.html) — `<html lang="en" class="light">` hardcoded.
- Search for `documentElement.lang` across `apps/web/src/` — **zero matches**. Never set dynamically.
- I18nContext exists at [`apps/web/src/contexts/I18nContext.tsx`](apps/web/src/contexts/I18nContext.tsx) with `locale` state but doesn't sync to DOM.

**Impact:** When user switches to Turkish (`tr`), screen readers still use English pronunciation rules. WCAG 3.1.1 (Language of Page) violation.

**Action Plan:**
- [ ] 1. Add to `I18nContext.tsx` provider effect:
   ```tsx
   useEffect(() => {
     document.documentElement.lang = locale;
   }, [locale]);
   ```
- [ ] 2. Also sync theme: `document.documentElement.className = theme;`

**Estimated effort:** Small (15 minutes)

---

## H8 — Comment Section Form Lacks Proper Labeling ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/components/recipe/CommentSection.tsx:337-343`](apps/web/src/components/recipe/CommentSection.tsx) — Main comment textarea: no `<label>`, no `aria-label`, no `aria-labelledby`. Only `placeholder`.
- [`apps/web/src/components/recipe/CommentSection.tsx:244-254`](apps/web/src/components/recipe/CommentSection.tsx) — Reply textarea: same issue.
- Only **2 `htmlFor` label associations** exist in the entire frontend (LoginPage.tsx:87, Footer.tsx:55).

**Impact:** WCAG SC 3.3.2 (Labels or Instructions) violation. Screen reader users cannot identify what the textareas are for. Placeholder text is not a substitute.

**Action Plan:**
- [ ] 1. Add to main comment textarea:
   ```tsx
   <label htmlFor='new-comment' className='sr-only'>
     {t('comment.writeComment')}
   </label>
   <textarea id='new-comment' placeholder={t('comment.writeComment')} ... />
   ```
- [ ] 2. Same for reply textarea with `htmlFor='reply-comment-{commentId}'`
- [ ] 3. Audit all other `<input>` and `<textarea>` elements for missing labels
- [ ] 4. Add `aria-label` as fallback where `<label>` is impractical

**Estimated effort:** Small (1-2 hours)

---

## L12 — Missing Semantic HTML5 Landmark Elements ✅ CONFIRMED

**Evidence:**
- Search for `<article` in `apps/web/src/` — **zero results**.
- `<section>` elements: 9 instances across 6 files.
- [`apps/web/src/components/layout/Layout.tsx:10`](apps/web/src/components/layout/Layout.tsx) — `<main>` has no `id` attribute.
- Recipe cards, comment threads, content blocks all use `<div>` instead of `<article>`.

**Impact:** Screen readers cannot navigate page structure by landmark regions. WCAG 4.1.2 (Name, Role, Value) support is weak.

**Action Plan:**
- [ ] 1. Add `id="main-content"` to `<main>` (required for H3 skip link)
- [ ] 2. Wrap recipe detail content in `<article>`
- [ ] 3. Wrap individual comments in `<article>` with `aria-label` for threading context
- [ ] 4. Use `<section>` with `aria-labelledby` for recipe sub-sections (ingredients, equipment, steps)

**Estimated effort:** Small (1 hour)

---

## L3 — :focus vs :focus-visible Inconsistency ✅ CONFIRMED

**Evidence:**
- [`apps/web/src/styles/globals.css:144-148`](apps/web/src/styles/globals.css) — `.input-field:focus` uses `:focus` not `:focus-visible`.

**Impact:** Focus ring appears on mouse clicks (unnecessary visual noise). Keyboard users get the same ring but it's not optimized for their needs.

**Context7 Note (Tailwind v4):** Tailwind provides `focus-visible:` variant. Use `focus-visible:outline-2` etc. for keyboard-only outline styles.

**Action Plan:**
- [ ] 1. Change to:
   ```css
   .input-field:focus-visible {
     outline: none;
     border-color: var(--accent-primary);
     box-shadow: 0 0 0 3px rgba(111, 78, 55, 0.1);
   }
   ```
- [ ] 2. Add basic `:focus` outline for all interactive elements as fallback

**Estimated effort:** Small (5 minutes)

---

## Dependencies

- H3 skip link + H4 lang attribute are independent
- H8 form labels can be done alongside broader form audit
- L12 semantic HTML pairs with H3 (same `main-content` id)
- L3 is a standalone CSS change
