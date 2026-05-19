# Plan 06: Features & Integration

**Priority:** 6
**Source:** [Deep Dive Analysis](deep-dive-analysis.md) — Phase 6
**Issues:** H10 (Style Consistency), H5 (PWA Manifest), L4 (Favicons), M2 (Version Photos), M9 (Contact Form), M6 (Extraction Yield), M16 (README Claims)
**Effort:** ~16–22 hours
**Impact:** 🎨 Consistency, 📱 Install support, 🖼️ Brand, 📸 Version history, 📧 Support

---

## H10 — Inconsistent Tailwind vs Inline Style Patterns ✅ CONFIRMED

**Evidence:**
- **578 `style={{}}` instances** across the frontend
- [`apps/web/src/pages/recipes/RecipeDetailPage.tsx`](apps/web/src/pages/recipes/RecipeDetailPage.tsx) — 12 inline style instances
- [`apps/web/src/components/recipe/CommentSection.tsx`](apps/web/src/components/recipe/CommentSection.tsx) — 13 inline style instances
- **85 `className='[color:var(...)]'`** Tailwind v4 arbitrary syntax usages in Navbar.tsx, TasteNotesFilter.tsx, Footer.tsx, LanguageSelector.tsx — showing the CORRECT Tailwind v4 pattern
- **But RecipeDetailPage and CommentSection use ZERO** `[color:var(...)]` syntax — pure inline `style={{}}`

**Impact:** Two styling systems coexist: Tailwind utility classes + inline CSS variable styles. Defeats Tailwind's utility model. Makes consistent theming difficult.

**Context7 Note (Tailwind v4):** Use `text-[var(--text-secondary)]`, `bg-[var(--bg-primary)]` syntax for CSS custom properties — preferred over inline `style={{}}`. CSS-first configuration via `@theme {}` block.

**Action Plan:**
1. Convert `style={{ color: 'var(--text-secondary)' }}` → `className='text-[var(--text-secondary)]'`
2. Convert `style={{ backgroundColor: 'var(--bg-secondary)' }}` → `className='bg-[var(--bg-secondary)]'`
3. Convert `style={{ borderColor: 'var(--border-primary)' }}` → `className='border-[var(--border-primary)]'`
4. Start with worst offenders: RecipeDetailPage, CommentSection, admin pages
5. During migration, use Tailwind's arbitrary value syntax for one-off colors, define reusable utility classes for repeated patterns

**Estimated effort:** Medium (4-6 hours across all components)

---

## H5 — Missing PWA Manifest (No Install Support) ✅ CONFIRMED

**Evidence:**
- [`apps/web/public/manifest.json`](apps/web/public/) — does not exist.
- [`apps/web/index.html`](apps/web/index.html) — no `<link rel="manifest">` tag.

**Impact:** Users cannot install BrewForm to home screen as a PWA. No offline support, no splash screen, no standalone display mode.

**Action Plan:**
1. Create `apps/web/public/manifest.json`:
   ```json
   {
     "name": "BrewForm — Coffee Brewing Recipes",
     "short_name": "BrewForm",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#faf6f1",
     "theme_color": "#6f4e37",
     "icons": [
       { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```
2. Add to `index.html` `<head>`:
   ```html
   <link rel="manifest" href="/manifest.json" />
   <meta name="theme-color" content="#6f4e37" />
   <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
   ```
3. Generate icon files (shared with L4)

**Estimated effort:** Small (1 hour + icon design)

---

## L4 — Missing Favicon Files (Even SVG Doesn't Exist!) ⚠️ PARTIAL — WORSE THAN CLAIMED

**Evidence:**
- [`apps/web/public/`](apps/web/public/) — Contains only `_redirects` and `404.html`. **No favicon files at all.**
- [`apps/web/index.html:7`](apps/web/index.html) — `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` — references a non-existent file.
- Search for `**/favicon*` across entire monorepo — **zero results**.

**Impact:** Browser shows generic icon in tabs, bookmarks, and history. No brand presence.

**Action Plan:**
1. Create SVG favicon (coffee cup icon)
2. Generate `favicon.ico` (multi-size ICO file)
3. Generate `apple-touch-icon.png` (180x180)
4. Generate `icon-192.png` and `icon-512.png` (shared with H5)
5. Place all in `apps/web/public/`

**Estimated effort:** Small (1 hour + design)

---

## M2 — Recipe Photos Never Populated to Version Junction ✅ CONFIRMED

