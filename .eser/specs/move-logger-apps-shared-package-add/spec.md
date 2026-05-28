# Spec: move-logger-apps-shared-package-add

## Status: executing

## Concerns: well-engineered, beautiful-product, open-source

## Discovery Answers

### status_quo

API has minimal pino-based logs in 4 files only. Web has zero logging. No correlation between API and web logs. Debugging production issues is painful — the system is barely observable.

_-- Arda Kilicdagi_

### ambition

1-star MVP: Logger interface in @brewform/shared. Pino impl stays in API. Console wrapper in web with VITE_LOG_LEVEL. Session ID on web passed as X-Request-ID to API. Key logs in services and pages. Tests for both loggers. 10-star ideal: Full observability with Grafana Loki, OpenTelemetry tracing, Sentry error monitoring, performance metrics.

_-- Arda Kilicdagi_

### reversibility

Fully reversible. No data migrations, no schema changes, no API contract changes. Import path updates are tedious but safe. Logger interface can be extended without breaking consumers.

_-- Arda Kilicdagi_

### user_impact

Zero end-user impact. No UI changes. No API contract changes. Devs need to know new import path (@brewform/shared/logger). New VITE_LOG_LEVEL env var for web. No breaking changes.

_-- Arda Kilicdagi_

### verification

Unit tests for both loggers (API pino + web console wrapper). Web logger tests: level filtering, sessionId binding, module binding. Integration test: X-Request-ID header in web API calls. Update import paths in ~5 existing API test files. Not testing: console output formatting, actual pino output.

_-- Arda Kilicdagi_

### scope_boundary

OUT: Full coverage logs. OUT: Web JSON logging. OUT: Log aggregation. OUT: OpenTelemetry. OUT: Performance metrics. OUT: New dependencies. IN: Logger interface in shared, pino in API, console wrapper in web, session ID + X-Request-ID, key logs in services/pages, tests for all.

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

## Accessibility (beautiful-product)

_To be addressed during execution._

## Out of Scope

- OUT: Full coverage logs
- OUT: Web JSON logging
- OUT: Log aggregation
- OUT: OpenTelemetry
- OUT: Performance metrics
- OUT: New dependencies
- IN: Logger interface in shared, pino in API, console wrapper in web, session ID + X-Request-ID, key logs in services/pages, tests for all.

## Tasks

- [x] task-1: Create shared logger interface in packages/shared/src/logger/types.ts — define Logger interface with methods: info, debug, trace, warn, error, fatal — and createLogger factory function type. Add logger module export to shared package.
- [x] task-2: Move pino logger implementation to apps/api/src/utils/logger/ — update to implement shared Logger interface, keep existing redaction and transport config. Keep config import from API config.
- [x] task-3: Create web logger implementation in apps/web/src/utils/logger.ts — console-based Logger implementing shared interface. Support VITE_LOG_LEVEL env var for log level filtering. Skip JSON formatting (use console methods directly).
- [x] task-4: Add session ID generation on web side — create apps/web/src/utils/sessionId.ts with crypto.randomUUID(). Pass as X-Request-ID header in all API calls via apps/web/src/api/client.ts.
- [x] task-5: Add key log points — API: entry/exit/error logs in services (auth, recipe, equipment, admin). Web: mount/unmount/error logs in main pages (Home, Recipes, Auth).
- [x] task-6: Write tests — move and update API logger tests (apps/api/src/utils/logger/logger.test.ts), create web logger tests (apps/web/src/utils/logger.test.ts), verify X-Request-ID in client.test.ts.
- [x] task-7: Update all imports — replace all references to old logger path (apps/api/src/utils/logger) with new paths. Update vite.config.ts and vitest.config.ts with new alias if needed.
- [x] task-8: Update documentation — add logging documentation in docs/ covering: shared Logger interface, API pino usage, web console logger usage, VITE_LOG_LEVEL env var, session ID / X-Request-ID for tracing. Update Serena memories (.serena/memories) reflecting new logger architecture.
- [ ] task-9: Final verification — run make fmt, make lint, make test. Create pr_description.md.

## Verification

- Unit tests for both loggers (API pino + web console wrapper)
- Web logger tests: level filtering, sessionId binding, module binding
- Integration test: X-Request-ID header in web API calls
- Update import paths in ~5 existing API test files
- Not testing: console output formatting, actual pino output.

## Transition History

| From | To | User | Timestamp | Reason |
|------|----|------|-----------|--------|
| IDLE | DISCOVERY | Arda Kilicdagi | 2026-05-28T22:45:49.661Z | - |
