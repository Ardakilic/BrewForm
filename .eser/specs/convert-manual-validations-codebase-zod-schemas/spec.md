# Spec: convert-manual-validations-codebase-zod-schemas

## Status: completed

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

Today API validation is inconsistent: ~60% of routes use Zod via zValidator, ~40% use manual if/typeof/Number() checks. Error format varies per module. 9 schema gaps exist. The pain is real - invalid data reaches services, and error messages are inconsistent. Confidence: 9 (verified by reading all 18 API module index.ts files).

_-- Arda Kilicdagi_

### ambition

1-star: Replace all manual validations with Zod, consistent error format across all modules. 10-star: Every input validated at the boundary, every error message tells what went wrong/why/how to fix, schemas power OpenAPI docs automatically, frontend validates with same schemas pre-submit, property-based testing catches edge cases. This spec delivers the 1-star with foundations for 10-star.

_-- Arda Kilicdagi_

### reversibility

No irreversible decisions. New schemas go in shared package (can be refined). zValidator middleware wraps existing routes (can be removed). Error format change is additive - old format fields remain, new details field added. No DB migration needed.

_-- Arda Kilicdagi_

### user_impact

API consumers may see different error responses for previously-unvalidated routes (e.g., 400 instead of 500 for bad input). Error format standardizes to {success: false, error: {code, message, details}}. This is a positive change - more predictable responses. No breaking changes to success responses.

_-- Arda Kilicdagi_

### verification

make check (type-check), make lint, make fmt, make test (full test suite including new schema unit tests and controller integration tests). All tests must pass. No regression on existing functionality. New tests for: all new shared schemas, API routes that now have zValidator middleware. Docs: update API docs if needed, create pr_description.md.

_-- Arda Kilicdagi_

### scope_boundary

NOT in scope: frontend form validation (defer to follow-up), OpenAPI generation from schemas, performance benchmarking, database changes, auth/authz changes (existing middleware unchanged), new features or API endpoints.

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

- NOT in scope: frontend form validation (defer to follow-up), OpenAPI generation from schemas, performance benchmarking, database changes, auth/authz changes (existing middleware unchanged), new features or API endpoints.

## Tasks

