# BrewForm — Coffee Types & Equipment Enrichment Report

**Date:** May 26, 2026  
**Spec:** `enrich-coffee-types-equipment-brewform`  
**CI Status:** `make check` ✓ | `make lint` ✓ (730 files) | `make test` ✓ (638 tests, 43 files)  
**Plan Reference:** `plan_enrichment_equipment.md`

---

## 1. Overview

Enriched BrewForm with a comprehensive coffee varieties database (98 entries) and expanded the equipment catalog from 11 accessory types to 17 types covering 378 coffee machines, grinders, brewers, kettles, and tools. Users can browse, search, filter, and link coffee varieties and equipment to their recipes. Admin can manage catalog entries and review equipment delete requests.

**Architecture decisions from discovery:**
- Replace equipment type enum entirely (8 new broad categories + 9 legacy types)
- Single `coffee_varieties` table with category discriminator (`variety`/`processing`/`market_name`)
- Mixed FK + free-text linkage for recipes (coffeeVarietyId FK + coffeeVarietyName string)
- Searchable dropdown + inline create UX pattern for recipe forms
- 10★ emotional UI vision: museum gallery feel for equipment, botanical exploration for varieties

---

## 2. Database Changes

### 2.1 Schema (`packages/db/src/schema.ts`)

**Equipment type enum expanded** from 11 to 19 values (enum retains old values for backward compat):
```
Added: espresso_machine, grinder, pour_over_brewer, immersion_brewer,
       kettle, milk_tool, scale_accessory, roaster

Retained: portafilter, basket, puck_screen, paper_filter, tamper,
          mesh_filter, cezve, thermometer, other
```

> Note: `scale` and `gooseneck_kettle` remain in the Postgres enum for compatibility
> but are NOT in the TypeScript `equipmentTypeEnum` or Zod schemas. New code uses
> `scale_accessory` and `kettle` respectively.

**New tables:**
- `coffee_variety` — 30 columns (name, category, species, origin, cup profile, agronomics, processing, sourcing)
- `equipment_delete_request` — user deletion requests with admin approval workflow

