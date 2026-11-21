## MODIFIED Requirements

### Requirement: Cache-aware functions log cache interactions

Service functions that read from or write to a cache SHALL include cache hit/miss state in their debug logs, and SHALL log debug messages around cache invalidation calls.

#### Scenario: Cache read includes hit/miss in log

- **WHEN** `getHierarchy(cache)` reads from cache and gets a hit
- **THEN** the system SHALL emit `log.debug({ cached: true }, 'getHierarchy completed')` on exit

#### Scenario: Cache flush after mutation is logged

- **WHEN** `createTasteNote(data, cache)` successfully creates a taste note
- **THEN** the system SHALL emit `log.debug({ name }, 'flushing taste note cache after create')` before calling `flushCache(cache)`

### Requirement: Services with async side effects log the side effect execution

Service functions that trigger async side effects such as `flushCache` (taste service) SHALL emit a `log.debug` call immediately before executing each side effect, and SHALL include relevant identifiers in the log context. Work that a model performs inside its own transaction (for example the setup default switch in `setup/model.ts`) is not a service side effect and SHALL NOT get a separate service log line.

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

#### Scenario: Setup default switch logs only entry and exit

- **WHEN** `setDefault(userId, id)` succeeds
- **THEN** the setup service emits exactly the `setDefault started` and `setDefault completed` debug logs
