## ADDED Requirements

### Requirement: Service functions log entry and exit at debug level

Every public API service function SHALL emit a `log.debug` call on entry (with relevant identifiers) and a `log.debug` call on successful completion.

#### Scenario: Read function logs entry and exit

- **WHEN** `getProfile(userId)` is called with `userId = "abc123"`
- **THEN** the system SHALL emit `log.debug({ userId: "abc123" }, 'getProfile started')` before any business logic
- **AND** the system SHALL emit `log.debug({ userId: "abc123" }, 'getProfile completed')` before returning the result

#### Scenario: Paginated list function logs total count on exit

- **WHEN** `listBeans(userId, page, perPage)` is called and returns a paginated result with 42 total items
- **THEN** the system SHALL emit `log.debug({ userId, page, perPage }, 'listBeans started')` on entry
- **AND** the system SHALL emit `log.debug({ userId, page, perPage, total: 42 }, 'listBeans completed')` on exit

#### Scenario: Create function logs the new resource ID on exit

- **WHEN** `createBean(userId, data)` successfully creates a bean with id "bean-1"
- **THEN** the system SHALL emit `log.debug({ userId, beanId: "bean-1" }, 'createBean completed')` on exit

### Requirement: Service functions log errors before throwing

Every guard clause that throws an error SHALL emit a `log.error` or `log.warn` call immediately before the `throw` statement, including relevant identifiers and the error reason.

#### Scenario: Not-found error is logged at error level

- **WHEN** `getBean("nonexistent")` is called and the bean is not found
- **THEN** the system SHALL emit `log.error({ id: "nonexistent" }, 'getBean failed: bean not found')`
- **AND** then throw `new Error('BEAN_NOT_FOUND')`

#### Scenario: Forbidden error is logged at warn level

- **WHEN** `updateBean(userId, id, data)` is called and the bean's owner is not the caller
- **THEN** the system SHALL emit `log.warn({ id, userId, ownerId }, 'updateBean failed: forbidden')`
- **AND** then throw `new Error('FORBIDDEN')`

#### Scenario: System-immutable resource error is logged at warn level

- **WHEN** `updateCoffeeVariety(id, data, userId, deps, isAdmin=false)` is called on a system variety by a non-admin
- **THEN** the system SHALL emit `log.warn({ id, userId })` before throwing `SYSTEM_VARIETY_IMMUTABLE`

### Requirement: Content moderation actions log at info level

Service functions that represent significant moderation events (reporting content, resolving reports) SHALL use `log.info` instead of `log.debug` for entry and exit logs.

#### Scenario: Report creation is logged at info level

- **WHEN** `createReport(reporterId, entityType, entityId, reason)` is called
- **THEN** the system SHALL emit `log.info({ reporterId, entityType, entityId }, 'createReport started')` on entry
- **AND** the system SHALL emit `log.info({ reporterId, reportId }, 'createReport completed')` on exit

#### Scenario: Report resolution is logged at info level

- **WHEN** `resolveReport(id, resolvedBy)` successfully resolves a report
- **THEN** the system SHALL emit `log.info({ id, resolvedBy }, 'resolveReport completed')` on exit

### Requirement: Cache-aware functions log cache interactions

Service functions that read from or write to a cache SHALL include cache hit/miss state in their debug logs, and SHALL log debug messages around cache invalidation calls.

#### Scenario: Cache read includes hit/miss in log

- **WHEN** `getHierarchy(cache)` reads from cache and gets a hit
- **THEN** the system SHALL emit `log.debug({ cached: true }, 'getHierarchy completed')` on exit

#### Scenario: Cache flush after mutation is logged

- **WHEN** `createTasteNote(data, cache)` successfully creates a taste note
- **THEN** the system SHALL emit `log.debug({ name }, 'flushing taste note cache after create')` before calling `flushCache(cache)`

#### Scenario: Default-clearing side effect in setup service is logged

- **WHEN** `createSetup(userId, data)` is called with `data.isDefault = true`
- **THEN** the system SHALL emit `log.debug({ userId }, 'createSetup clearing defaults for user')` before calling `model.clearDefaultForUser(userId)`

### Requirement: Logger is module-scoped and follows naming convention

Each service file SHALL import `createLogger` from the API logger utility and instantiate a module-scoped logger using the kebab-case domain name suffixed with `-service`.

#### Scenario: Service logger is created with correct naming

- **WHEN** the `apps/api/src/modules/user/service.ts` file is loaded
- **THEN** the file SHALL contain `import { createLogger } from '../../utils/logger/index.ts'`
- **AND** the file SHALL contain `const log = createLogger('user-service')`

