# Authentication

BrewForm uses JWT-based authentication with separate access and refresh tokens, delivered as
httpOnly cookies.

## Token Strategy

| Token | JWT expiry | Cookie | Purpose |
| --- | --- | --- | --- |
| Access token | `JWT_ACCESS_EXPIRY` (default 15 minutes) | `brewform_access_token`, path `/`, max-age 15 min | Authorize API requests |
| Refresh token | `JWT_REFRESH_EXPIRY` (default 7 days) | `brewform_refresh_token`, path `/api/v1/auth`, max-age 7 days | Obtain new tokens |
| Refresh token (Remember Me) | `JWT_REMEMBER_ME_EXPIRY` (default 180 days) | same cookie, max-age 180 days | Long-lived session when the checkbox is checked |

Both cookies are `httpOnly`, `SameSite=Strict`, and `Secure` when `APP_ENV=production`. The
register, login and refresh responses set the cookies and return only the user object; tokens are
never in the response body, and the web app never stores them itself.

The auth middleware reads the access token from the `brewform_access_token` cookie first, then from
an `Authorization: Bearer <token>` header (for API clients and tests).

Access tokens contain the user identity (`sub`, `email`, `username`, `isAdmin`, `type: 'access'`).
Refresh tokens contain only `sub` and `type: 'refresh'`. The `type` discriminator prevents
cross-use: an access token cannot be used to refresh, and a refresh token cannot be used to access
protected endpoints.

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

On success, returns `201 Created` with the user object and sets both cookies. A verification email
is sent (a failure to send is logged and does not fail the registration). Passwords are hashed with
bcryptjs (10 rounds). Rate limit: 5 requests per hour per client IP (`auth-register-ip`).

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

A structured warning log (`Registration attempt while disabled`) is also emitted for observability.
It carries no IP address or other client data (see [logging.md](logging.md)); the `requestId` of the
response correlates it with the request.

## Registration Status

```text
GET /api/v1/auth/registration-status
```

Public endpoint, no authentication required. Returns whether the server currently accepts new
account registrations:

```json
{
  "success": true,
  "data": {
    "enabled": true
  }
}
```

The web app's root route loader (`apps/web/src/routes/root.ts`) reads it once per page load, and
the Navbar and RegisterPage read the result with `useRouteLoaderData('root')`:

| Status | RegisterPage | Navbar |
| --- | --- | --- |
| Enabled | Shows the registration form | Shows the "Sign Up" link |
| Disabled | Shows a friendly closed message with a link to the login page | Hides the "Sign Up" link |
| Error | Falls back to enabled (the failure is logged; shows the registration form) | Falls back to enabled |

## Login

```text
POST /api/v1/auth/login
```

```json
{ "email": "user@example.com", "password": "securepassword" }
```

To request a long-lived session:

```json
{ "email": "user@example.com", "password": "securepassword", "rememberMe": true }
```

When `rememberMe` is `true`, the refresh token is signed with `JWT_REMEMBER_ME_EXPIRY` (default:
`180d` ≈ 6 months) instead of the standard `JWT_REFRESH_EXPIRY` (default: `7d`).

On success, returns `200 OK` with the user and sets both cookies. Invalid credentials return
`401 INVALID_CREDENTIALS`; banned users receive `403 USER_BANNED`.

### Login rate limits

Login is limited per IP and per account (capability `api-rate-limiting`; policies in
`apps/api/src/utils/rate-limit/policies.ts`):

| Policy | Keyed on | Limit | Counts |
| --- | --- | --- | --- |
| `auth-login-ip` | client IP | 20 per 15 min | every request |
| `auth-login-fail-ip` | client IP | 100 per 24 h | failed logins only |
| `auth-login-fail-account-ip` | account email + client IP | 5 per 15 min | failed logins only; reset by a successful login |
| `auth-login-fail-account` | account email | 20 per hour | failed logins only |

- The failure-only policies take a point before the handler and give it back unless the login
  returns `401`, so parallel attempts cannot exceed the limit. Over a limit, the request gets
  `429 RATE_LIMITED` with `Retry-After`.
- Five wrong passwords lock that account from that IP for the window; other IPs are unaffected
  until the per-account cap (20 failures per hour from any IP) is reached.
- Unknown emails are counted exactly like existing accounts and get the same `429`, so the limiter
  does not reveal whether an account exists.
- A successful password reset clears both per-account counters, giving a locked-out owner a way
  back in.
- Email keys are stored as a SHA-256 prefix of the normalised address, never the address. The client
  IP comes from `getClientIp`, which honours `TRUST_PROXY` (`none`, `hops` or `cloudflare`).

## Token Refresh

```text
POST /api/v1/auth/refresh
```

The refresh token is read from a JSON body (`{ "refreshToken": "..." }`) or, if the body has none,
from the `brewform_refresh_token` cookie (the web app relies on the cookie). Returns the user and
sets a new access and refresh token pair. The old refresh token stays valid until it expires (JWTs
are stateless), so clients replace it immediately.

## Remember Me

The login endpoint accepts an optional `rememberMe` boolean to request a long-lived refresh token.

| `rememberMe` | Refresh token expiry | Session duration |
| --- | --- | --- |
| `true` | `JWT_REMEMBER_ME_EXPIRY` (default 180d) | ~6 months |
| `false` / omitted | `JWT_REFRESH_EXPIRY` (default 7d) | 7 days |

A refresh keeps the session type: the server recognises a long-lived refresh token by its lifetime
(`isLongLivedRefreshToken`) and issues a new long-lived one, so nothing is stored in the browser.

The access token expiry (`15m`) is **unaffected** by `rememberMe`; access tokens stay short-lived.

Security considerations:

