# Spec: enrich-coffee-types-equipment-brewform

## Status: executing

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

{"status_quo":"All of the above — discovery/browsing, recipe data accuracy, and filter/search are equally important pain points. Users currently type free-text for both equipment machines and coffee types with no structured catalog, no dedicated browsing pages, and no way to filter recipes by specific machine or coffee variety.","ambition":"10★ Emotional — Coffee gear pages feel like a museum gallery. Variety pages feel like botanical exploration. Users discover gear/varieties they never knew existed. Recipe creation is joyful — typing a machine name auto-completes with rich suggestions. Equipment detail shows Recipes

_-- Arda Kilicdagi_

### ambition

10★ Emotional — Coffee gear pages feel like a museum gallery. Variety pages feel like botanical exploration. Users discover gear/varieties they never knew existed. Recipe creation is joyful — typing a machine name auto-completes with rich suggestions. Equipment detail shows Recipes using this machine with beautiful cards. Every page loads instantly (24h cached). No generic AI-looking elements. Design must be intentional and distinctive.

_-- Arda Kilicdagi_

### reversibility

None — all reversible. User will wipe all databases and create from scratch with fresh seed data. No existing production data to protect. All architectural decisions can be iterated on.

_-- Arda Kilicdagi_

### user_impact

Searchable dropdown + create. A searchable async dropdown that loads from the coffee varieties or equipment table. If no match is found, show a Create new option that opens a quick inline form. For equipment, same pattern. New user-created entries may go through moderation/admin approval before becoming public catalog entries.

_-- Arda Kilicdagi_

### verification

Full coverage — unit tests for all new schemas, services, and models. Integration tests for all new API endpoints. Seed data tests verifying all 378+98 entries load correctly. Update existing recipe/equipment tests for new FK fields. Type-check and lint must pass. Test in Docker environment with fresh database.

_-- Arda Kilicdagi_

### scope_boundary

All of the above — NO equipment reviews/ratings, NO ownership tracking/my gear collections, NO marketplace/pricing or buying links. Keep focused on catalog pages, recipe linkage, admin CRUD, filtering, and caching.

_-- Arda Kilicdagi_

## Test Strategy (well-engineered)

_To be addressed during execution._

## Performance Considerations (well-engineered)

_To be addressed during execution._

## Observability Plan (well-engineered)

_To be addressed during execution._

## Error Handling (well-engineered)

_To be addressed during execution._

## Security & Threat Model (well-engineered)

_To be addressed during execution._

## Developer Ergonomics (well-engineered)

_To be addressed during execution._

## Design States (empty, loading, error, success) (beautiful-product)

_To be addressed during execution._

## Mobile Layout (beautiful-product)

_To be addressed during execution._

## Interaction Design (beautiful-product)

_To be addressed during execution._

## Accessibility (beautiful-product)

_To be addressed during execution._

## Contributor Guide (open-source)

_To be addressed during execution._

## Public API Surface (open-source)

_To be addressed during execution._

## Out of Scope

- All of the above — NO equipment reviews/ratings, NO ownership tracking/my gear collections, NO marketplace/pricing or buying links
- Keep focused on catalog pages, recipe linkage, admin CRUD, filtering, and caching.

## Tasks

- [x] task-1: Replace equipmentTypeEnum with 8 broad categories (espresso_machine, grinder, pour_over_brewer, immersion_brewer, kettle, milk_tool, scale_accessory, roaster). Update schema.ts - replace Postgres enum, update equipment table columns. Update all TypeScript type references in shared constants, schemas, and frontend. Update setup table FK columns that reference old enum values. Update brew_method_equipment_rule table compatibility rules. Files: packages/db/src/schema.ts, packages/shared/src/constants/brew-methods.ts, packages/shared/src/constants/brew-method-rules.ts, packages/shared/src/schemas/equipment.ts, packages/shared/src/types/equipment.ts, apps/web/src/pages/setups/SetupListPage.tsx
- [x] task-2: Create coffee_varieties table in schema.ts with columns: id (UUID PK), name, category (enum: variety/processing/market_name), species, origin, spread, altitude_range_m, cup_profile, body, acidity, caffeine_pct, processing_compatibility (text array), disease_resistance, yield, plant_size, notes, sub_varieties (text array), fermentation, drying_time_days, drying_method, mucilage_retention_pct, price_range, processing, type_label, notable_farms (text array), notable_regions (text array), regional_variants (text array), global_share_pct, isSystem (boolean default true), createdBy FK to users, timestamps, deletedAt. Add index on name, category, deletedAt. Files: packages/db/src/schema.ts
- [x] task-3: Add coffeeVarietyId FK column to recipe_versions table (nullable varchar FK to coffee_varieties.id). Keep existing free-text columns (productName, coffeeBrand, coffeeProcessing). Add coffeeVarietyName denormalized string column for display when FK is set but variety might change name. Files: packages/db/src/schema.ts
- [x] task-4: Add isSystem boolean column to equipment table (default false) to distinguish seed/catalog equipment from user-created. Seed equipment gets isSystem=true, createdBy=null. User equipment gets isSystem=false, createdBy set. Files: packages/db/src/schema.ts
- [x] task-5: Add equipment delete request tracking. Create equipment_delete_request table: id, equipmentId FK, requestedById FK to users, reason text, status enum (pending/approved/rejected), reviewedById FK to users (nullable), reviewedAt, createdAt. Admin checks if equipment is bound to active recipes before approving. Files: packages/db/src/schema.ts
- [ ] task-6: Generate Drizzle migration for all schema changes (equipment enum replacement, coffee_varieties table, new FK columns, isSystem, equipment_delete_request table). Run make db-generate and make db-migrate. Files: packages/db/drizzle/*.sql
- [x] task-7: Create shared Zod schemas for coffee varieties - CoffeeVarietyCreateSchema, CoffeeVarietyUpdateSchema, CoffeeVarietyFilterSchema. Create shared types. Files: packages/shared/src/schemas/coffee-variety.ts, packages/shared/src/types/coffee-variety.ts, packages/shared/src/schemas/index.ts (barrel export)
- [x] task-8: Update shared EquipmentCreateSchema and EquipmentUpdateSchema to accept new equipment type enum values. Add EquipmentFilterSchema for list queries. Files: packages/shared/src/schemas/equipment.ts
- [x] task-9: Create coffee_variety API module following 3-layer pattern: model.ts (Drizzle queries - findById, findMany paginated, search by name/category, create, update, softDelete, getRecipesUsingVariety), service.ts (business logic with authorization checks), index.ts (Hono routes: GET /, GET /search?q=, POST /, GET /:id, PATCH /:id, DELETE /:id, GET /:id/recipes). Files: apps/api/src/modules/coffee-variety/
- [x] task-10: Update equipment API module - expand model.ts with richer search (brand, model, category), add getRecipesUsingEquipment query, add delete request creation method. Update service.ts for new equipment type validation, isSystem protection (users can not delete/edit isSystem equipment), delete request flow. Update index.ts routes with new endpoints. Files: apps/api/src/modules/equipment/model.ts, apps/api/src/modules/equipment/service.ts, apps/api/src/modules/equipment/index.ts
- [x] task-11: Update recipe API module - accept coffeeVarietyId in create and update payloads. Add coffee variety filter to recipe list query. Add coffeeVarietyId to recipe detail response (with variety name). Validate coffeeVarietyId exists. Files: apps/api/src/modules/recipe/service.ts, apps/api/src/modules/recipe/index.ts, apps/api/src/modules/recipe/model.ts
- [x] task-12: Update RecipeFilterSchema in shared to add coffeeVarietyId, equipmentIds (multiple), and equipmentCategory filters. Files: packages/shared/src/schemas/recipe.ts
- [x] task-13: Register new coffee-variety routes in API router index.ts. Files: apps/api/src/routes/index.ts
- [ ] task-14: Create seed data for 378 equipment entries from coffee_equipments_v2.json. Generate deterministic UUIDs (UUID v5 based on namespace + name). Each entry must include: id, name (brand + model), type (mapped from JSON category to new enum), brand, model, description (notable_features), isSystem=true, createdBy=null. Add these to seed-data.ts as equipmentCatalogSeedData. Files: packages/db/src/seed-data.ts
- [ ] task-15: Create seed data for 98 coffee varieties from coffee_types_v2.json. Generate deterministic UUIDs (UUID v5 based on namespace + name). Map each JSON category to the category enum. Map all available fields. Add to seed-data.ts as coffeeVarietySeedData. Files: packages/db/src/seed-data.ts
- [ ] task-16: Update existing recipe seed data to reference coffee variety IDs and new equipment catalog IDs. Replace equipmentNames with equipmentIds where catalog entries match. Add coffeeVarietyId to each recipe seed entry. Re-map setup seed data equipment references to new equipment IDs. Files: packages/db/src/seed-data.ts
- [ ] task-17: Update seed.ts to insert equipment catalog entries (isSystem=true batch), coffee varieties, and handle new ID references in recipe seeding. Update seed order: equipment catalog → coffee varieties → equipment (user) → recipes. Files: packages/db/src/seed.ts
- [ ] task-18: Create CoffeeVarieties list page at /coffee-varieties with categorized browsing (6 categories), search, pagination. Each variety shown as a card with name, species, origin, cup_profile preview. Empty state with CTA. Loading skeleton. Error state. Design: warm coffee tones, intentional typography, no AI slop patterns. Files: apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx
- [ ] task-19: Create CoffeeVariety detail page at /coffee-varieties/:id with full variety information (all fields), Recipes using this variety carousel (paginated), Related varieties section. 24h Deno KV cache. Design: botanical/exploration feel. Files: apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx
- [ ] task-20: Create Equipment catalog list page at /equipment-catalog with 8-category browsing, search by brand/model, paginated grid. Each equipment shown as card with brand, model, type, description. Empty state, loading, error states. Files: apps/web/src/pages/equipment/EquipmentCatalogPage.tsx
- [ ] task-21: Create Equipment detail page at /equipment/:id with full equipment info, Recipes using this equipment carousel (paginated), Similar equipment section. 24h Deno KV cache. Design: museum gallery feel. Files: apps/web/src/pages/equipment/EquipmentDetailPage.tsx
- [ ] task-22: Update recipe creation page - add searchable dropdown (AsyncSelect pattern) for coffee variety selection from /api/v1/coffee-varieties/search. Show Create new variety inline modal when no match found (name, category select, basic info). Add searchable dropdown for equipment selection from /api/v1/equipment/search with multi-select capability. Show equipment compatibility validation hints. Files: apps/web/src/pages/recipes/RecipeCreatePage.tsx
- [ ] task-23: Update recipe edit page - same searchable dropdowns for coffee variety and equipment. Pre-populate current selections. Handle FK + free-text mixed display. Files: apps/web/src/pages/recipes/RecipeEditPage.tsx
- [ ] task-24: Update recipe detail page - show linked coffee variety name (clickable to detail page) or fallback to free-text. Show linked equipment with names (clickable to detail pages). Files: apps/web/src/pages/recipes/RecipeDetailPage.tsx
- [ ] task-25: Update recipe list page filters - add coffee variety filter dropdown (searchable, loads from API), add equipment category filter (8 categories), add equipment make/model search filter. Follow existing filter chip pattern. Add to filter badges display. Files: apps/web/src/pages/recipes/RecipeListPage.tsx
- [ ] task-26: Add navigation links for new pages in app header/nav (Coffee Varieties, Equipment Catalog). Update router configuration with new routes and lazy loading. Files: apps/web/src/App.tsx, apps/web/src/components/layout/Header.tsx
- [ ] task-27: Update admin equipment page - show isSystem flag, prevent editing system equipment core fields, show delete requests queue, implement approve/reject for equipment delete requests with bound-recipe check (warn if equipment used by N active recipes). Files: apps/web/src/pages/admin/AdminEquipmentPage.tsx
- [ ] task-28: Create admin coffee varieties page at /admin/coffee-varieties with full CRUD - list with search/filter by category, create form with all fields (category-specific fields shown conditionally), edit form, soft delete with bound-recipe check. Files: apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx
- [ ] task-29: Update admin sidebar/navigation to include Coffee Varieties link. Update admin routes for lazy loading. Files: apps/web/src/components/admin/AdminLayout.tsx, apps/web/src/App.tsx
- [ ] task-30: Implement 24h cache for coffee variety detail and equipment detail API responses using existing CacheProvider interface. Cache keys: coffee-variety:{id}, equipment-detail:{id}. Invalidate on admin update. Files: apps/api/src/modules/coffee-variety/service.ts, apps/api/src/modules/equipment/service.ts
- [ ] task-31: Write coffee-variety model tests - test findById, findMany, search, create, update, softDelete, getRecipesUsingVariety. Test pagination, filtering by category. Files: apps/api/src/modules/coffee-variety/model.test.ts
- [ ] task-32: Write coffee-variety service tests - test authorization (only creator can update/delete non-system), validation, cache integration. Files: apps/api/src/modules/coffee-variety/service.test.ts
- [ ] task-33: Write coffee-variety API integration tests - test all endpoints (GET list, GET search, POST create, GET detail, PATCH update, DELETE soft, GET recipes). Test auth guards, rate limiting. Files: apps/api/src/modules/coffee-variety/index.test.ts
- [ ] task-34: Update equipment model tests for new enum values, isSystem field, delete request flow. Files: apps/api/src/modules/equipment/service.test.ts
- [ ] task-35: Update recipe service tests for coffeeVarietyId field, new equipment references, compatibility validation with new types. Files: apps/api/src/modules/recipe/service.test.ts
- [ ] task-36: Write seed data tests - verify all 378 equipment entries load with correct type mapping and deterministic UUIDs. Verify all 98 coffee variety entries load with correct category mapping. Verify recipe seed data references are valid FKs. Verify seed ordering. Files: packages/db/src/seed.test.ts
- [ ] task-37: Write shared schema tests for CoffeeVarietyCreateSchema, CoffeeVarietyUpdateSchema, CoffeeVarietyFilterSchema, updated EquipmentCreateSchema, updated RecipeFilterSchema. Test validation edge cases. Files: packages/shared/src/schemas/coffee-variety.test.ts, packages/shared/src/schemas/equipment.test.ts, packages/shared/src/schemas/recipe.test.ts
- [ ] task-38: Write admin coffee-variety CRUD integration tests. Files: apps/api/src/modules/admin/index.test.ts (update)
- [ ] task-39: Run make check (type-check all workspaces), make lint (lint all), make test (full test suite). Fix all failures. Ensure no sloppy imports (all .ts extensions). Files: (all modified files)
- [ ] task-40: Create pr_description.md with feature summary, screenshots placeholder, migration instructions, breaking changes (equipment enum), new API endpoints list, seed data changes, test coverage summary. Files: pr_description.md

## Verification

- Full coverage — unit tests for all new schemas, services, and models
- Integration tests for all new API endpoints
- Seed data tests verifying all 378+98 entries load correctly
- Update existing recipe/equipment tests for new FK fields
- Type-check and lint must pass
- Test in Docker environment with fresh database.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-26T14:33:37.743Z | - |
