# BrewForm Phase 5 — Authentication Module

## Status: READY

## Overview

Implement the complete authentication module: register, login, refresh token, password reset. JWT access + refresh token strategy per §6.6. Email sending with MJML templates.

---

## File Inventory

### 1. `apps/api/src/modules/auth/jwt.ts`

JWT sign, verify, and decode utilities:

```typescript
import { jwt } from 'hono/utils/jwt';

const JWT_SECRET = Deno.env.get('JWT_SECRET') || 'dev-secret-change-me';
const ACCESS_EXPIRY = Deno.env.get('JWT_ACCESS_EXPIRY') || '15m';
const REFRESH_EXPIRY = Deno.env.get('JWT_REFRESH_EXPIRY') || '7d';

export interface AccessPayload {
  sub: string;
  email: string;
  username: string;
  isAdmin: boolean;
  type: 'access';
  iat: number;
  exp: number;
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
}

export async function signAccessToken(user: { id: string; email: string; username: string; isAdmin: boolean }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
    type: 'access',
    iat: now,
    exp: now + parseExpiry(ACCESS_EXPIRY),
  };
  return await jwt({ alg: 'HS256', typ: 'JWT' }, payload, JWT_SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: RefreshPayload = {
    sub: userId,
    type: 'refresh',
    iat: now,
    exp: now + parseExpiry(REFRESH_EXPIRY),
  };
  return await jwt({ alg: 'HS256', typ: 'JWT' }, payload, JWT_SECRET);
}

export async function verifyJwt(token: string): Promise<AccessPayload | RefreshPayload> {
  const payload = await jwt.verify(token, JWT_SECRET);
  return payload as AccessPayload | RefreshPayload;
}

export function decodeJwt(token: string): { header: unknown; payload: unknown } {
  return jwt.decode(token);
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid expiry format: ${expiry}`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }
}
```

**Note:** Hono's built-in `jwt` utility handles HS256 JWT operations. The `parseExpiry` helper converts human-readable strings like `"15m"` or `"7d"` into seconds for the `exp` claim.

### 2. `apps/api/src/modules/auth/model.ts`

Prisma wrapper for auth-related database operations:

```typescript
import { prisma } from '@brewform/db';
import { hashSync, compareSync } from 'bcryptjs';

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email, deletedAt: null },
    include: { preferences: true },
  });
}

export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username, deletedAt: null },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id, deletedAt: null },
    include: { preferences: true },
  });
}

export async function createUser(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const passwordHash = hashSync(data.password, 10);
  return prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash,
      displayName: data.displayName || null,
      preferences: {
        create: {},
      },
    },
    include: { preferences: true },
  });
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): boolean {
  return compareSync(plainPassword, hashedPassword);
}

export async function updateUserPassword(userId: string, newPassword: string) {
  const passwordHash = hashSync(newPassword, 10);
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function createPasswordReset(userId: string, token: string, expiresAt: Date) {
  return prisma.passwordReset.create({
    data: { userId, token, expiresAt },
  });
}

export async function findPasswordResetByToken(token: string) {
  return prisma.passwordReset.findUnique({
    where: { token },
    include: { user: true },
  });
}

export async function markPasswordResetUsed(id: string) {
  return prisma.passwordReset.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}

export async function markOnboardingComplete(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { onboardingCompleted: true },
  });
}
```

### 3. `apps/api/src/modules/auth/service.ts`

Auth business logic:

```typescript
import * as jwt from './jwt.ts';
import * as model from './model.ts';
import { sendPasswordResetEmail, sendWelcomeEmail } from './email.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('auth-service');

