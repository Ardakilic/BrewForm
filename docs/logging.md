# Logging

BrewForm uses structured logging across both the API (Deno/Hono) and web (React/Vite) applications with a shared Logger interface for consistency.

## Architecture

- **Shared interface**: `@brewform/shared/logger` defines `Logger`, `ChildLogger`, and `CreateLogger` types
- **API implementation**: pino (`apps/api/src/utils/logger/`) — structured JSON logging with redaction
- **Web implementation**: Console-based (`apps/web/src/utils/logger.ts`) — browser console with log level filtering

## API Logger (pino)

- Located at `apps/api/src/utils/logger/index.ts`
- Configuration via API env vars:
  - `LOG_LEVEL` — minimum log level (trace, debug, info, warn, error, fatal). Default: `info`
  - `LOG_FORMAT` — output format (`json` or `pretty`). Default: `json`
- Redaction: Sensitive fields (password, passwordHash, token, secret, apiKey, authorization) are automatically redacted
- Usage:
  ```typescript
  import { createLogger } from './utils/logger/index.ts';
  const log = createLogger('module-name');
  log.info({ userId }, 'User logged in');
  log.error({ err }, 'Operation failed');
  ```

## Web Logger (Console)

- Located at `apps/web/src/utils/logger.ts`
- Configuration via Vite env vars:
  - `VITE_LOG_LEVEL` — minimum log level. Default: `info`
- Implements the shared `Logger` interface using browser console methods
- Usage:
  ```typescript
  import { createLogger } from '@/utils/logger.ts';
  const log = createLogger('ComponentName');
  log.info({ userId }, 'Component mounted');
  ```

## Request Tracing

- API uses `hono/request-id` middleware to generate/accept `X-Request-ID` headers
- Web generates a per-page-load session ID (`apps/web/src/utils/sessionId.ts`) via `crypto.randomUUID()`
- Web API client (`apps/web/src/api/client.ts`) sends `X-Request-ID` header on all requests
- Response envelopes include `requestId` in `meta` and `error` objects for correlation

## Adding Logging

When adding new features, follow these conventions:

1. Create a module logger: `const log = createLogger('module-name');`
2. Log at appropriate levels:
   - `trace` — very detailed debugging
   - `debug` — function entry/exit
   - `info` — significant events (startup, connections)
   - `warn` — recoverable issues
   - `error` — operation failures
   - `fatal` — unrecoverable errors
3. Never log sensitive data (passwords, tokens, PII)
4. Include context in log objects (IDs, request info) for traceability
