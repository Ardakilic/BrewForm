# Authentication

BrewForm uses JWT-based authentication with separate access and refresh tokens.

## Token Strategy

| Token         | Expiry     | Storage                 | Purpose                  |
| ------------- | ---------- | ----------------------- | ------------------------ |
| Access Token  | 15 minutes | Memory (via API client) | Authorize API requests   |
| Refresh Token | 7 days     | localStorage            | Obtain new access tokens |

Access tokens contain the full user identity (`sub`, `email`, `username`, `isAdmin`,
`type: 'access'`). Refresh tokens contain only `sub` and `type: 'refresh'`. The `type` discriminator
prevents cross-use — an access token cannot be used to refresh, and a refresh token cannot be used
to access protected endpoints.

## Registration

```text
POST /api/v1/auth/register
```

```json
{
  "email": "user@example.com",
  "username": "brewmaster",
  "password": "securepassword",
  "displayName": "Brew Master"
}
```

On success, returns `201 Created` with the user object and both tokens. A welcome email is sent
asynchronously. Passwords are hashed with bcryptjs (10 rounds).

### Registration Disabled

When the `ENABLE_REGISTRATION` environment variable is set to `false`, the register endpoint returns
a `403 Forbidden` response:

```json
{
  "success": false,
  "error": {
    "code": "REGISTRATION_DISABLED",
    "message": "New account registration is currently disabled",
    "requestId": "req_abc123"
  }
}
```

A structured warning log is also emitted (with IP from `x-forwarded-for` or `x-real-ip` when
available) for observability.

## Registration Status

```text
GET /api/v1/auth/registration-status
```

Public endpoint — no authentication required. Returns whether the server currently accepts new
account registrations:

```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

The frontend uses this endpoint to conditionally render the registration UI:

| Status   | RegisterPage                                                                      | Navbar                     |
| -------- | --------------------------------------------------------------------------------- | -------------------------- |
| Enabled  | Shows the registration form                                                       | Shows "Sign Up" link       |
| Disabled | Shows a friendly closed message with a link to the login page                     | Hides "Sign Up" link       |
| Loading  | Shows a centered "Loading..." indicator                                           | Assumes enabled (shows form & link until status resolves) |
| Error    | Falls back to enabled (API unreachable — shows the registration form)             | Falls back to enabled      |

The Navbar fetches registration status only for unauthenticated users; authenticated users always
see the full navigation regardless of the flag.

## Login

```text
POST /api/v1/auth/login
```

```json
{ "email": "user@example.com", "password": "securepassword" }
```

On success, returns `200 OK` with user, access token, and refresh token. Banned users receive a
`403 USER_BANNED` error.

## Token Refresh

```text
POST /api/v1/auth/refresh
```

```json
{ "refreshToken": "..." }
```

Returns a new access token and refresh token pair. The old refresh token is effectively invalidated
(JWT statelessness means old tokens remain valid until expiry, but clients should replace them
immediately).

## Password Reset

### Step 1: Request Reset

```text
POST /api/v1/auth/forgot-password
```

```json
{ "email": "user@example.com" }
```

Always returns `200 OK` regardless of whether the email exists (prevents enumeration). If the email
exists, a reset link is sent to the user with a token valid for 1 hour.

### Step 2: Confirm Reset

```text
POST /api/v1/auth/reset-password
```

```json
{ "token": "...", "password": "newSecurePassword" }
```

Validates that the token:

- Exists in the database
- Has not expired
- Has not been used

On success, the password is updated and the token is marked as used.

## Middleware

Three middleware functions control access:

| Middleware               | Behavior                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authMiddleware`         | Requires valid `Bearer` token. Rejects expired/invalid tokens, banned users, and soft-deleted users. Sets `userId` and `user` on context.                                                                           |
| `optionalAuthMiddleware` | Inspects `Bearer` token if present, but does not reject if missing. Sets `userId = null` and `user = null` for anonymous requests. Used for visibility checks (e.g., private recipes visible only to their author). |
| `adminMiddleware`        | Must be used **after** `authMiddleware`. Returns `403` if the authenticated user is not an admin.                                                                                                                   |

## Logout

BrewForm uses stateless JWTs — there is no server-side logout endpoint. The client clears both
tokens from localStorage. If a token is compromised before expiry, the admin can ban the user or the
token naturally expires.

## Environment Configuration

JWT behaviour is configured via environment variables:

| Variable             | Default | Description                                                    |
| -------------------- | ------- | -------------------------------------------------------------- |
| `JWT_SECRET`         | —       | **Required.** Cryptographically random, at least 16 characters |
| `JWT_ACCESS_EXPIRY`  | `15m`   | Access token validity period                                   |
| `JWT_REFRESH_EXPIRY` | `7d`    | Refresh token validity period                                  |
| `ENABLE_REGISTRATION` | `true`  | When `false`, `POST /auth/register` returns `403 REGISTRATION_DISABLED`, `GET /auth/registration-status` returns `{ enabled: false }`, the RegisterPage shows a closed message with login link, and the Navbar hides the "Sign Up" link. Existing users can still log in, refresh tokens, and reset passwords — only new account creation is blocked. |

Expiry values use human-readable strings parsed by `parseExpiry()` (`15m`, `1h`, `7d`, etc.).

## Username Uniqueness Strategy

| Scenario | Behavior |
|----------|----------|
| **Self-registration** (`POST /auth/register`) | User provides username. If taken → `409 CONFLICT "Username is already taken"`. No auto-suffix. |
| **Admin create** (explicit username) | Admin provides username. If taken → `409 CONFLICT "Username is already taken"`. No auto-suffix. |
| **Admin edit** (change username) | Checked against all non-deleted users excluding self. If taken → `409 CONFLICT "Username is already taken by another user"`. |
| **Admin edit** (same username) | No-op. Allowed without error. |
| **Future: OAuth/social login** | `generateUniqueUsername()` utility in `@brewform/shared`: tries base name from email prefix, appends `-1`, `-2` etc. on conflict. Max 100 attempts. |
| **Soft-deleted users** | Their usernames are freed for reuse. Uniqueness checks always filter `deletedAt IS NULL`. |

Registration validates username uniqueness via `isUsernameTaken()`, which queries for an existing non-deleted user with the same username. A duplicate returns `409 CONFLICT`:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Username already taken",
    "requestId": "req_abc123"
  }
}
```

Both `isUsernameTaken()` and `isEmailTaken()` helpers are used across the codebase for uniqueness checks. They always apply a `deletedAt IS NULL` filter, ensuring soft-deleted accounts do not block username or email reuse.

For future OAuth flows, `@brewform/shared` exports `generateUniqueUsername(baseUsername)` which creates a unique username by appending a suffix if the base is taken. This handles the edge case where an OAuth provider's username conflicts with an existing user.