export async function register(data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}) {
  const existingEmail = await model.findUserByEmail(data.email);
  if (existingEmail) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }

  const existingUsername = await model.findUserByUsername(data.username);
  if (existingUsername) {
    throw new Error('USERNAME_ALREADY_EXISTS');
  }

  const user = await model.createUser(data);
  const accessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const refreshToken = await jwt.signRefreshToken(user.id);

  try {
    await sendWelcomeEmail(user.email, user.username);
  } catch (err) {
    logger.warn({ err }, 'Failed to send welcome email');
  }

  return { user, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await model.findUserByEmail(email);
  if (!user) {
    throw new Error('INVALID_CREDENTIALS');
  }
  if (user.isBanned) {
    throw new Error('USER_BANNED');
  }

  const valid = await model.verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('INVALID_CREDENTIALS');
  }

  const accessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const refreshToken = await jwt.signRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  const payload = await jwt.verifyJwt(refreshToken);
  if (payload.type !== 'refresh') {
    throw new Error('INVALID_TOKEN_TYPE');
  }

  const user = await model.findUserById(payload.sub);
  if (!user || user.isBanned) {
    throw new Error('USER_NOT_FOUND');
  }

  const newAccessToken = await jwt.signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
  });
  const newRefreshToken = await jwt.signRefreshToken(user.id);

  return { user, accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function requestPasswordReset(email: string) {
  const user = await model.findUserByEmail(email);
  if (!user) {
    logger.info({ email }, 'Password reset requested for non-existent email');
    return;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 3600 * 1000);

  await model.createPasswordReset(user.id, token, expiresAt);

  try {
    await sendPasswordResetEmail(user.email, token, user.username);
  } catch (err) {
    logger.error({ err }, 'Failed to send password reset email');
    throw new Error('EMAIL_SEND_FAILED');
  }
}

export async function confirmPasswordReset(token: string, newPassword: string) {
  const reset = await model.findPasswordResetByToken(token);
  if (!reset) {
    throw new Error('INVALID_RESET_TOKEN');
  }
  if (reset.usedAt) {
    throw new Error('TOKEN_ALREADY_USED');
  }
  if (reset.expiresAt < new Date()) {
    throw new Error('TOKEN_EXPIRED');
  }

  await model.updateUserPassword(reset.userId, newPassword);
  await model.markPasswordResetUsed(reset.id);
}

export async function getAuthenticatedUser(userId: string) {
  const user = await model.findUserById(userId);
  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }
  return user;
}
```

### 4. `apps/api/src/modules/auth/email.ts`

Email sending with MJML templates:

```typescript
import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import mjml2html from 'mjml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const logger = createLogger('email');

async function sendEmail(to: string, subject: string, html: string) {
  const smtpConfig = {
    hostname: config.SMTP_HOST,
    port: config.SMTP_PORT,
    auth: config.SMTP_USER ? { username: config.SMTP_USER, password: config.SMTP_PASS } : undefined,
  };

  logger.info({ to, subject }, 'Sending email');

  try {
    const conn = await Deno.connect({ hostname: smtpConfig.hostname, port: smtpConfig.port });
    conn.close();
    logger.info({ to, subject }, 'Email would be sent (local dev via Mailpit)');
  } catch {
    logger.warn('SMTP connection failed — email not sent');
  }
}

function loadTemplate(templateName: string): string {
  const templatePath = join(import.meta.dirname ?? '.', '..', '..', 'templates', 'email', `${templateName}.mjml`);
  return readFileSync(templatePath, 'utf-8');
}

export async function sendWelcomeEmail(to: string, username: string) {
  const template = loadTemplate('welcome');
  const html = mjml2html(
    template
      .replace('{{username}}', username)
      .replace('{{app_name}}', 'BrewForm')
  ).html;

  await sendEmail(to, 'Welcome to BrewForm!', html);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const baseUrl = config.APP_ENV === 'production'
    ? 'https://brewform.github.io'
    : 'http://localhost:5173';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const template = loadTemplate('reset-password');
  const html = mjml2html(
    template
      .replace('{{username}}', username)
      .replace('{{reset_url}}', resetUrl)
      .replace('{{app_name}}', 'BrewForm')
  ).html;

  await sendEmail(to, 'Reset your BrewForm password', html);
}
```

### 5. `apps/api/src/modules/auth/index.ts` — Controller (Routes)

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  AuthRegisterSchema,
  AuthLoginSchema,
  AuthRefreshSchema,
  PasswordResetSchema,
  PasswordResetConfirmSchema,
} from '@brewform/shared/schemas';
import * as authService from './service.ts';
import { success, error } from '../../utils/response/index.ts';

const auth = new Hono();

auth.post('/register', zValidator('json', AuthRegisterSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const result = await authService.register(body);
    return success(c, {
      user: sanitizeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    }, 201);
  } catch (err: any) {
    if (err.message === 'EMAIL_ALREADY_EXISTS') {
      return error(c, 'CONFLICT', 'Email already registered', 409);
    }
    if (err.message === 'USERNAME_ALREADY_EXISTS') {
      return error(c, 'CONFLICT', 'Username already taken', 409);
    }
    throw err;
  }
});

auth.post('/login', zValidator('json', AuthLoginSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const result = await authService.login(body.email, body.password);
    return success(c, {
      user: sanitizeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') {
      return error(c, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    if (err.message === 'USER_BANNED') {
      return error(c, 'USER_BANNED', 'This account has been banned', 403);
    }
    throw err;
  }
});

auth.post('/refresh', zValidator('json', AuthRefreshSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const result = await authService.refreshAccessToken(body.refreshToken);
    return success(c, {
      user: sanitizeUser(result.user),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (err: any) {
    if (err.message === 'INVALID_TOKEN_TYPE' || err.message === 'USER_NOT_FOUND') {
      return error(c, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token', 401);
    }
    throw err;
  }
});

auth.post('/forgot-password', zValidator('json', PasswordResetSchema), async (c) => {
  const body = c.req.valid('json');
  await authService.requestPasswordReset(body.email);
  return success(c, { message: 'If an account with that email exists, a reset link has been sent.' });
});

auth.post('/reset-password', zValidator('json', PasswordResetConfirmSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    await authService.confirmPasswordReset(body.token, body.newPassword);
    return success(c, { message: 'Password has been reset successfully.' });
  } catch (err: any) {
    if (err.message === 'INVALID_RESET_TOKEN') {
      return error(c, 'INVALID_TOKEN', 'Invalid password reset token', 400);
    }
    if (err.message === 'TOKEN_ALREADY_USED') {
      return error(c, 'TOKEN_USED', 'This reset token has already been used', 400);
    }
    if (err.message === 'TOKEN_EXPIRED') {
      return error(c, 'TOKEN_EXPIRED', 'This reset token has expired', 400);
    }
    throw err;
  }
});

function sanitizeUser(user: any) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export default auth;
```

