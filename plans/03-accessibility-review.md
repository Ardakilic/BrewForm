# Plan 03 — Accessibility Review

**Verdict:** Mostly correct and well-researched. Four issues found — one critical regression bug, one semantic labelling error, one line-number mismatch, and one theming edge case. All other sections are accurate.

---

## Overall Assessment

The plan correctly identifies all six accessibility gaps, the WCAG criteria each one violates, and the general approach for fixing them. The custom i18n system (`I18nContext.tsx`) is accurately characterised — despite the README claiming `react-i18next`, the actual codebase uses a custom `@brewform/shared/i18n` lookup, and the plan correctly targets that. The `t()` function's `.replace('{name}', ...)` workaround is also correct given that the simple lookup has no built-in interpolation. React Router v7's `<Outlet>` and the `tabIndex={-1}` pattern are used appropriately.

---

## ❌ Issue 1 — CRITICAL: `<EmailVerificationBanner>` Dropped in Layout.tsx Replacement (H3)

**Severity:** Regression / Blocker

The plan proposes a full replacement of `Layout.tsx` to add the skip link. The replacement code is:

```tsx
<div className='flex min-h-screen flex-col'>
  <a href='#main-content' ...>{t('a11y.skipToContent')}</a>
  <Navbar />
  <main id='main-content' className='flex-1' tabIndex={-1}>
    <Outlet />
  </main>
  <Footer />
  <CookieConsent />
</div>
```

The **actual** `Layout.tsx` renders `<EmailVerificationBanner />` as the first child, before `<Navbar />`:

```tsx
// apps/web/src/components/layout/Layout.tsx (current)
export function Layout() {
  return (
    <div className='flex min-h-screen flex-col'>
      <EmailVerificationBanner />   // ← missing from the plan's replacement
      <Navbar />
      <main className='flex-1'>
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
```

Applying the plan as written would silently remove the email verification banner from every page. The corrected replacement must preserve it:

```tsx
import { EmailVerificationBanner } from '../EmailVerificationBanner';
import { useTranslation } from '../../contexts/I18nContext';
// ...

export function Layout() {
  const { t } = useTranslation();
  return (
    <div className='flex min-h-screen flex-col'>
      <a
        href='#main-content'
        className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg'
        style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--bg-primary)' }}
      >
        {t('a11y.skipToContent')}
      </a>
      <EmailVerificationBanner />   {/* ← must be kept */}
      <Navbar />
      <main id='main-content' className='flex-1' tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}
```

The skip link must still be the **first focusable element** in the DOM (before both the banner and the navbar), which the corrected version above preserves.

---

## ❌ Issue 2 — MODERATE: `aria-label` on Top-Level Comment `<article>` Uses Wrong i18n Key (H8)

**Severity:** Semantic / Accessibility defect

In the proposed `renderComment`, the `aria-label` for **both** the top-level comment article and the nested reply article uses the same key:

```tsx
// top-level comment
<article aria-label={`${t('comment.reply')} ${getAuthorName(comment)}`}>

// nested reply (inner loop)
<article aria-label={`${t('comment.reply')} ${getAuthorName(reply)}`}>
```

`t('comment.reply')` translates to `"Reply"`. This makes the screen-reader label for a regular comment **"Reply [AuthorName]"**, which is incorrect — the item is a comment, not a reply. A VoiceOver/NVDA user navigating by article landmark would hear "Reply Alice" for a top-level comment, which is misleading.

The reply article label is fine since that element is genuinely a reply. The top-level comment needs a distinct key.

**Fix — add one new i18n key:**

`packages/shared/src/i18n/en.json`:
```json
"comment.commentBy": "Comment by"
```

`packages/shared/src/i18n/tr.json`:
```json
"comment.commentBy": "Yorum yazan"
```

**Fix — update the top-level article label in `renderComment`:**

```tsx
// top-level comment — use the new key
<article
  aria-label={`${t('comment.commentBy')} ${getAuthorName(comment)}`}
  ...
>

// nested reply — this is correct as-is
<article
  aria-label={`${t('comment.reply')} ${getAuthorName(reply)}`}
  ...
>
```

---

## ❌ Issue 3 — MINOR: Line Numbers for RecipeDetailPage Are Off (L12)

**Severity:** Low (causes confusion, not a code error)

The plan states:

> **Before (line 92):** `<div>` → change to `<article aria-label={recipe.title}>`  
> **Before (line 348):** `</div>` → change to `</article>`

The actual file has three separate `return` statements (loading, error, and main). The loading return is at line 78, the error return at line 89, and the **main content return** — the one that needs the `<article>` change — begins at line 108 with `return (`, and the opening `<div>` is line 109. The closing `</div>` for that outermost div is at line **383**, not 348.

