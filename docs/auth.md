# Authentication

BrewForm uses JWT-based authentication with separate access and refresh tokens.

## Token Strategy

| Token | Expiry | Storage | Purpose |
|-------|--------|---------|---------|
| Access Token | 15 minutes | Memory (via API client) | Authorize API requests |
| Refresh Token | 7 days | localStorage | Obtain new access tokens |

Access tokens contain the full user identity (`sub`, `email`, `username`, `isAdmin`, `type: 'access'`). Refresh tokens contain only `sub` and `type: 'refresh'`. The `type` discriminator prevents cross-use — an access token cannot be used to refresh, and a refresh token cannot be used to access protected endpoints.

## Registration

```
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

On success, returns `201 Created` with the user object and both tokens. A welcome email is sent asynchronously. Passwords are hashed with bcryptjs (10 rounds).

## Login

```
POST /api/v1/auth/login
```

```json
{ "email": "user@example.com", "password": "securepassword" }
```

On success, returns `200 OK` with user, access token, and refresh token. Banned users receive a `403 USER_BANNED` error.

## Token Refresh

```
POST /api/v1/auth/refresh
```

```json
{ "refreshToken": "..." }
```

Returns a new access token and refresh token pair. The old refresh token is effectively invalidated (JWT statelessness means old tokens remain valid until expiry, but clients should replace them immediately).

## Password Reset

### Step 1: Request Reset

```
POST /api/v1/auth/forgot-password
```

```json
{ "email": "user@example.com" }
```

Always returns `200 OK` regardless of whether the email exists (prevents enumeration). If the email exists, a reset link is sent to the user with a token valid for 1 hour.

### Step 2: Confirm Reset

```
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

| Middleware | Behavior |
|-----------|----------|
| `authMiddleware` | Requires valid `Bearer` token. Rejects expired/invalid tokens, banned users, and soft-deleted users. Sets `userId` and `user` on context. |
| `optionalAuthMiddleware` | Inspects `Bearer` token if present, but does not reject if missing. Sets `userId = null` and `user = null` for anonymous requests. Used for visibility checks (e.g., private recipes visible only to their author). |
| `adminMiddleware` | Must be used **after** `authMiddleware`. Returns `403` if the authenticated user is not an admin. |

## Logout

BrewForm uses stateless JWTs — there is no server-side logout endpoint. The client clears both tokens from localStorage. If a token is compromised before expiry, the admin can ban the user or the token naturally expires.

## Environment Configuration

JWT behaviour is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | **Required.** Cryptographically random, at least 16 characters |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token validity period |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token validity period |

Expiry values use human-readable strings parsed by `parseExpiry()` (`15m`, `1h`, `7d`, etc.).