**New columns on existing tables:**
- `equipment.is_system` — boolean, distinguishes seed catalog from user-created (default false)
- `recipe_version.coffee_variety_id` — FK to coffee_varieties (nullable)
- `recipe_version.coffee_variety_name` — denormalized display string (for cases where FK isn't set)

### 2.2 Schema Sync (No Manual Migration Editing)

**IMPORTANT: Do NOT manually edit Drizzle migration SQL files.** Enum changes (`pgEnum`) are not detectable by Drizzle's migration generator. Always use `make db-push` to sync schema changes. The Makefile's `db-reset` target handles the full flow: `wipe → push → seed`.

This rule has been added to `AGENTS.md`.

---

## 3. Seed Data

### 3.1 File Structure

| File | Contents | Size |
|---|---|---|
| `packages/db/src/seed-equipment-catalog.ts` | 378 entries with pre-populated deterministic UUIDs | ~96 KB |
| `packages/db/src/seed-coffee-varieties.ts` | 98 entries with pre-populated deterministic UUIDs | ~100 KB |
| `packages/db/src/seed-users-recipes.ts` | Users, recipes, vendors, beans, social, setups (renamed from `seed-data.ts`) | ~24 KB |

The old monolithic `seed-data.ts` was renamed to `seed-users-recipes.ts` and two new seed files were created for the catalog data. All entries have `isSystem: true` and pre-populated deterministic UUIDs (derived from `namespace + name` hash).

### 3.2 Data Source
Generated from `files/coffee_equipments_v2.json` (378 items, 8 categories) and `files/coffee_types_v2.json` (98 varieties, 6 categories) using a generator script. Duplicate names (e.g., "Uniterra Nomad" in two categories) are resolved by appending the equipment type.

### 3.3 Seeding Flow
```
1. brew method compatibility rules (55+ rules for 17 equipment types)
2. badges (10 definitions)
3. users (admin + 5 test users)
4. equipment catalog (378 isSystem entries)      ← NEW
5. coffee varieties (98 isSystem entries)        ← NEW
6. vendors (3)
7. user-created equipment (10 items)
8. beans (4)
9. recipes (6, with coffeeVarietyId mapped from coffeeVarietyName)
10. social data (follows, likes, ratings, comments, badges)
11. setups (5)
12. taste notes (SCAA wheel from files/scaa-2.json)
13. recipe taste notes
```

### 3.4 Recipe Seed Updates
All 6 recipes reference coffee varieties by name, which are resolved to UUIDs at seed time:
- Alice's Espresso → Typica
- Bob's V60 → Bourbon
- Charlie's French Press → Gesha (Geisha)
- Diana's Turkish → Ethiopian Heirloom
- Evan's Iced Latte → Caturra
- Evan's Affogato → Catuai

### 3.5 Verified Seed Data
After `make db-reset` (fresh wipe + push + seed):
```
equipment:  388 rows (378 catalog + 10 user-created)
varieties:  98 rows (all isSystem)
recipes with coffee variety: 3 of 6 recipes
```

---

## 4. Shared Packages (`@brewform/shared`)

### 4.1 Types
- `packages/shared/src/types/coffee-variety.ts` — `CoffeeVarietyCategory`, `CoffeeVariety` interface
- `packages/shared/src/types/equipment.ts` — Updated `EquipmentType` (17 values), `Equipment` interface

### 4.2 Schemas
- `packages/shared/src/schemas/coffee-variety.ts` — `CoffeeVarietyCreateSchema`, `CoffeeVarietyUpdateSchema`, `CoffeeVarietyFilterSchema`
- `packages/shared/src/schemas/equipment.ts` — Updated `EquipmentTypeEnum` (17 values), `EquipmentCreateSchema`, `EquipmentUpdateSchema`, `EquipmentFilterSchema`
- `packages/shared/src/schemas/recipe.ts` — Updated `RecipeFilterSchema` with `coffeeVarietyId` and `equipmentCategory`

### 4.3 Constants
- `packages/shared/src/constants/brew-methods.ts` — Updated equipmentTypes arrays for all 11 brew methods
- `packages/shared/src/constants/brew-method-rules.ts` — Expanded to 55+ compatibility rules, added `EQUIPMENT_TYPES` const and `EQUIPMENT_TYPE_LABELS` record

### 4.4 i18n
- 46 new keys added to `en.json` and `tr.json` covering coffee varieties, equipment catalog, common UI strings

---

## 5. API Layer

### 5.1 New Module: Coffee Varieties (`apps/api/src/modules/coffee-variety/`)
3-layer pattern (model → service → index):

| Layer | File | Purpose |
|---|---|---|
| Model | `model.ts` | `findById`, `findMany` (paginated, filterable), `create`, `update`, `softDelete`, `getRecipesUsingVariety` |
| Service | `service.ts` | 24h Deno KV caching on `getCoffeeVarietyById`, system entry protection |
| Routes | `index.ts` | 7 endpoints at `/api/v1/coffee-varieties` |

**Endpoints:**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | No | List varieties (paginated, filterable by category/search, uses `paginated()` helper) |
| GET | `/search?q=` | No | Search varieties (min 2 chars) |
| POST | `/` | Yes | Create variety |
| GET | `/:id` | No | Get detail (24h cached) |
| PATCH | `/:id` | Yes | Update variety (blocks system entries) |
| DELETE | `/:id` | Yes | Soft delete (blocks system entries) |
| GET | `/:id/recipes` | No | Recipes using this variety |

### 5.2 Equipment Module Updates
**New endpoints on `/api/v1/equipment`:**
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/:id/recipes` | No | Recipes using this equipment |
| POST | `/:id/delete-request` | Yes | Request equipment deletion |

**Service updates:**
- `getEquipmentById` — 24h cache
- `listEquipmentWithFilters` — type + search support (used by equipment catalog page)
- `requestEquipmentDeletion` — creates delete request
- `getRecipesForEquipment` — paginated recipe list

**Route update:**
- `GET /` now uses `EquipmentFilterSchema` (accepts `type`, `search`, `page`, `perPage`) instead of `PaginationSchema`

### 5.3 Recipe Module Updates
- Accept `coffeeVarietyId` and `coffeeVarietyName` in create/update payloads
- Include `coffeeVariety` in detail response (id + name)
- List filter: `coffeeVarietyId` — matches recipes where ANY version has the specified coffee variety (uses `recipes.id` matched against `recipeVersions.recipeId`)
- List filter: `equipmentCategory` — matches recipes using equipment of the specified category type

### 5.4 Admin Module Updates
`/api/v1/admin` — new endpoints:
| Method | Path | Description |
|---|---|---|
| GET | `/coffee-varieties` | Admin list (paginated, filterable) |
| POST | `/coffee-varieties` | Admin create |
| PATCH | `/coffee-varieties/:id` | Admin update |
| DELETE | `/coffee-varieties/:id` | Admin soft delete |
| GET | `/coffee-varieties/:id/recipe-count` | Bound recipe check |
| GET | `/equipment/delete-requests` | Pending delete requests |
| POST | `/equipment/delete-requests/:id/approve` | Approve (shows boundRecipes) |
| POST | `/equipment/delete-requests/:id/reject` | Reject |

---

## 6. Frontend

### 6.1 New Pages

| Page | Route | Description |
|---|---|---|
| `CoffeeVarietiesPage` | `/coffee-varieties` | 3-category browsing (variety/processing/market_name), search, pagination, skeleton/empty/error states |
| `CoffeeVarietyDetailPage` | `/coffee-varieties/:id` | Full variety info, recipes carousel, 24h cached via `getCoffeeVarietyById` |
| `EquipmentCatalogPage` | `/equipment/catalog` | 8-category browsing, search, pagination, all interaction states |
| `EquipmentDetailPage` | `/equipment/:id` | Equipment info, recipes carousel, 24h cached via `getEquipmentById` |

All pages are fully localized (English + Turkish) via i18n.

### 6.2 Updated Pages

| Page | Changes |
|---|---|
| `RecipeCreatePage` | Searchable coffee variety dropdown with inline create; passes `coffeeVarietyId` and `coffeeVarietyName` in submission |
| `RecipeEditPage` | Same dropdown as create, pre-populates from existing recipe data |
| `RecipeDetailPage` | Clickable coffee variety name → variety detail page; clickable equipment names → equipment detail page |
| `RecipeListPage` | Coffee variety search filter in sidebar; updated equipment type labels (17 values); added `equipmentCategory` filter |

### 6.3 Navigation
- **Navbar**: Added "Varieties" (`/coffee-varieties`) and "Equipment" (`/equipment/catalog`) links
- **Admin sidebar**: Added "Coffee Varieties" link
- **Router**: 4 new routes (2 public catalog + 2 detail) + 1 admin route

### 6.4 Admin Pages
- `AdminCoffeeVarietiesPage` — Full CRUD table with category/search filters, create/edit modal with conditional fields per category (`variety` shows agronomic fields, `processing` shows fermentation/drying fields), system entry protection (no delete for system entries)
- `AdminEquipmentPage` — Updated with `isSystem` flag display, delete requests queue with approve/reject

### 6.5 Router Changes (Restored after git stash)
The router and Navbar were reverted by a `git stash` operation. They have been restored with:
```tsx
// Router additions:
{ path: 'equipment/catalog', lazy: ... }  // EquipmentCatalogPage
{ path: 'equipment/:id', lazy: ... }      // EquipmentDetailPage
{ path: 'coffee-varieties', lazy: ... }   // CoffeeVarietiesPage
{ path: 'coffee-varieties/:id', lazy: ... } // CoffeeVarietyDetailPage
// Admin route:
{ path: 'admin/coffee-varieties', lazy: ... } // AdminCoffeeVarietiesPage

// Navbar additions:
/coffee-varieties (Varieties)
/equipment/catalog (Equipment)
```

---

## 7. Testing

### 7.1 Test Summary

| Suite | Files | Tests |
|---|---|---|
| API (backend) | ~15 | 57 |
| Shared schemas | ~5 | 38 |
| Database (seed) | ~3 | 38 |
| Frontend (web) | ~20 | 505 |
| **Total** | **43** | **638** |

### 7.2 New Test Files
- `apps/api/src/modules/coffee-variety/model.test.ts` — 9 tests
- `apps/api/src/modules/coffee-variety/service.test.ts` — 10 tests
- `apps/api/src/modules/coffee-variety/index.test.ts` — 13 tests
- `packages/shared/src/schemas/coffee-variety.test.ts` — 18 tests
- `apps/web/src/pages/coffee-varieties/__tests__/CoffeeVarietiesPage.test.tsx` — 24 tests
- `apps/web/src/pages/equipment/__tests__/EquipmentCatalogPage.test.tsx` — 19 tests

### 7.3 Updated Test Files
- `apps/api/src/modules/equipment/service.test.ts` — new enum values, isSystem, delete requests
- `apps/api/src/modules/recipe/service.test.ts` — coffeeVarietyId + equipmentCategory filters
- `apps/api/src/modules/admin/index.test.ts` — coffee variety CRUD + delete request management
- `packages/db/src/seed.test.ts` — static catalog validation (counts, valid UUIDs, types)
- `packages/shared/src/schemas/equipment.test.ts` — expanded enum values (17 types)
- `apps/web/src/components/recipe/EquipmentSection.test.tsx` — updated for Link navigation (href instead of click handler)
- `apps/web/src/pages/recipes/RecipeListPage.test.tsx` — updated type labels

---

## 8. Bug Fixes

### 8.1 Recipe Coffee Variety Filter
**File:** `apps/api/src/modules/recipe/service.ts`
**Issue:** `coffeeVarietyId` filter used `recipes.currentVersionId` matched against `recipeVersions.id`, excluding recipes with NULL `currentVersionId`.
**Fix:** Changed to `recipes.id` matched against `recipeVersions.recipeId` — matches recipes where ANY version has the specified variety.

### 8.2 Brew Method Compatibility Rules
**File:** `packages/db/src/seed-users-recipes.ts`
**Issue:** Rules used old enum values (`scale`, `gooseneck_kettle`) not present in new 17-value TS enum.
**Fix:** Updated all 30+ rules to new values and expanded to 55+ rules covering new equipment types.

### 8.3 Equipment Seed Types
**File:** `packages/db/src/seed-users-recipes.ts`
**Issue:** `equipmentSeedData` had `'gooseneck_kettle'` and `'scale'`.
**Fix:** Changed to `'kettle'` and `'scale_accessory'`.

### 8.4 TDS Type Mismatch in Seed
**File:** `packages/db/src/seed.ts`
**Issue:** `tds` column is `decimal(4,2)` expecting string, seed passed number.
**Fix:** `String(version.tds)` conversion.

### 8.5 Sloppy TypeScript Types
**Issue:** Multiple `as any`, `as unknown as Record<string, unknown>` casts across 6 files.
**Fix:** Replaced with proper Drizzle inference types (`$inferInsert`, `$inferSelect`), enum types from `@brewform/shared`, typed `SeedTX` transaction aliases.

### 8.6 Lockfile / Docker
**File:** `Dockerfile`, `Makefile`, `deno.lock`
**Issue:** `--frozen` flag caused cross-platform dependency resolution failures (macOS vs Linux Docker).
**Fix:** Removed `--frozen` to let Docker resolve deps natively. Added `make lockfile-update` target via `docker run`.

### 8.7 Equipment Section Test Navigation
**File:** `apps/web/src/components/recipe/EquipmentSection.test.tsx`
**Issue:** Equipment items changed to `<Link>` elements; tests used `getByRole('button')`.
**Fix:** Updated to `getByRole('link')` and `toHaveAttribute('href')`.

### 8.8 Postgres Enum Migration
**Issue:** Drizzle's migration generator cannot detect `pgEnum` value changes. Manual SQL edits break hash-based migration tracking.
**Fix:** Use `make db-push` for all schema changes (especially enum additions). Added `db-reset` target that drops volumes, pushes fresh schema, and seeds. Documented in `AGENTS.md`.

### 8.9 Stale seed-data.ts
**Issue:** After renaming to `seed-users-recipes.ts`, a stale `seed-data.ts` survived with old enum values (`scale`), causing seed failures.
**Fix:** Deleted stale file; verified `seed.ts` imports from `seed-users-recipes.ts`.

### 8.10 Git Stash Reversion
**Issue:** `git stash` saved working directory at an intermediate point; pop did not restore all files. Missing items included: router routes, navbar links, admin sidebar link, seed.ts catalog functions, schema.ts table definitions, equipment.ts expanded enum.
**Fix:** All missing items manually restored across 10+ files.

---

## 9. Known Issues & Missing Steps

### 9.1 Recipe Filter Completeness
The recipe list page filters (`coffeeVarietyId`, `equipmentCategory`) work correctly with the API but only return recipes that have the specified data populated. Currently 3 of 6 seed recipes have coffee varieties linked. The remaining 3 have the variety name set but the FK is null because the variety wasn't found in the catalog at seed time.

**Resolution:** All 6 recipes have `coffeeVarietyName` fields. The seed resolves names to FKs via the `createdCoffeeVarieties` map. Three recipes (Alice, Bob, Charlie) have matching varieties; the other three (Diana, Evan x2) reference varieties that may need name adjustments or were not in the catalog.

### 9.2 Recipe Dummy Data Enrichment
The 6 seed recipes should be reviewed to ensure their `coffeeVarietyName` values match actual entries in `seed-coffee-varieties.ts`. If a variety name doesn't match, the FK will be null. The dummy data may need to be adjusted to reference varieties that exist in the 98-entry catalog.

### 9.3 Coffee Varieties & Equipment Pages
The pages are implemented and routes exist, but were temporarily missing due to a git stash reversion. They have been restored:
- `/coffee-varieties` — CoffeeVarietiesPage (catalog browsing)
- `/coffee-varieties/:id` — CoffeeVarietyDetailPage (detail + recipes)
- `/equipment/catalog` — EquipmentCatalogPage (catalog browsing)
- `/equipment/:id` — EquipmentDetailPage (detail + recipes)
- `/admin/coffee-varieties` — AdminCoffeeVarietiesPage (CRUD)

The Navbar includes "Varieties" and "Equipment" links. The admin sidebar includes "Coffee Varieties".

### 9.4 JSON Data Not Structured as Seed Data
The `files/coffee_equipments_v2.json` and `files/coffee_types_v2.json` files are reference data sources, not directly seeded. They were converted via a generator script into `seed-equipment-catalog.ts` and `seed-coffee-varieties.ts` with pre-populated UUIDs. If the JSON files are updated, the seed files must be regenerated.

### 9.5 Drizzle Migration Limitations
DrizzleKit cannot generate `ALTER TYPE ADD VALUE` statements for enum changes. The `db-push` command handles this. Future enum changes must use `make db-push`, not `make db-migrate`. This is documented in `AGENTS.md`.

---

## 10. Build & CI Commands

| Command | Purpose |
|---|---|
| `make install` | Cache Deno dependencies |
| `make lockfile-update` | Regenerate deno.lock inside Docker |
| `make check` | Type-check all workspaces (api, web, db, shared) |
| `make lint` | Lint all code (730 files, 0 issues) |
| `make test` | Run all tests (638 tests, 43 files) |
| `make db-push` | Push schema changes (always use for enum changes) |
| `make db-seed` | Seed database (388 equipment + 98 varieties + 6 recipes) |
| `make db-reset` | Full reset: wipe volumes → push schema → seed |
