## 1. P1 API Services — Add structured logging (5 files)

- [x] 1.1 `apps/api/src/modules/user/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('user-service')`. Add `log.debug({ userId }, 'getProfile started/completed')` entry/exit and `log.error({ userId })` before `USER_NOT_FOUND` throw in `getProfile`. Add `log.debug({ username, requesterId }, ...)` entry/exit and `log.error({ username })` before `USER_NOT_FOUND` in `getPublicProfile`. Add `log.debug({ userId }, ...)` entry/exit and `log.error({ userId })` before `USER_NOT_FOUND` in `updateProfile`. Add `log.debug({ userId }, ...)` entry/exit in `deleteAccount`.

- [x] 1.2 `apps/api/src/modules/vendor/service.ts` — Add `log.error({ id })` before `VENDOR_NOT_FOUND` throw in `getVendor`. Add `log.error({ id, userId })` before `VENDOR_NOT_FOUND` and `log.warn({ id, userId })` before `FORBIDDEN` in `updateVendor`. Add `log.error({ id })` before `VENDOR_NOT_FOUND` in `deleteVendor`. Import and logger already present (`createLogger('vendor-service')` as `log`).

- [x] 1.3 `apps/api/src/modules/bean/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('bean-service')`. Add `log.debug` entry/exit on `listBeans`, `getBean`, `createBean`, `updateBean`, `deleteBean`. Add `log.error` before `BEAN_NOT_FOUND` throws (3 sites). Add `log.warn` before `FORBIDDEN` throws in `updateBean`/`deleteBean`. Never log `data: any` parameters.

- [x] 1.4 `apps/api/src/modules/setup/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('setup-service')`. Add `log.debug` entry/exit on all 6 functions (`listSetups`, `getSetup`, `createSetup`, `updateSetup`, `deleteSetup`, `setDefault`). Add `log.debug({ userId })` before each `clearDefaultForUser` call. Add `log.error` before `SETUP_NOT_FOUND` throws. Add `log.warn` before `FORBIDDEN` throws.

- [x] 1.5 `apps/api/src/modules/report/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('report-service')`. Add `log.info({ reporterId, entityType, entityId })` entry/exit on `createReport`. Add `log.debug({ status, page, perPage })` entry/exit on `listReports`. Add `log.info({ id, resolvedBy })` entry/exit on `resolveReport`. Add `log.error` before `REPORT_NOT_FOUND` and `log.warn` before `REPORT_ALREADY_RESOLVED`.

## 2. P1 Web Pages & Critical Components (6 files)

- [x] 2.1 `apps/web/src/pages/recipes/RecipeEditPage.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('RecipeEditPage')`. Add mount/unmount `useEffect(() => { log.debug({}, 'RecipeEditPage mounted'); return () => { log.debug({}, 'RecipeEditPage unmounted'); }; }, [])`. Add `log.error({ err }, 'RecipeEditPage loadRecipe failed')` in data fetch catch. Add `log.error({ err }, 'RecipeEditPage saveRecipe failed')` in form submission catch.

- [x] 2.2 `apps/web/src/pages/auth/ForgotPasswordPage.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('ForgotPasswordPage')`. Add mount/unmount `useEffect`. Add `log.error({ err }, 'ForgotPasswordPage sendResetEmail failed')` in email submission catch block.

- [x] 2.3 `apps/web/src/pages/auth/ResetPasswordPage.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('ResetPasswordPage')`. Add mount/unmount `useEffect`. Add `log.error({ err }, 'ResetPasswordPage resetPassword failed')` in token consumption catch block.

- [x] 2.4 `apps/web/src/pages/auth/VerifyEmailPage.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('VerifyEmailPage')`. Add mount/unmount `useEffect`. Add `log.error({ err }, 'VerifyEmailPage token verification failed')` in existing token verification useEffect catch block.

- [x] 2.5 `apps/web/src/contexts/AuthContext.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('AuthContext')`. Add `log.info({ userId }, 'AuthContext user logged in')` after successful login. Add `log.info({}, 'AuthContext user logged out')` in logout. Add `log.debug({}, 'AuthContext token refresh started/completed')` around refresh. Add `log.error({ err }, 'AuthContext login failed')` in login catch. Add `log.warn({ err }, 'AuthContext token refresh failed — session may be expired')` in refresh catch. Add `log.warn({ userId }, 'AuthContext user account is banned')` if banned response detected.