- [x] task-1: Create TasteNoteCreateSchema and TasteNoteUpdateSchema in packages/shared/src/schemas/taste.ts — following existing patterns with name (min 1, max 200), parentId (optional uuid), color, definition; update barrel export
- [ ]
- [x] task-2: Create RecipeRateSchema, RecipeNotesSchema, RecipeForkSchema in packages/shared/src/schemas/recipe.ts — rate=rating (int 1-10), notes=notes (string min 1 max 10000), fork=title (optional string max 200); update barrel export
- [ ]
- [x] task-3: Create ReportFilterSchema in new packages/shared/src/schemas/report.ts — status (optional enum), page, perPage
- [ ]
- [x] task-4: Create EquipmentDeleteRequestSchema in packages/shared/src/schemas/equipment.ts — reason (optional string max 500)
- [ ]
- [x] task-5: Create BrewMethodCompatibilityCreateSchema and BrewMethodCompatibilityUpdateSchema in new packages/shared/src/schemas/compatibility.ts — brewMethod (enum), equipmentType (enum), compatible (boolean)
- [ ]
- [x] task-6: Create QrCodeFilenameSchema in packages/shared/src/schemas/common.ts — z.string().regex() to extract slug and format from filename
- [ ]
- [x] task-7: Create SearchQuerySchema in packages/shared/src/schemas/common.ts — z.string().min(2).max(200) for reuse across search endpoints
## Phase 2: API Controller Conversion
- [ ]
- [ ] task-8: Convert recipe/index.ts — add zValidator + zodValidationHook to POST /:id/rate (RecipeRateSchema), POST /:id/notes (RecipeNotesSchema), POST /:id/fork (RecipeForkSchema)
- [ ]
- [ ] task-9: Convert taste/index.ts — add zValidator + zodValidationHook to POST / (TasteNoteCreateSchema), PATCH /:id (TasteNoteUpdateSchema)
- [ ]
- [ ] task-10: Convert photo/index.ts — add zValidator + zodValidationHook to POST / using PhotoUploadSchema (already exists, just wire it); use form validator for file
- [ ]
- [ ] task-11: Convert admin/index.ts — add zValidator + zodValidationHook to equipment create/update (reuse shared schemas), vendor create/update, taste-note create/update, compatibility create/update
- [ ]
- [ ] task-12: Convert equipment/index.ts — add zValidator + zodValidationHook to GET /:id/recipes (pagination schema), POST /:id/delete-request (EquipmentDeleteRequestSchema)
- [ ]
- [ ] task-13: Convert report/index.ts — add zValidator + zodValidationHook to GET / (ReportFilterSchema)
- [ ]
- [ ] task-14: Convert coffee-variety/index.ts — replace manual if(!q) with zValidator query for search route
- [ ]
- [ ] task-15: Convert vendor/index.ts — replace manual if(q.length<2) with zValidator query for search route
- [ ]
- [ ] task-16: Convert qrcode/index.ts — replace manual filename parsing with QrCodeFilenameSchema zValidator param
- [ ]
- [ ] task-17: Convert auth/index.ts — replace inline CookieRefreshSchema.parse() with zValidator json on refresh route
- [ ]
- [ ] task-18: Add zodValidationHook import to ALL modules that now use zValidator (taste, photo, admin, report, qrcode) — ensure consistent error format
## Phase 3: Web Error Handling — ensure zodValidationHook changes are reflected on web
- [ ]
- [ ] task-19: Audit apps/web/src/api/client.ts — confirm ApiError class properly deserializes the standardized `{success: false, error: {code, message, details}}` format for ALL modules (not just recipe). Verify error.code, error.message, error.details are read from the response envelope correctly.
- [ ]
- [ ] task-20: Audit all web pages that handle API errors — RecipeCreatePage, RecipeEditPage, admin pages, auth pages — verify they display field-level `details` when present and fall back to `message` otherwise. Update any page parsing that assumes old raw ZodError format.
## Phase 4: Web Tests
- [ ]
- [ ] task-21: Add tests for apps/web/src/api/client.ts — test that ApiError is constructed correctly from both standardized format `{code, message, details}` and legacy format. Test the auth refresh retry logic respects the new error format.
- [ ]
- [ ] task-22: Add tests for recipe pages error display — RecipeCreatePage and RecipeEditPage should render field-level details as an unordered list when `err.details` is present.
- [ ]
- [ ] task-23: Add tests for auth pages error display — LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage should display `err.message` (now meaningful instead of generic "Request failed").
- [ ]
- [ ] task-24: Update existing web tests if they break due to changed error format expectations.
## Phase 5: Docblocks
- [ ]
- [ ] task-25: Add JSDoc blocks to exported functions in new schema files and modified controller functions that lack documentation
## Phase 6: API Tests
- [ ]
- [ ] task-26: Add schema unit tests for all new schemas: taste.test.ts, report.test.ts, compatibility.test.ts; extend recipe.test.ts for rate/notes/fork schemas; extend equipment.test.ts for delete-request schema; extend common.test.ts for QrCodeFilenameSchema and SearchQuerySchema
- [ ]
- [ ] task-27: Add controller integration tests for newly-validated routes: taste create/update, photo upload, recipe rate/notes/fork, equipment pagination + delete-request, report status filter, coffee-variety search, vendor search, qrcode filename, auth refresh; admin equipment/vendor/taste/compatibility CRUD
- [ ]
- [ ] task-28: Update existing controller tests if they break due to new zValidator middleware (e.g., tests sending invalid data now get 400 instead of proceeding)
## Phase 7: Verification
- [ ]
- [ ] task-29: Run make check (type-check all workspaces: api + web + shared + db)
- [ ]
- [ ] task-30: Run make lint (lint all apps and packages)
- [ ]
- [ ] task-31: Run make fmt (format all code)
- [ ]
- [ ] task-32: Run make test (full test suite: api + web + shared)
- [ ]
- [ ] task-33: Create pr_description.md with summary of changes, migration notes, breaking change notes
- [ ]
- [ ] task-34: Update docs/ if any API behavior documentation needs changing

## Critical Web Impact (addressed in tasks 19-24)
Standardizing zodValidationHook across all API modules changes the error response format for ~40% of routes from raw ZodError `{success: false, error: {issues: [...], name: "ZodError"}}` to the structured `{success: false, error: {code: "VALIDATION_ERROR", message: "...", details: [{field, message}]}}`. This must be verified and tested on the web side:
- The ApiClient already handles both formats via defensive parsing (reads `data.error?.code`, `data.error?.message`, `data.error?.details`)
- Previously, non-recipe validation errors showed generic "Request failed" because `data.error?.code` was undefined for raw ZodError format
- After this change, ALL validation errors will show proper error messages with field-level details in the web UI

