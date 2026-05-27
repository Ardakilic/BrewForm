## JWT Token Strategy

| Token | Expiry | Payload |
|-------|--------|---------|
| Access | 15 min | `sub`, `email`, `username`, `isAdmin`, `type: 'access'` |
| Refresh | 7d (default) | `sub`, `type: 'refresh'` |
| Refresh (rememberMe) | 180d | same as refresh |

- `type` discriminator prevents cross-use — access token cannot refresh, refresh token cannot access.
- HS256, same `JWT_SECRET` for all tokens.
- Stateless: no server-side session, no revocation. Mitigated by short access TTL + ban check at authMiddleware.

## Middleware

- `authMiddleware` — rejects expired/invalid tokens, banned users (`isBanned`), soft-deleted users. Sets `userId`, `user` on Hono context.
- `optionalAuthMiddleware` — same logic but yields `userId=null` when header absent/invalid. Used for visibility-gated routes (drafts visible only to author).
- `adminMiddleware` — after `authMiddleware`. Returns 403 unless `user.isAdmin`.

## Registration

- `ENABLE_REGISTRATION=false` returns 403 `REGISTRATION_DISABLED`. Checked via `GET /auth/registration-status`.
- Passwords: bcryptjs, 10 rounds.
- Welcome email sent fire-and-forget.

## Password Reset

- `POST /auth/forgot-password` always returns 200 (prevents email enumeration).
- Token stored in DB with 1h expiry, marked `usedAt` on consumption. Three error codes: `INVALID_RESET_TOKEN` (not found), `TOKEN_EXPIRED`, `TOKEN_USED`.
- Reset replaces password hash, marks token used, sends confirmation email.

## Remember Me

- `rememberMe` flag on login/refresh requests `JWT_REMEMBER_ME_EXPIRY` (180d via env) instead of `JWT_REFRESH_EXPIRY` (7d).
- Frontend persists `brewform_remember_me` flag in localStorage, sends with every refresh call.
- Access token always 15min regardless of flag; only refresh token duration changes.
- Logout clears the flag.