#### Scenario: Logger variable name is consistent

- **WHEN** any API service file defines its logger
- **THEN** the variable name SHALL be `log` (matching existing convention in vendor and coffee-variety services)

### Requirement: DI-pattern services support logging without affecting the deps parameter contract

Services that use dependency injection (e.g., coffee-variety service with `deps?: { cache?, logger? }`) SHALL add logging without altering the `deps` parameter shape in the function signature. The logger SHALL be instantiated at the module scope (outside the function) rather than passed through `deps`, so existing callers are unaffected.

#### Scenario: DI service logger is module-scoped, not injected via deps

- **WHEN** `getCoffeeVarietyById(id, deps?)` is called with or without a `deps` object
- **THEN** the function SHALL use the module-scoped `log` variable rather than reading a logger from `deps`
- **AND** the `deps` parameter type SHALL NOT gain a `logger` field
- **AND** existing test code that constructs `deps` objects SHALL continue to compile without modification

#### Scenario: DI service logger does not interfere with mock dependency injection in tests

- **WHEN** a test injects mock model functions via `deps` in `coffee-variety/service.ts`
- **THEN** the logger SHALL still be the real production logger (or a module-level spy), not passed through `deps`
- **AND** test assertions SHALL spy on the module-level `log` rather than expecting a logger in `deps`

### Requirement: Services with `data: any` parameters never log the data object

Service functions whose parameters include `data: any` (bean service `createBean`/`updateBean`, setup service `createSetup`, preference service `updatePreferences`) SHALL emit entry/exit debug logs that include only traceable identifiers (userId, id, name, etc.) and SHALL never include the `data` object or any of its properties in log context objects.

#### Scenario: createBean logs only userId and beanId, never the data payload

- **WHEN** `createBean(userId, data)` is called with `data = { name: "Ethiopian Yirgacheffe", roaster: "Blue Bottle", ... }`
- **THEN** the system SHALL emit `log.debug({ userId }, 'createBean started')` on entry
- **AND** SHALL emit `log.debug({ userId, beanId: result.id }, 'createBean completed')` on exit
- **AND** SHALL NOT include `data` or any of its keys as top-level log context fields

#### Scenario: updateBean logs only userId and id, never the data payload

- **WHEN** `updateBean(userId, id, data)` is called with `data = { name: "Updated Name" }`
- **THEN** the system SHALL emit `log.debug({ userId, id }, 'updateBean started')` on entry
- **AND** SHALL NOT log `data.name` or any other property from the `data` object

#### Scenario: createSetup logs only userId and setupId, never the data payload

- **WHEN** `createSetup(userId, data)` is called with `data = { name: "V60", isDefault: true, ... }`
- **THEN** the system SHALL emit `log.debug({ userId }, 'createSetup started')` on entry
- **AND** SHALL NOT include `data` or any of its keys as top-level log context fields

### Requirement: Services with async side effects log the side effect execution

Service functions that trigger async side effects such as `clearDefaultForUser` (setup service) or `flushCache` (taste service) SHALL emit a `log.debug` call immediately before executing each side effect, and SHALL include relevant identifiers in the log context.

#### Scenario: setDefault logs the clearDefaultForUser side effect before executing it

- **WHEN** `setDefault(userId, id)` is called and the setup passes ownership and existence guards
- **THEN** the system SHALL emit `log.debug({ userId }, 'setDefault clearing previous defaults')` before calling `model.clearDefaultForUser(userId)`
- **AND** the side effect SHALL execute after the log call

#### Scenario: updateSetup logs the clearDefaultForUser side effect when isDefault is true

- **WHEN** `updateSetup(userId, id, data)` is called with `data.isDefault = true`
- **THEN** the system SHALL emit `log.debug({ userId }, 'updateSetup clearing defaults for user')` before calling `model.clearDefaultForUser(userId)`

#### Scenario: createTasteNote logs the cache flush side effect

- **WHEN** `createTasteNote(data, cache)` successfully inserts a new taste note
- **THEN** the system SHALL emit `log.debug({ name: data.name }, 'flushing taste note cache after create')` before calling `flushCache(cache)`

#### Scenario: updateTasteNote logs the cache flush side effect

- **WHEN** `updateTasteNote(id, data, cache)` successfully updates a taste note
- **THEN** the system SHALL emit `log.debug({ id }, 'flushing taste note cache after update')` before calling `flushCache(cache)`