## Files to create:
- packages/shared/src/schemas/report.ts (new)
- packages/shared/src/schemas/compatibility.ts (new)
- packages/shared/src/schemas/taste.test.ts (new, or extend existing)
- packages/shared/src/schemas/report.test.ts (new)
- packages/shared/src/schemas/compatibility.test.ts (new)
- apps/api/src/modules/taste/index_test.ts (new)
- apps/api/src/modules/photo/index_test.ts (new)
- apps/api/src/modules/report/index_test.ts (new)
- apps/web/src/api/client.test.ts (new)
- apps/web/src/pages/recipes/RecipeCreatePage.test.tsx (new, or extend existing)
- apps/web/src/pages/recipes/RecipeEditPage.test.tsx (new, or extend existing)
- pr_description.md (new)

## Files to modify:
- packages/shared/src/schemas/taste.ts (+TasteNoteCreateSchema, TasteNoteUpdateSchema)
- packages/shared/src/schemas/recipe.ts (+RecipeRateSchema, RecipeNotesSchema, RecipeForkSchema)
- packages/shared/src/schemas/equipment.ts (+EquipmentDeleteRequestSchema)
- packages/shared/src/schemas/common.ts (+QrCodeFilenameSchema, SearchQuerySchema)
- packages/shared/src/schemas/index.ts (+new exports)
- apps/api/src/modules/recipe/index.ts (+zValidator on rate/notes/fork)
- apps/api/src/modules/taste/index.ts (+zValidator on create/update)
- apps/api/src/modules/photo/index.ts (+zValidator on upload)
- apps/api/src/modules/admin/index.ts (+zValidator on 8 routes)
- apps/api/src/modules/equipment/index.ts (+zValidator on pagination/delete-request)
- apps/api/src/modules/report/index.ts (+zValidator on status filter)
- apps/api/src/modules/coffee-variety/index.ts (+zValidator on search)
- apps/api/src/modules/vendor/index.ts (+zValidator on search)
- apps/api/src/modules/qrcode/index.ts (+zValidator param on filename)
- apps/api/src/modules/auth/index.ts (+zValidator on refresh)
- packages/shared/src/schemas/recipe.test.ts (extend)
- packages/shared/src/schemas/equipment.test.ts (extend)
- packages/shared/src/schemas/common.test.ts (extend)
- apps/web/src/api/client.ts (verify, may need minor updates)