- [x] 2.6 `apps/web/src/components/ErrorBoundary.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('ErrorBoundary')`. Add `log.error({ err, componentStack }, 'ErrorBoundary caught render error')` in error handler. Add `log.info({}, 'ErrorBoundary reset triggered')` on reset.

## 3. P2 API Services — Add structured logging (4 files)

- [x] 3.1 `apps/api/src/modules/preference/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('preference-service')`. Add `log.debug({ userId })` entry/exit on `getPreferences` and `updatePreferences`. Add `log.error({ userId })` before `PREFERENCES_NOT_FOUND` throw.

- [x] 3.2 `apps/api/src/modules/taste/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('taste-service')`. Add `log.debug` entry/exit on all 7 public functions + private `flushCache`. Include `{ cached: !!cached }` in completion logs for cache-read functions (`getHierarchy`, `getFlatList`, `getTasteNoteRootMap`). Add `log.warn({ query })` before `QUERY_TOO_SHORT` throw in `searchTasteNotes`. Add `log.debug({ name })` 'flushing taste note cache after create/update/delete' before each `flushCache` call.

- [x] 3.3 `apps/api/src/modules/qrcode/service.ts` — Add `import { createLogger } from '../../utils/logger/index.ts'` and `const log = createLogger('qrcode-service')`. Add `log.debug({ slug, format })` entry/exit on `getRecipeQRCode`. Add `log.error({ slug })` before `RECIPE_NOT_FOUND` throw. Add `log.warn({ slug, visibility })` before `RECIPE_NOT_AVAILABLE` throw.

- [x] 3.4 `apps/api/src/modules/coffee-variety/service.ts` — Add `log.debug` entry/exit on 4 remaining functions: `getCoffeeVarietyById` (with `{ id, cached }`), `listCoffeeVarieties` (with filter params and `{ total }`), `createCoffeeVariety` (with `{ userId, name, varietyId }`), `getRecipesForVariety` (with `{ varietyId, page, perPage, total }`). Import and logger already present (`createLogger('coffee-variety-service')` as `log`).

## 4. API Middleware — Add structured logging (4 files)

- [x] 4.1 `apps/api/src/middleware/auth.ts` — Add `import { createLogger } from '../utils/logger/index.ts'` and `const log = createLogger('auth-middleware')`. In `authMiddleware`: `log.debug({}, 'authMiddleware no token found in Authorization header')` when token missing, `log.error({ err }, 'authMiddleware token verification failed')` in catch block, `log.warn({ userId: payload.sub }, 'authMiddleware user not found for valid token')` when user missing, `log.warn({ userId }, 'authMiddleware access denied: user is banned')` when banned, `log.debug({ userId }, 'authMiddleware authentication successful')` on success. In `optionalAuthMiddleware`: `log.debug({}, 'optionalAuthMiddleware no auth token supplied')` when absent, `log.debug({ userId }, 'optionalAuthMiddleware authenticated user')` when present. In `adminMiddleware`: `log.warn({ userId, role }, 'adminMiddleware access denied: non-admin user')` on reject, `log.debug({ userId }, 'adminMiddleware admin access granted')` on success.

- [x] 4.2 `apps/api/src/middleware/cors.ts` — Add `import { createLogger } from '../utils/logger/index.ts'` and `const log = createLogger('cors-middleware')`. Logger available for future blocked-origin debugging.

- [x] 4.3 `apps/api/src/middleware/rateLimit.ts` — Add `import { createLogger } from '../utils/logger/index.ts'` and `const log = createLogger('rate-limit-middleware')`. Add `log.warn({ ip, limit }, 'rateLimitMiddleware rate limit exceeded')` before 429 response in `rateLimitMiddleware`. Add `log.warn({ userId, ip, limit }, 'authRateLimitMiddleware rate limit exceeded')` before 429 response in `authRateLimitMiddleware`.

- [x] 4.4 `apps/api/src/middleware/requestId.ts` — Add `import { createLogger } from '../utils/logger/index.ts'` and `const log = createLogger('request-id-middleware')`. Logger available for future ID generation/received tracing.

## 5. P2 Web Admin Pages — Mount/unmount logging (12 files)

