Now let me fetch the actual codebase from GitHub.This is very revealing. Let me dig into the key source files to verify the actual tech stack.Let me fetch the key source files mentioned in the plan.Now I have enough to write a comprehensive analysis. Let me compile the findings.Here's the full analysis. Summary of what I found:

---

### 🔴 Two Critical / Schema Issues

**1. Relative `og:image` URLs in `index.html` (C1, Step 3)**
The static fallback tags use `/og-default.png` — a relative path. Both the OG protocol and Twitter Cards require **absolute URLs** for images, since social crawlers fetch them from their own servers. This would silently break image previews for the homepage and all non-recipe pages. Fix: `https://brewform.cc/og-default.png`.

**2. `cookingMethod` field misuse in JSON-LD (M1)**
The plan sets `cookingMethod: 'Brewed at 93°C'` — but schema.org's `Recipe.cookingMethod` expects a **technique category** (e.g., "Baking", "Frying"), not a temperature sentence. Google's validator will flag this, risking Rich Results eligibility. Temperature belongs in `recipeInstructions` steps.

---

### 🟡 Three Significant Issues

**3. `extractionVolumeMl` double-counted** — used as both `recipeYield` (output volume, correct) and `recipeIngredient` "ml water" (wrong — extraction yield ≠ input water). Needs a separate water volume field.

**4. Missing `isNull(recipes.deletedAt)` in sitemap query** — the plan flags it as a note but doesn't include it. Without it, a delete-handler bug could leak soft-deleted recipes into the sitemap.

**5. `cookTime === totalTime`** — sets total recipe time to just the extraction seconds, ignoring prep (grinding, heating). Better to omit `totalTime` unless a `prepTimeSeconds` field is available.

---

### ✅ Everything Else is Sound

The crawler middleware architecture, `deps` testability pattern, Hono middleware registration order, robots.txt disallow paths, sitemap Hono sub-app mounting, `BreadcrumbList` schema, and Deno/Vitest test split are all correct.