**Evidence:**
- [`apps/api/src/modules/recipe/model.ts:7`](apps/api/src/modules/recipe/model.ts) — `recipeVersionPhotos` imported from schema.
- [`apps/api/src/modules/recipe/model.ts:188-198`](apps/api/src/modules/recipe/model.ts) — Only used inside `forkRecipe` to copy source version photos to forked version.
- [`apps/api/src/modules/recipe/model.ts:100-103`](apps/api/src/modules/recipe/model.ts) — `createVersion` inserts into `recipeVersions` only — **never inserts into `recipeVersionPhotos`**.

**Impact:** Version history exists but has no photo linkage for non-forked recipes. When a user updates a recipe with new photos, those photos are only linked to the recipe, not the specific version.

**Action Plan:**
1. In `createVersion()` (model.ts), after inserting the version, insert rows into `recipeVersionPhotos` for each photoId associated with the recipe
2. Update the photo upload flow to associate photos with the current version, not just the recipe

**Estimated effort:** Small (1-2 hours)

---

## M9 — No Contact Form or Feedback Mechanism ✅ CONFIRMED

**Evidence:**
- Search for `contact`, `feedback`, `support` in `apps/web/src/pages/` — only `PrivacyPage.tsx:56`: "For privacy questions, please contact us through the platform." No actual contact form.
- [`apps/web/src/router.tsx`](apps/web/src/router.tsx) — No `/contact`, `/feedback`, or `/support` route.

**Impact:** Users have no channel to report bugs, request features, or ask questions. Support burden shifts to social media or email guesswork.

**Action Plan:**
1. Create `apps/web/src/pages/ContactPage.tsx` with a simple form (name, email, subject, message)
2. Create `POST /api/v1/contact` endpoint that sends the message via email to admin
3. Add `/contact` route and link in Footer
4. Add rate limiting to prevent spam (reuse `authRateLimitMiddleware` — see M12 in Plan 04)

**Estimated effort:** Small (1-2 hours)

---

## M6 — extractionYield Computed But Not Stored ✅ CONFIRMED

**Evidence:**
- Search for `extractionYield` in `apps/api/src/` — **zero results**.
- Search for `extractionYield` in `packages/shared/src/` — **zero results**.
- [`apps/web/src/utils/stat-cards.ts:20-63`](apps/web/src/utils/stat-cards.ts) — Returns exactly 5 stat cards (dose, yield, time, ratio, temp). No extraction yield.
- [`apps/web/src/components/recipe/StatCards.tsx:14-62`](apps/web/src/components/recipe/StatCards.tsx) — Renders same 5 cards.

**Impact:** Extraction yield is a key coffee metric (TDS × brew ratio). Not computed or displayed. Serious omission for coffee enthusiasts.

**Action Plan:**
1. Add `extractionYield` to `packages/shared/src/utils/metrics.ts`: `extractionYield = (tds * extractionVolumeMl) / groundWeightGrams`
2. Add as 6th stat card in `stat-cards.ts` (or replace ratio card — yield is more informative)
3. Compute on-the-fly in `StatCards.tsx` from `tds`, `extractionVolumeMl`, `groundWeightGrams`

**Estimated effort:** Small (1 hour)

---

## M16 — README Feature Claims Don't Match Implementation ✅ CONFIRMED

**Evidence — Three mismatches:**

**Claim 1 (README:18):** "Canonical Units — All data stored in metric; UI converts to user preferences"
- SettingsPage has `unitSystem: 'metric' | 'imperial'` but **zero components** consume it. StatCards hardcodes `°C`, `g`, `ml`, `s`.

**Claim 2 (README:19):** "Version Control — Each recipe edit creates an immutable snapshot; full history browsable"
- **No version history browsing UI** exists. Only `versionNumber` shown inline in RecipeDetailPage.

**Claim 3 (README:11-12):** "Brew Method Compatibility — Data-driven validation ensures brew methods and equipment are compatible"
- `brewMethodEquipmentRules` table exists but is **only used in admin CRUD**. **Zero runtime validation** during recipe creation/editing.

**Impact:** README misleads users and potential contributors about the product's capabilities. Trust erosion when claims don't match reality.

**Action Plan:**
1. **Option A:** Implement the missing features:
   - Unit conversion: Add utility to convert metric ↔ imperial in recipe display components
   - Version history: Create a `/recipes/:slug/versions` page showing version timeline
   - Compatibility validation: Wire `brewMethodEquipmentRules` into `recipe/service.ts` create/update
2. **Option B:** Update README to reflect actual state

**Estimated effort:** Medium (6-8 hours for all three features)

---

## Dependencies

- H10 style migration is pure CSS — can be done incrementally
- H5 + L4 share icon generation workflow
- M2 requires understanding the recipe version model
- M6 is a small math utility addition
- M16 is documentation-driven; Option A or B are mutually exclusive