- The same HS256 signing key (`JWT_SECRET`) is used for all tokens.
- Each refresh returns a new access and refresh token pair.
- No server-side session state is kept (stateless JWT), so a compromised token stays valid until it
  expires (no revocation).

## Email Verification

Registration sends a verification link (`/verify-email?token=…`, valid for 24 hours). Tokens are
stored hashed.

| Endpoint | Purpose | Rate limit |
| --- | --- | --- |
| `POST /api/v1/auth/send-verification` (auth) | Resend the link to the signed-in, unverified user | 10 per hour per IP; 1 per minute and 5 per day per user |
| `POST /api/v1/auth/verify-email` | Consume a token (`{ "token": "..." }`) | 10 per 15 min per IP, shared with reset-password |

### The verification gate

Content other people can see requires a verified email. These routes return
`403 EMAIL_NOT_VERIFIED` ("Please verify your email to perform this action") for an unverified
account:

- `POST /api/v1/recipes` (create)
- `POST /api/v1/recipes/merge`
- `PATCH /api/v1/recipes/:id` (update, including any visibility change)
- `POST /api/v1/comments/recipe/:recipeId` (create a comment)

`POST /api/v1/recipes/:id/fork` is not gated, because a fork is always created as a `draft`.
Publishing it needs `PATCH`, which is gated, so an unverified account cannot publish through a
fork. Personal state is not gated: private recipe notes, likes, ratings, favourites, collections
and brew logs.

## Password Reset

### Step 1: Request Reset

```text
POST /api/v1/auth/forgot-password
```

```json
{ "email": "user@example.com" }
```

Always returns `200 OK` regardless of whether the email exists (prevents enumeration). If the email
exists, a reset link is sent with a token valid for 1 hour. Rate limit: 5 per 15 minutes per IP and
3 per hour per email address.

### Step 2: Confirm Reset

```text
POST /api/v1/auth/reset-password
```

```json
{ "token": "...", "newPassword": "newSecurePassword" }
```

Validates that the token:

- Exists in the database
- Has not expired
- Has not been used

On success, the password is updated, the token is marked as used, and the account's login-failure
counters are cleared. Rate limit: 10 per 15 minutes per IP, shared with verify-email.

## Middleware

Three middleware functions in `apps/api/src/middleware/auth.ts` control access:

| Middleware | Behavior |
| --- | --- |
| `authMiddleware` | Requires a valid access token (cookie or `Bearer` header). Rejects expired or invalid tokens, banned users and soft-deleted users. Sets `userId` and `user` on the context. |
| `optionalAuthMiddleware` | Inspects a token if present but does not reject when it is missing. Sets `userId = null` and `user = null` for anonymous requests. Used for visibility checks (e.g. private recipes visible only to their author). |
| `adminMiddleware` | Must run **after** `authMiddleware`. Returns `403` if the authenticated user is not an admin. |

## Logout

```text
POST /api/v1/auth/logout
```

Clears both auth cookies; no token is required. Because JWTs are stateless, a token copied before
logout stays valid until it expires; if one is compromised, an admin can ban the user.

In the web app, signing out (`useSignOut()`) lands on `/` before the session store clears the user.
Other open tabs follow: they leave the page for `/` and re-read the session.

## Environment Configuration

JWT behaviour is configured via environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | — | **Required.** Cryptographically random, at least 16 characters |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token validity period |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token validity period |
| `JWT_REMEMBER_ME_EXPIRY` | `180d` | Refresh token expiry when `rememberMe` is `true`. Supports s/m/h/d/M suffixes. M = 30 days. |
| `ENABLE_REGISTRATION` | `true` | When `false`, `POST /auth/register` returns `403 REGISTRATION_DISABLED`, `GET /auth/registration-status` returns `{ enabled: false }`, the RegisterPage shows a closed message with a login link, and the Navbar hides the "Sign Up" link. Existing users can still log in, refresh tokens and reset passwords; only new account creation is blocked. |

Expiry values use human-readable strings parsed by `parseExpiry()` (`15m`, `1h`, `7d`, etc.). The
cookie max-ages are fixed (15 minutes, 7 days, 180 days), so keep the JWT expiries at or below
them.

## Username and Email Uniqueness

Emails and usernames are unique **case-insensitively** and **across soft-deleted accounts**: the
`user_email_lower_unique` and `user_username_lower_unique` indexes on `lower(<column>)` cover every
row, so a deleted account's identifiers stay reserved and nobody inherits its profile links or
mentions. Emails are stored lower-cased; usernames keep the case the user chose.

| Scenario | Behavior |
| --- | --- |
| **Self-registration** (`POST /auth/register`) | User provides username. If taken (in any case, by any account) or reserved → `409 CONFLICT "Username already taken"`; a taken email → `409 CONFLICT "Email already registered"`. No auto-suffix. |
| **Admin create** (explicit username) | If taken → `409 CONFLICT "Username is already taken."`. No auto-suffix. |
| **Admin edit** (change username) | Checked against every other user row. If taken → `409 CONFLICT "Username is already taken by another user."`. |
| **Admin edit** (same username) | No-op. Allowed without error. |
| **Future: OAuth/social login** | `generateUniqueUsername()` utility in `@brewform/shared`: tries a base name from the email prefix, appends `-1`, `-2` etc. on conflict. Max 100 attempts. |
| **Soft-deleted users** | Their email and username stay reserved. |

Registration checks availability with `isEmailTaken()` and `isUsernameTaken()` in
`apps/api/src/modules/auth/model.ts`, which compare `lower(column)` against every user row,
soft-deleted ones included, so they agree with the unique indexes and answer `409` before the
insert. A conflict that still reaches the insert (two simultaneous registrations) is mapped from the
unique-constraint error to the same `409`:

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