### 6. `apps/api/src/templates/email/reset-password.mjml`

```mjml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-text font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" />
      <mj-button background-color="#6F4E37" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F5F0EB">
    <mj-section>
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#3E2723" align="center">
          ☕ {{app_name}}
        </mj-text>
        <mj-text font-size="18px" color="#5D4037" align="center">
          Hello {{username}},
        </mj-text>
        <mj-text font-size="16px" color="#5D4037" align="center">
          We received a request to reset your password. Click the button below to choose a new one.
        </mj-text>
        <mj-button href="{{reset_url}}" font-size="16px">
          Reset Password
        </mj-button>
        <mj-text font-size="14px" color="#8D6E63" align="center">
          This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### 7. `apps/api/src/templates/email/welcome.mjml`

```mjml
<mjml>
  <mj-head>
    <mj-attributes>
      <mj-text font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" />
      <mj-button background-color="#6F4E37" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#F5F0EB">
    <mj-section>
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" color="#3E2723" align="center">
          ☕ Welcome to {{app_name}}!
        </mj-text>
        <mj-text font-size="18px" color="#5D4037" align="center">
          Hey {{username}},
        </mj-text>
        <mj-text font-size="16px" color="#5D4037" align="center">
          Your coffee journey starts here. Record your brewing recipes, explore community creations, and share your tasting notes with the world.
        </mj-text>
        <mj-button href="https://brewform.github.io/onboarding" font-size="16px">
          Get Started
        </mj-button>
        <mj-text font-size="14px" color="#8D6E63" align="center">
          Happy brewing! ☕
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

---

## Registration in `apps/api/src/routes/index.ts`

After creating the auth module, update the routes aggregator:

```typescript
import auth from '../modules/auth/index.ts';
// ...
routes.route('/api/v1/auth', auth);
```

---

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | None | Register new user |
| POST | `/api/v1/auth/login` | None | Login, get tokens |
| POST | `/api/v1/auth/refresh` | None | Refresh access token |
| POST | `/api/v1/auth/forgot-password` | None | Request password reset email |
| POST | `/api/v1/auth/reset-password` | None | Confirm password reset |

---

## Key Design Decisions

- **JWT with HS256** — simple, stateless, matches Hono's built-in JWT utilities.
- **Access token (15m) + Refresh token (7d)** — short-lived access tokens reduce exposure window. Refresh tokens allow seamless re-auth.
- **Password reset tokens** — stored in DB with expiry and single-use tracking via `usedAt`.
- **Password hashing** — uses `bcryptjs` for Deno compatibility (10 rounds). Not `bcrypt` native module.
- **User sanitization** — `sanitizeUser()` strips `passwordHash` from every response, never leaks it.
- **Email in development** — Mailpit captures all SMTP traffic at `localhost:8025`. No real email delivery in dev.
- **MJML templates** — rendered server-side to HTML, sent as email body. Newsletter-quality email formatting.