#### Scenario: deleteTasteNote logs the cache flush side effect

- **WHEN** `deleteTasteNote(id, cache)` successfully soft-deletes a taste note
- **THEN** the system SHALL emit `log.debug({ id }, 'flushing taste note cache after delete')` before calling `flushCache(cache)`

#### Scenario: flushCache itself logs entry and exit

- **WHEN** `flushCache(cache)` (the private function in taste service) is called
- **THEN** the system SHALL emit `log.debug({}, 'flushCache started')` on entry
- **AND** SHALL emit `log.debug({}, 'flushCache completed')` on exit after all cache keys are deleted

### Requirement: Vendor service needs only error-path logging added, not duplicate entry/exit

The vendor service (`apps/api/src/modules/vendor/service.ts`) already has a logger and `log.debug` entry/exit calls on all 6 public functions. The logging expansion SHALL add only error-path logging (`log.error` and `log.warn`) before existing throw sites; it SHALL NOT add duplicate entry or exit `log.debug` calls.

#### Scenario: getVendor gains error logging without duplicate entry/exit

- **WHEN** `getVendor("nonexistent")` is called and the vendor is not found
- **THEN** the system SHALL emit `log.error({ id: "nonexistent" }, 'getVendor failed: vendor not found')` before throwing `VENDOR_NOT_FOUND`
- **AND** the existing `log.debug` entry/exit calls SHALL remain unchanged

#### Scenario: updateVendor gains error and warn logging without duplicate entry/exit

- **WHEN** `updateVendor(userId, id, data)` is called by a non-creator, non-admin user
- **THEN** the system SHALL emit `log.warn({ id, userId }, 'updateVendor failed: forbidden (not creator and not admin)')` before throwing `FORBIDDEN`
- **AND** the existing `log.debug` entry/exit calls SHALL remain unchanged

#### Scenario: deleteVendor gains error logging without duplicate entry/exit

- **WHEN** `deleteVendor("nonexistent")` is called and the vendor is not found
- **THEN** the system SHALL emit `log.error({ id: "nonexistent" }, 'deleteVendor failed: vendor not found')` before throwing `VENDOR_NOT_FOUND`
- **AND** the existing `log.debug` entry/exit calls SHALL remain unchanged

#### Scenario: listVendors remains unchanged — no error paths to log

- **WHEN** `listVendors()` is called (a read function with no throw sites)
- **THEN** the existing `log.debug` entry/exit calls SHALL remain the only log statements
- **AND** no new log calls SHALL be added to `listVendors`

### Requirement: Report service moderation actions use log.info not log.debug

The report service functions `createReport` and `resolveReport` represent content moderation actions — significant events that SHOULD be visible at production log levels. These functions SHALL use `log.info` for their entry and exit logs instead of `log.debug`. The read-only `listReports` function SHALL continue to use `log.debug`.

#### Scenario: createReport logs at info level with all entity identifiers

- **WHEN** `createReport(reporterId, entityType, entityId, reason)` is called with `reporterId = "user-1"`, `entityType = "recipe"`, `entityId = "recipe-42"`
- **THEN** the system SHALL emit `log.info({ reporterId, entityType, entityId }, 'createReport started')` on entry
- **AND** SHALL emit `log.info({ reporterId, entityType, entityId, reportId: result.id }, 'createReport completed')` on exit
- **AND** SHALL NOT include the `reason` string in log context (may contain user-submitted content)

#### Scenario: resolveReport logs at info level for successful resolution

- **WHEN** `resolveReport(id, resolvedBy)` successfully resolves a pending report
- **THEN** the system SHALL emit `log.info({ id, resolvedBy }, 'resolveReport started')` on entry
- **AND** SHALL emit `log.info({ id, resolvedBy }, 'resolveReport completed')` on exit

#### Scenario: resolveReport failure paths still use error/warn

- **WHEN** `resolveReport(id, resolvedBy)` is called for a report that does not exist
- **THEN** the system SHALL emit `log.error({ id, resolvedBy }, 'resolveReport failed: report not found')` before throwing `REPORT_NOT_FOUND`
- **AND** the entry log SHALL still be at `log.info` level

#### Scenario: listReports continues to use log.debug

- **WHEN** `listReports(status, page, perPage)` is called for administrative listing
- **THEN** the system SHALL emit `log.debug({ status, page, perPage }, 'listReports started')` on entry
- **AND** SHALL emit `log.debug({ status, page, perPage, total: result.total }, 'listReports completed')` on exit
