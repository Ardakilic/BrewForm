## ADDED Requirements

### Requirement: Email send failures are logged without recipient addresses

Every log entry for a failed email send, and for any error caught around one, SHALL pass the error through `toLoggableMailError` from `apps/api/src/utils/errors.ts`, which keeps only the error name, `code`, `command`, `responseCode` and the stack frames for mail errors (database errors go through `toLoggableError`), because nodemailer puts recipient addresses into `message`, `response`, `rejected` and `rejectedErrors[].recipient`.

- This covers `apps/api/src/modules/auth/email.ts`, the verification and password-reset catches in
  `auth/service.ts`, the welcome-email catch in `admin/service.ts`, the notification `sendEmail` in
  `apps/api/src/utils/notify/index.ts` and the contact route.

#### Scenario: A rejected recipient does not reach the logs

- **WHEN** the SMTP server rejects every recipient of a welcome email to `victim@example.com` (nodemailer `EENVELOPE` with `rejected: ['victim@example.com']` and the reply `550 5.1.1 <victim@example.com>` in its message)
- **THEN** the error log entry has `code: 'EENVELOPE'`, `command: 'RCPT TO'` and `responseCode: 550`
- **AND** no log entry contains `victim@example.com`

#### Scenario: Database errors keep the database-safe shape

- **WHEN** the verification-token insert fails during registration with a Drizzle-wrapped Postgres error
- **THEN** the warn log carries the same `err` object `toLoggableError` produces (no query parameters)

## MODIFIED Requirements

### Requirement: AuthContext exposes sessionError and clearSessionError

The `AuthContextType` interface in `apps/web/src/contexts/AuthContext.tsx` (L8-18) SHALL be extended with two new fields:

```typescript
interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionError: 'network' | 'server' | null;  // new
  login: (...) => Promise<void>;
  register: (...) => Promise<void>;
  logout: (leave?: () => Promise<void> | void) => Promise<void>;  // leave runs between the server logout and clearing the user (web-data-loading)
  refreshUser: () => Promise<void>;
  clearSessionError: () => void;  // new
}
```

`sessionError` SHALL be `null` by default, set to `'server'` or `'network'` by `refreshUser`'s catch block per the requirement above, and reset to `null` by `clearSessionError()`. A successful `refreshUser` call (e.g. a manual retry from the banner) SHALL also reset `sessionError` to `null` — this can be done either in the `refreshUser` try block (`setSessionError(null)` on success) or by having `clearSessionError` call `refreshUser`. The preferred approach: set `sessionError = null` at the start of the `try` block in `refreshUser`, so any successful refresh clears the error, and `clearSessionError` is a standalone `() => setSessionError(null)` for the banner's dismiss-without-retry path.

`useAuth()` (L113-118) SHALL return the extended context unchanged in shape — consumers reading `{ user, isLoading }` are unaffected; consumers that want the banner read `{ sessionError, clearSessionError, refreshUser }`.

#### Scenario: sessionError is exposed from useAuth

- **WHEN** a component calls `const { sessionError, clearSessionError } = useAuth()`
- **THEN** `sessionError` is `null`, `'server'`, or `'network'`
- **AND** `clearSessionError` is a function that resets `sessionError` to `null`

#### Scenario: Successful refreshUser clears sessionError

- **WHEN** `sessionError` is `'server'` and `refreshUser()` is called and succeeds
- **THEN** `sessionError` is reset to `null` (and `user` is set to the refreshed user)

### Requirement: Database error logs never contain query parameters or row values

The API SHALL NOT write `DrizzleQueryError` parameters, its parameter-bearing `message`, or `PostgresError` `detail` text to logs, because those values contain user data (emails, usernames, bcrypt password hashes) that the AGENTS.md logging rules forbid.

- Mapped database errors (`4xx`) SHALL be logged at `warn` with only
  `{ requestId, pgCode, constraint, table, method, path }`.
- Unmapped database errors (`500`) SHALL be logged at `error` with a sanitized error object built by
  a helper in `apps/api/src/utils/errors.ts` (`toLoggableError(err)`) that keeps the error name,
  the SQL text without parameters, the SQLSTATE, the constraint name and the stack, and drops
  `params`, `parameters` and `detail`.
- In non-production environments the `500` response message SHALL NOT echo a `DrizzleQueryError`
  message (it embeds parameters); it SHALL use `Database error` instead.
- Every other log entry that carries a caught error which can come from a database query SHALL
  pass it as `err: toLoggableError(err)`: the catches of `notification/service.ts` (its `notify*`
  email helpers swallow mail errors and throw only recipient-lookup errors), the side-effect
  handlers and catches of the comment, recipe and follow services, `evaluateAllBadges`,
  `listAllPublicCollections`, the brew-log service, the `FLUSH_CACHE` audit write, the auth
  middleware, the crawler middleware, the hourly cron job and the `apps/api/src/setup.ts` admin
  bootstrap (a failed admin insert carries the email and the password hash).
  `apps/api/src/utils/db-error-logging.enforcement.test.ts` lists these files and fails when a log
  call in one of them passes a raw `err`; mail-send errors use `toLoggableMailError` instead
  ("Email send failures are logged without recipient addresses").

#### Scenario: Re-registration conflict does not log the password hash

- **WHEN** a user registration insert fails with `23505` on `user_email_unique`
- **THEN** no log line produced for the request contains the submitted email, the username or a bcrypt hash (`$2a$`/`$2b$` prefix)

#### Scenario: Development 500 does not echo parameters

- **WHEN** `APP_ENV=development` and an unmapped `DrizzleQueryError` reaches the handler
- **THEN** the response `error.message` is `Database error` and does not contain the `params:` text

#### Scenario: A failed notification insert does not log its parameters

- **WHEN** the insert of `createFollowNotification` fails with a Drizzle-wrapped error whose message and `params` carry bound values
- **THEN** the `follow notification create failed` entry's `err` equals `toLoggableError` of that error and no logged argument contains a bound value

#### Scenario: A raw caught error in a listed file fails the enforcement test

- **WHEN** a log call in one of the files listed by `db-error-logging.enforcement.test.ts` passes `{ err, … }`
- **THEN** the test fails and names the file and line