## Phase 2: API Controller Conversion
- [ ]
- [ ] task-8: Convert recipe/index.ts — add zValidator + zodValidationHook to POST /:id/rate (RecipeRateSchema), POST /:id/notes (RecipeNotesSchema), POST /:id/fork (RecipeForkSchema)
- [ ]
- [ ] task-9: Convert taste/index.ts — add zValidator + zodValidationHook to POST / (TasteNoteCreateSchema), PATCH /:id (TasteNoteUpdateSchema)
- [ ]
- [ ] task-10: Convert photo/index.ts — add zValidator + zodValidationHook to POST / using PhotoUploadSchema (already exists, just wire it); use form validator for file
- [ ]
- [ ] task-11: Convert admin/index.ts — add zValidator + zodValidationHook to equipment create/update (reuse shared schemas), vendor create/update, taste-note create/update, compatibility create/update
- [ ]
- [ ] task-12: Convert equipment/index.ts — add zValidator + zodValidationHook to GET /:id/recipes (pagination schema), POST /:id/delete-request (EquipmentDeleteRequestSchema)
- [ ]
- [ ] task-13: Convert report/index.ts — add zValidator + zodValidationHook to GET / (ReportFilterSchema)
- [ ]
- [ ] task-14: Convert coffee-variety/index.ts — replace manual if(!q) with zValidator query for search route
- [ ]
- [ ] task-15: Convert vendor/index.ts — replace manual if(q.length<2) with zValidator query for search route
- [ ]
- [ ] task-16: Convert qrcode/index.ts — replace manual filename parsing with QrCodeFilenameSchema zValidator param
- [ ]
- [ ] task-17: Convert auth/index.ts — replace inline CookieRefreshSchema.parse() with zValidator json on refresh route
- [ ]
- [ ] task-18: Add zodValidationHook import to ALL modules that now use zValidator (taste, photo, admin, report, qrcode) — ensure consistent error format
## Phase 3: Web Error Handling (required — standardizing format fixes existing bug)
- [ ]
- [ ] task-19: Verify apps/web/src/api/client.ts properly parses new standardized error format (code + message + details from all modules, not just recipe). The client already handles this correctly — confirm no regression.
## Phase 4: Docblocks
- [ ]
- [ ] task-20: Add JSDoc blocks to exported functions in new schema files and modified controller functions that lack documentation
## Phase 5: Tests
- [ ]
- [ ] task-21: Add schema unit tests for all new schemas: taste.test.ts, report.test.ts, compatibility.test.ts; extend recipe.test.ts for rate/notes/fork schemas; extend equipment.test.ts for delete-request schema; extend common.test.ts for QrCodeFilenameSchema and SearchQuerySchema
- [ ]
- [ ] task-22: Add controller integration tests for newly-validated routes: taste create/update, photo upload, recipe rate/notes/fork, equipment pagination + delete-request, report status filter, coffee-variety search, vendor search, qrcode filename, auth refresh; admin equipment/vendor/taste/compatibility CRUD
- [ ]
- [ ] task-23: Update existing controller tests if they break due to new zValidator middleware (e.g., tests sending invalid data now get 400 instead of proceeding)
## Phase 6: Verification
- [ ]
- [ ] task-24: Run make check (type-check all workspaces)
- [ ]
- [ ] task-25: Run make lint (lint all apps and packages)
- [ ]
- [ ] task-26: Run make fmt (format all code)
- [ ]
- [ ] task-27: Run make test (full test suite)
- [ ]
- [ ] task-28: Create pr_description.md with summary of changes, migration notes
- [ ]
- [ ] task-29: Update docs/ if any API behavior documentation needs changing

## Files to create:
- packages/shared/src/schemas/report.ts (new)
- packages/shared/src/schemas/compatibility.ts (new)
- packages/shared/src/schemas/taste.test.ts (new, or extend existing)
- packages/shared/src/schemas/report.test.ts (new)
- packages/shared/src/schemas/compatibility.test.ts (new)
- apps/api/src/modules/taste/index_test.ts (new)
- apps/api/src/modules/photo/index_test.ts (new)
- apps/api/src/modules/report/index_test.ts (new)
- pr_description.md (new)

## Files to modify:
- packages/shared/src/schemas/taste.ts (+TasteNoteCreateSchema, TasteNoteUpdateSchema)
- packages/shared/src/schemas/recipe.ts (+RecipeRateSchema, RecipeNotesSchema, RecipeForkSchema)
- packages/shared/src/schemas/equipment.ts (+EquipmentDeleteRequestSchema)
- packages/shared/src/schemas/common.ts (+QrCodeFilenameSchema, SearchQuerySchema)
- packages/shared/src/schemas/index.ts (+new exports)
- apps/api/src/modules/recipe/index.ts (+zValidator on rate/notes/fork)
- apps/api/src/modules/taste/index.ts (+zValidator on create/update)
- apps/api/src/modules/photo/index.ts (+zValidator on upload)
- apps/api/src/modules/admin/index.ts (+zValidator on 8 routes)
- apps/api/src/modules/equipment/index.ts (+zValidator on pagination/delete-request)
- apps/api/src/modules/report/index.ts (+zValidator on status filter)
- apps/api/src/modules/coffee-variety/index.ts (+zValidator on search)
- apps/api/src/modules/vendor/index.ts (+zValidator on search)
- apps/api/src/modules/qrcode/index.ts (+zValidator param on filename)
- apps/api/src/modules/auth/index.ts (+zValidator on refresh)
- packages/shared/src/schemas/recipe.test.ts (extend)
- packages/shared/src/schemas/equipment.test.ts (extend)
- packages/shared/src/schemas/common.test.ts (extend)

## Verification

- make check (type-check), make lint, make fmt, make test (full test suite including new schema unit tests and controller integration tests)
- All tests must pass
- No regression on existing functionality
- New tests for: all new shared schemas, API routes that now have zValidator middleware
- Docs: update API docs if needed, create pr_description.md.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-28T15:22:37.296Z | - |