- [x] 5.1 `apps/web/src/pages/admin/AdminDashboard.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminDashboard'`, mount/unmount
- [x] 5.2 `apps/web/src/pages/admin/AdminUsersPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminUsersPage'`, mount/unmount + error in data fetch
- [x] 5.3 `apps/web/src/pages/admin/AdminUserCreatePage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminUserCreatePage'`, mount/unmount
- [x] 5.4 `apps/web/src/pages/admin/AdminUserEditPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminUserEditPage'`, mount/unmount + error in data fetch
- [x] 5.5 `apps/web/src/pages/admin/AdminUserDetailPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminUserDetailPage'`, mount/unmount + error in data fetch
- [x] 5.6 `apps/web/src/pages/admin/AdminRecipesPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminRecipesPage'`, mount/unmount + error in data fetch
- [x] 5.7 `apps/web/src/pages/admin/AdminVendorsPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminVendorsPage'`, mount/unmount
- [x] 5.8 `apps/web/src/pages/admin/AdminBadgesPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminBadgesPage'`, mount/unmount
- [x] 5.9 `apps/web/src/pages/admin/AdminCompatibilityPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminCompatibilityPage'`, mount/unmount
- [x] 5.10 `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminCoffeeVarietiesPage'`, mount/unmount
- [x] 5.11 `apps/web/src/pages/admin/AdminAuditLogPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminAuditLogPage'`, mount/unmount
- [x] 5.12 `apps/web/src/pages/admin/AdminCachePage.tsx` — Import from `'../../utils/logger.ts'`, logger `'AdminCachePage'`, mount/unmount

## 6. P2 Web User-Facing Pages — Mount/unmount logging (9 files)

- [x] 6.1 `apps/web/src/pages/recipes/RecipeVersionsPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'RecipeVersionsPage'`, mount/unmount + error in data fetch
- [x] 6.2 `apps/web/src/pages/recipes/RecipeComparePage.tsx` — Import from `'../../utils/logger.ts'`, logger `'RecipeComparePage'`, mount/unmount + error in data fetch
- [x] 6.3 `apps/web/src/pages/beans/BeanListPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'BeanListPage'`, mount/unmount + error in data fetch
- [x] 6.4 `apps/web/src/pages/setups/SetupListPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'SetupListPage'`, mount/unmount + error in data fetch
- [x] 6.5 `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'EquipmentCatalogPage'`, mount/unmount + error in data fetch
- [x] 6.6 `apps/web/src/pages/equipment/EquipmentDetailPage.tsx` — Import from `'../../utils/logger.ts'`, logger `'EquipmentDetailPage'`, mount/unmount + error in data fetch
- [x] 6.7 `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx` — Import from `'../../../utils/logger.ts'`, logger `'CoffeeVarietiesPage'`, mount/unmount + error in data fetch
- [x] 6.8 `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx` — Import from `'../../../utils/logger.ts'`, logger `'CoffeeVarietyDetailPage'`, mount/unmount + error in data fetch
- [x] 6.9 `apps/web/src/pages/TasteNotesPage.tsx` — Import from `'../utils/logger.ts'`, logger `'TasteNotesPage'`, mount/unmount + error in data fetch

## 7. P2 Context Providers & Hooks — Add logging (5 files)

- [x] 7.1 `apps/web/src/contexts/ThemeContext.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('ThemeContext')`. Add `log.debug({ theme: newTheme }, 'ThemeContext theme changed')` on toggle.

- [x] 7.2 `apps/web/src/contexts/I18nContext.tsx` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('I18nContext')`. Add `log.debug({ locale: newLocale }, 'I18nContext locale changed')` on locale change.

- [x] 7.3 `apps/web/src/hooks/useDebounce.ts` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('useDebounce')`. Add `log.trace({ value }, 'useDebounce timer set')` on timer creation. Add `log.trace({}, 'useDebounce timer cleared')` in cleanup. Use `trace` level to avoid noise.