No code is wrong; the developer just needs to target line 109 and line 383 rather than 92 and 348. The plan's grep evidence ("zero `<article>` results") and the intent are correct.

---

## ❌ Issue 4 — MINOR: Focus Box-Shadow Uses Hardcoded Light-Theme RGBA (L3)

**Severity:** Cosmetic / Theming

The proposed focus styles for `.btn-primary` and `.btn-secondary` hardcode the light-theme value for `--accent-primary` (`#6f4e37`):

```css
.btn-primary:focus-visible {
  box-shadow: 0 0 0 3px rgba(111, 78, 55, 0.3);   /* hardcoded */
}
.btn-secondary:focus-visible {
  box-shadow: 0 0 0 3px rgba(111, 78, 55, 0.15);  /* hardcoded */
}
```

In dark and coffee themes, `--accent-primary` changes to `#c9a96e`. The focus ring would remain brown/dark instead of matching the active accent colour, producing low contrast in those themes.

The project is already on Tailwind v4 which has full modern CSS support. A cleaner approach uses `color-mix()` to derive the alpha variant from the existing CSS variable:

```css
.btn-primary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 30%, transparent);
}
.btn-secondary:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 15%, transparent);
}
```

`color-mix()` is supported in all evergreen browsers (Chrome 111+, Firefox 113+, Safari 16.2+) and requires no polyfill in a modern SPA. The 2px accent-coloured global `:focus-visible` outline already uses `var(--accent-primary)` correctly; this brings the button shadows in line with that.

---

## ✅ Confirmed Correct Sections

**H4 — lang Attribute Sync**  
The `useEffect` syncing `document.documentElement.lang` and `.dir` is correct. The `LOCALE_DIR` record is a good forward-compatible pattern. The custom `I18nContext.tsx` structure matches the actual source exactly; the plan correctly avoids react-i18next (the README description is outdated).

**H3 — Skip Link Implementation (code itself)**  
The `sr-only focus:not-sr-only` Tailwind pattern is the canonical skip-link approach. `tabIndex={-1}` on `<main>` is required to allow `.focus()` to land on a non-interactive element in some browser/SR combinations. The `href='#main-content'` + `id='main-content'` pairing is correct. The inline `style` for theming via CSS variables is correct given that arbitrary Tailwind classes can't reference custom vars without configuration.

**H8 — Form Labels, aria-live, Section Wrapper**  
The `<label htmlFor>` + matching `id` pattern on both textareas is correct. Using a single top-level `aria-live='polite'` region (instead of per-form regions) is the right approach — multiple concurrent live regions cause screen-reader race conditions. The `<section aria-label={t('recipe.comments')}>` wrapper is valid; `recipe.comments` already exists in both `en.json` (line 46: `"Comments"`) and `tr.json` (line 46: `"Yorumlar"`), so no additional key is needed there.

**L3 — focus-visible CSS**  
Moving `.input-field` from `:focus` to `:focus-visible` is correct. Placing the global `:focus-visible` rule inside `@layer base` after the component-specific overrides is correct ordering — more specific selectors (`.btn-primary:focus-visible`) override the global `:focus-visible` rule as expected.

**N3 — Avatar alt Text**  
The `${profile.displayName || profile.username}'s avatar` fallback is correct. Using `.replace('{name}', ...)` for i18n interpolation is the right workaround given the `t()` function's simple key lookup. The note that `AdminUserDetailPage.tsx` does not currently import `useTranslation` is accurate.

---

## Summary of Required Corrections

| Issue | Severity | Section | Fix Required |
|-------|----------|---------|-------------|
| `<EmailVerificationBanner>` omitted from Layout.tsx replacement | **Critical** | H3 | Add it back before `<Navbar />` in the replacement code |
| `aria-label` on top-level comment uses `comment.reply` ("Reply") key | **Moderate** | H8 | Add `comment.commentBy` key; use it for top-level article labels |
| RecipeDetailPage line numbers off (92/348 → actual 109/383) | Minor | L12 | Correct the line-number references in the plan |
| Focus box-shadow hardcodes light-theme RGBA value | Minor | L3 | Replace with `color-mix(in srgb, var(--accent-primary) 30%, transparent)` |

---

## Revised i18n Key Summary

One key needs to be added to what the plan already lists:

`packages/shared/src/i18n/en.json`:
```json
"comment.commentBy": "Comment by"
```

`packages/shared/src/i18n/tr.json`:
```json
"comment.commentBy": "Yorum yazan"
```

All other keys in the plan's summary table are correct and complete.
