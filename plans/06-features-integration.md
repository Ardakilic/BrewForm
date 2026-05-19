# Plan 06: Features & Integration

**Priority:** 6
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 6
**Issues:** H10 (Style Consistency), H5 (PWA Manifest), L4 (Favicons), M2 (Version Photos), M9 (Contact Form), M6 (Extraction Yield), M16 (README Claims)
**Effort:** ~16–22 hours
**Impact:** 🎨 Consistency, 📱 Install support, 🖼️ Brand, 📸 Version history, 📧 Support

---

## H10 — Inconsistent Tailwind vs Inline Style Patterns

**Background:** 578 `style={{}}` instances coexist with Tailwind v4 arbitrary value syntax `[color:var(...)]` — defeats Tailwind's utility model.

### Tasks
1. Convert `style={{ color: 'var(--text-secondary)' }}` → `className='text-[var(--text-secondary)]'`
2. Convert `style={{ backgroundColor: 'var(--bg-secondary)' }}` → `className='bg-[var(--bg-secondary)]'`
3. Convert `style={{ borderColor: 'var(--border-primary)' }}` → `className='border-[var(--border-primary)]'`
4. Start with worst offenders: RecipeDetailPage, CommentSection, admin pages
5. Define reusable utility classes for repeated patterns

---

## H5 — Missing PWA Manifest (No Install Support)

**Background:** No `manifest.json`, no install prompt, no offline support.

### Tasks
1. Create `apps/web/public/manifest.json` with name, icons, theme color
2. Add `<link rel="manifest">` to `index.html`
3. Add `<meta name="theme-color">` and `<link rel="apple-touch-icon">`
4. Generate icon files: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`

---

## L4 — Missing Favicon Files

**Background:** `index.html` references `/favicon.svg` but file doesn't exist — zero favicon files in `public/`.

### Tasks
1. Create SVG favicon (coffee cup icon)
2. Generate `favicon.ico` (multi-size ICO)
3. Generate `apple-touch-icon.png` (180x180)
4. Generate `icon-192.png` and `icon-512.png` (shared with H5)
5. Place all in `apps/web/public/`

---

## M2 — Recipe Photos Never Populated to Version Junction

**Background:** `createVersion()` never inserts into `recipeVersionPhotos` — version history has no photo linkage for non-forked recipes.

### Tasks
1. In `createVersion()` (model.ts), after inserting version, insert rows into `recipeVersionPhotos` for each photoId
2. Update photo upload flow to associate photos with current version, not just recipe

---

## M9 — No Contact Form or Feedback Mechanism

**Background:** No `/contact`, `/feedback`, or `/support` route. Privacy page mentions contact but provides no form.

### Tasks
1. Create `apps/web/src/pages/ContactPage.tsx` with name, email, subject, message form
2. Create `POST /api/v1/contact` endpoint that emails admin
3. Add `/contact` route and link in Footer
4. Add rate limiting to prevent spam

---

## M6 — extractionYield Computed But Not Stored

**Background:** Extraction yield (TDS × brew ratio) — a key coffee metric — never computed or displayed.

### Tasks
1. Add `extractionYield` to `packages/shared/src/utils/metrics.ts`: `(tds * extractionVolumeMl) / groundWeightGrams`
2. Add as 6th stat card in `stat-cards.ts` and `StatCards.tsx`

---

## M16 — README Feature Claims Don't Match Implementation

**Background:** Three README claims are not implemented: unit conversion, version history UI, brew method compatibility validation.

### Tasks
1. **Option A:** Implement the missing features:
   - Unit conversion: metric ↔ imperial in recipe display
   - Version history: `/recipes/:slug/versions` page
   - Compatibility validation: wire `brewMethodEquipmentRules` into recipe service
2. **Option B:** Update README to reflect actual state

---

## Dependencies

- H10 style migration is pure CSS — can be done incrementally
- H5 + L4 share icon generation workflow
- M2 requires understanding the recipe version model
- M6 is a small math utility addition
- M16 is documentation-driven; Option A or B are mutually exclusive
