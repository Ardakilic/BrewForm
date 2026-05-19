# Plan 03: Accessibility Quick Wins

**Priority:** 3
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 3
**Issues:** H3 (Skip Link), H4 (Dynamic lang), H8 (Form Labels), L12 (Semantic HTML), L3 (focus-visible)
**Effort:** ~3–4 hours
**Impact:** ♿ WCAG compliance (2.4.1, 3.1.1, 3.3.2, 4.1.2)

---

## H3 — No Skip Navigation Link

**Background:** Keyboard users must tab through entire navbar on every page load. WCAG 2.4.1 violation.

### Tasks
1. Add skip link as first focusable element in `apps/web/src/components/layout/Layout.tsx`:
   ```tsx
   <a href='#main-content' className='sr-only focus:not-sr-only ...'>
     {t('a11y.skipToContent')}
   </a>
   ```
2. Add `id="main-content"` and `tabIndex={-1}` to `<main>` element
3. Add i18n key `a11y.skipToContent`: `"Skip to main content"` / `"Ana içeriğe geç"`

---

## H4 — lang Attribute Hardcoded

**Background:** `<html lang="en">` never updates when locale changes. WCAG 3.1.1 violation.

### Tasks
1. Add `useEffect` in `I18nContext.tsx` to sync `document.documentElement.lang` with `locale`
2. Also sync `document.documentElement.className` with theme

---

## H8 — Comment Section Form Lacks Proper Labeling

**Background:** Both comment and reply textareas have no `<label>`, `aria-label`, or `aria-labelledby`. WCAG 3.3.2 violation.

### Tasks
1. Add visually-hidden `<label htmlFor='new-comment'>` for main comment textarea
2. Add `<label htmlFor='reply-comment-{commentId}'>` for reply textarea
3. Audit all other `<input>` and `<textarea>` elements for missing labels
4. Add `aria-label` as fallback where `<label>` is impractical

---

## L12 — Missing Semantic HTML5 Landmark Elements

**Background:** No `<article>` elements, missing `<section>` with `aria-labelledby`, `<main>` has no `id`.

### Tasks
1. Add `id="main-content"` to `<main>` (required for H3 skip link)
2. Wrap recipe detail content in `<article>`
3. Wrap individual comments in `<article>` with `aria-label`
4. Use `<section>` with `aria-labelledby` for recipe sub-sections

---

## L3 — :focus vs :focus-visible Inconsistency

**Background:** `.input-field:focus` applies focus ring on all focus (including mouse clicks).

### Tasks
1. Change to `.input-field:focus-visible` for keyboard-only focus ring
2. Add basic `:focus` outline fallback for all interactive elements

---

## Dependencies

- H3 skip link + H4 lang attribute are independent
- H8 form labels can be done alongside broader form audit
- L12 semantic HTML pairs with H3 (same `main-content` id)
- L3 is a standalone CSS change
