# D02: Duplicate Email Transporter (Connection Leak)

**Severity:** Critical — Resource Leak  
**Date:** 2026-05-29  
**Status:** Proposed  
**Module:** `apps/api/src/modules/auth` + `apps/api/src/utils/notify`

---

## Issue Description

The codebase has **two separate email sending implementations** that create competing SMTP transports:

1. **`apps/api/src/modules/auth/email.ts:10-17`** — Creates a **new nodemailer transport on every call** via `createTransporter()`.
2. **`apps/api/src/utils/notify/index.ts:35-47`** — Uses a **singleton pattern** with `getTransporter()` that reuses one transport instance.

Both files contain identical `renderTemplate()` and `sendEmail()` functions with slightly different implementations.

## Impact

- **Connection leak:** Every call to `sendWelcomeEmail()`, `sendPasswordResetEmail()`, or `sendVerificationEmail()` creates a new SMTP connection that is never closed. Under load, this exhausts SMTP server connections or hits OS file descriptor limits.
- **Code duplication:** Two `renderTemplate()` functions, two `sendEmail()` functions, two sets of SMTP config.
- **Inconsistent behavior:** `auth/email.ts` throws on send failure; `utils/notify/index.ts` swallows errors with `.catch()`.
- **Missing HTML escaping:** `auth/email.ts` does NOT call `escapeHtml()` on template values; `utils/notify/index.ts` does — potential XSS in auth emails.

## Root Cause

The `utils/notify` module was added later (plan §3.5 social notifications) with a proper singleton pattern, but the original `auth/email.ts` was never migrated to use it. Both modules evolved independently.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/modules/auth/email.ts` | Refactor to use singleton transporter |
| `apps/api/src/utils/notify/index.ts` | No changes needed (already correct) |
| `apps/api/src/modules/auth/*.ts` | Verify imports remain valid |

## Fix Approach

### Step 1: Refactor `auth/email.ts` to Use Singleton

Replace the local `createTransporter()` and `sendEmail()` with imports from `utils/notify`:

```ts
// apps/api/src/modules/auth/email.ts
import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { getTransporter } from '../../utils/notify/index.ts';
import { template as welcomeTemplate } from '../../templates/email/generated/welcome.ts';
import { template as resetPasswordTemplate } from '../../templates/email/generated/reset-password.ts';
import { template as verifyEmailTemplate } from '../../templates/email/generated/verify-email.ts';

const logger = createLogger('auth-email');

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(.*?)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  logger.info({ to, subject }, 'Sending auth email');
  if (config.APP_ENV === 'test') {
    logger.info({ to, subject }, 'Auth email skipped (test environment)');
    return;
  }
  try {
    await getTransporter().sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ to, subject }, 'Auth email sent successfully');
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send auth email');
    throw err;
  }
}

// sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail unchanged
```

**Key changes:**
- Remove `import nodemailer from 'npm:nodemailer'`
- Remove `createTransporter()` function
- Import `getTransporter` from `../../utils/notify/index.ts`
- Use `getTransporter().sendMail()` instead of creating a new transport

### Step 2: Verify No Other Transport Creation

Search for any other `nodemailer.createTransport` calls:
```bash
grep -r "createTransport" apps/api/src/
```

Only `utils/notify/index.ts:39` should remain (the singleton).

### Step 3: Align Error Handling (Optional Improvement)

The auth module rethrows errors while notify swallows them. For auth emails (welcome, password reset, verification), rethrowing is correct — the caller needs to know. No change needed here, but document the intentional difference.

## Testing Strategy

### Unit Tests

The existing auth email tests should continue passing. Add a test that verifies only one transport is created:

```ts
it('should reuse the singleton transporter', async () => {
  const t1 = getTransporter();
  const t2 = getTransporter();
  expect(t1).toBe(t2); // Same reference
});
```

### Integration Tests

- Trigger a password reset → verify email is sent (mock SMTP)
- Verify `closeTransporter()` is called on graceful shutdown

### Verification

```bash
make check    # Type-check passes
make lint     # Lint passes
make test     # All tests pass
```

### Manual Smoke Test

```bash
make up       # Start infrastructure (includes mailpit)
make dev      # Start app
# Register a new user → verify welcome email arrives in mailpit
# Request password reset → verify reset email arrives
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auth emails silently fail if transporter error is swallowed | Low | High | Auth module rethrows — keep this behavior |
| `closeTransporter()` not called on shutdown | Low | Low | Add to graceful shutdown handler if not present |
| Template rendering differs slightly between modules | Low | Low | Auth module keeps its own `renderTemplate()` — no change |

## Dependencies

- No new npm packages
- `utils/notify/index.ts` already exports `getTransporter()` and `closeTransporter()`
- Consider adding `closeTransporter()` to the API graceful shutdown handler if not already present