- [x] 7.4 `apps/web/src/hooks/useUnitSystem.ts` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('useUnitSystem')`. Add `log.trace({ unitSystem }, 'useUnitSystem unit system read')` on read. Use `trace` level.

- [x] 7.5 `apps/web/src/hooks/useStaticCacheSync.ts` — Add `import { createLogger } from '@/utils/logger.ts'` and `const log = createLogger('useStaticCacheSync')`. Add mount/unmount `useEffect` debug logs. Add `log.debug({ key: 'brewform-static-cache-bust' }, 'useStaticCacheSync cross-tab cache bust detected')` before `invalidateStaticCache()` in storage event handler.

## 8. JSDoc Docblock Additions (5 files)

- [x] 8.1 `apps/api/src/modules/equipment/service.ts` — Add file-level `/** ... */` block. Add JSDoc on all 9 exported functions: `getEquipment` (`/** Get equipment by ID with 24h cache. Returns null if not found. */`), `getEquipmentById`, `listEquipmentWithFilters`, `searchEquipment`, `createEquipment`, `updateEquipment` (multi-line with `@param userId, id, data` and `@throws EQUIPMENT_NOT_FOUND, FORBIDDEN`), `deleteEquipment` (multi-line with `@throws`), `requestEquipmentDeletion` (multi-line with `@param`), `getRecipesForEquipment`.

- [x] 8.2 `apps/api/src/modules/coffee-variety/service.ts` — Add file-level `/** ... */` block. Add JSDoc on 4 functions: `getCoffeeVarietyById`, `listCoffeeVarieties`, `createCoffeeVariety`, `getRecipesForVariety`. Do not modify existing JSDoc on `updateCoffeeVariety` and `deleteCoffeeVariety`.

- [x] 8.3 `apps/api/src/middleware/rateLimit.ts` — Add file-level JSDoc. Add JSDoc on `RateLimitEntry` interface (`/** In-memory rate limit tracking entry. */`), `rateLimitMiddleware` (multi-line with `@param options.limit, options.windowMs` and `@returns`), `authRateLimitMiddleware` (same pattern).

- [x] 8.4 `apps/api/src/middleware/requestId.ts` — Add file-level JSDoc. Add JSDoc on `requestIdMiddleware` (`/** Request ID middleware. Attaches a unique request identifier (UUID v4) via hono/request-id. */`).

- [x] 8.5 `apps/api/src/middleware/cors.ts` — Convert existing `/* ... */` comment to `/** ... */` JSDoc block. Content is already good.

## 9. Tests — Create new test files (3 files)

- [x] 9.1 Create `apps/api/src/modules/report/service.test.ts` — Use `describe('Report Service')` from `jsr:@std/testing/bdd`. Import `createReport`, `listReports`, `resolveReport` from `./service.ts`. Test all 3 functions. Assert `log.info` entry/exit on `createReport` and `resolveReport`. Assert `log.debug` on `listReports`. Assert `log.error` on `REPORT_NOT_FOUND`. Assert `log.warn` on `REPORT_ALREADY_RESOLVED`.

- [x] 9.2 Create `apps/api/src/middleware/auth.test.ts` — Use `describe('Auth Middleware')`. Test `authMiddleware`: assert `log.debug` on missing token, `log.error` on token verification failure, `log.warn` on user not found, `log.warn` on banned user, `log.debug` on success. Test `optionalAuthMiddleware`: assert `log.debug` when token absent (expected), `log.debug` when authenticated. Test `adminMiddleware`: assert `log.warn` on non-admin, `log.debug` on admin. Verify response status codes and body are unchanged.

- [x] 9.3 Create `apps/api/src/middleware/rateLimit.test.ts` — Use `describe('Rate Limit Middleware')`. Test `rateLimitMiddleware`: assert `log.warn({ ip, limit })` on limit exceeded with 429 response. Test `authRateLimitMiddleware`: assert `log.warn({ userId, ip, limit })` on limit exceeded. Test that below-limit requests pass through without logging.

## 10. Tests — Update existing API service tests with logger assertions (9 files)

- [x] 10.1 `apps/api/src/modules/user/service.test.ts` — Rewrite to test real service using actual model imports (like vendor test). Add logger spy with `spy()` from `jsr:@std/testing/mock`. Assert `log.debug` entry/exit on all 4 functions. Assert `log.error` on `USER_NOT_FOUND` throw sites.

- [x] 10.2 `apps/api/src/modules/vendor/service.test.ts` — Add logger spy. Assert `log.error` before `VENDOR_NOT_FOUND` in `getVendor`, `updateVendor`, `deleteVendor`. Assert `log.warn` before `FORBIDDEN` in `updateVendor`. Preserve all existing assertions.

- [x] 10.3 `apps/api/src/modules/bean/service.test.ts` — Rewrite to test real service + add logger spy. Assert `log.debug` entry/exit on all 5 functions. Assert `log.error`/`log.warn` on all throw sites (7 total).

- [x] 10.4 `apps/api/src/modules/setup/service.test.ts` — Rewrite to test real service + add logger spy. Assert `log.debug` entry/exit on all 6 functions. Assert `log.debug` around `clearDefaultForUser` calls. Assert `log.error`/`log.warn` on all throw sites (8 total).

- [x] 10.5 `apps/api/src/modules/coffee-variety/service.test.ts` — Add logger spy (inject via `deps` parameter). Assert `log.debug` entry/exit on 4 remaining functions. Assert cache hit/miss in completion logs. Preserve existing DI-based test structure.

- [x] 10.6 `apps/api/src/modules/preference/service.test.ts` — Rewrite to test real service + add logger spy. Assert `log.debug` entry/exit on `getPreferences` and `updatePreferences`. Assert `log.error` on `PREFERENCES_NOT_FOUND`.

- [x] 10.7 `apps/api/src/modules/taste/service.test.ts` — Add service-level tests + logger spy. Assert `log.debug` entry/exit on all functions. Assert `log.warn` on `QUERY_TOO_SHORT`. Assert cache flush logging after mutations. Preserve existing cache-only tests.

- [x] 10.8 `apps/api/src/modules/qrcode/service.test.ts` — Expand with service tests + logger spy. Assert `log.debug` entry/exit. Assert `log.error` on `RECIPE_NOT_FOUND`. Assert `log.warn` on `RECIPE_NOT_AVAILABLE`.

- [x] 10.9 `apps/api/src/modules/equipment/service.test.ts` — If test file exists, verify JSDoc additions (Phase 8) don't break anything. No logging behavior to test (equipment service already has logging).

## 11. Tests — Update existing web test files with logger assertions (8 files)

- [x] 11.1 `apps/web/src/pages/auth/LoginPage.test.tsx` — Add `const { mockLogger } = vi.hoisted(() => ({ mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));` and `vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));`. Assert `mockLogger.debug` called with `{}, 'LoginPage mounted'` and `{}, 'LoginPage unmounted'`. Preserve all existing assertions.

- [x] 11.2 `apps/web/src/pages/auth/RegisterPage.test.tsx` — Same `vi.hoisted` + `vi.mock` pattern. Assert mount/unmount debug logs. Preserve existing assertions.

- [x] 11.3 `apps/web/src/pages/recipes/RecipeVersionsPage.test.tsx` — Same pattern. Assert mount/unmount. Assert `mockLogger.error` on API failure if catch block exists.

- [x] 11.4 `apps/web/src/pages/equipment/EquipmentCatalogPage.test.tsx` — Same pattern. Assert mount/unmount. Preserve all 23 existing assertions.

- [x] 11.5 `apps/web/src/pages/equipment/EquipmentDetailPage.test.tsx` — Same pattern. Assert mount/unmount. Preserve all 14 existing assertions.

- [x] 11.6 `apps/web/src/pages/coffee-varieties/__tests__/CoffeeVarietiesPage.test.tsx` — Same pattern. Assert mount/unmount. Preserve all 22 existing assertions.

- [x] 11.7 `apps/web/src/pages/coffee-varieties/__tests__/CoffeeVarietyDetailPage.test.tsx` — Same pattern. Assert mount/unmount. Preserve all 14 existing assertions.

- [x] 11.8 `apps/web/src/pages/TasteNotesPage.test.tsx` — Same pattern. Assert mount/unmount. Preserve all 24 existing assertions.

## 12. Verification

- [x] 12.1 Run `make fmt` — all files properly formatted with `deno fmt`
- [x] 12.2 Run `make lint` — zero lint warnings across all workspaces
- [x] 12.3 Run `make check-api` — API type-check passes with no errors
- [x] 12.4 Run `make check-web` — Web type-check passes with no errors
- [x] 12.5 Run `make test` — all tests pass including new logger assertions
- [x] 12.6 Verify no sensitive data appears in log objects (IDs only, no emails/passwords/tokens/payloads)
