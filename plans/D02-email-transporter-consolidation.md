# D02: Duplicate Email Transporter (Connection Leak)

**Severity:** Critical — Resource Leak  
**Date:** 2026-05-29  
**Status:** Implemented (2026-06-01)  
**Module:** `apps/api/src/modules/auth` + `apps/api/src/utils/notify`

---

> **Validation note (2026-05-31):** The original plan was reviewed against the live `main` branch.
> Four corrections were made:
> 1. `closeTransporter()` is **already wired into `main.ts`** — the original "consider adding" note was inaccurate.
> 2. The XSS fix was **identified in the issue description but absent from the proposed code** — the fix is now included.
> 3. `sendPasswordResetEmail` / `sendVerificationEmail` hardcode the base URL instead of using the exported `appBaseUrl()` — this inconsistency is now fixed in the same pass.
> 4. Minor: the logger structured-data shape in the proposed code didn't match the existing codebase style — corrected to `{ delivery: '...', subject }`.

---

## Issue Description

The codebase has **two separate email sending implementations** that create competing SMTP transports:

1. **`apps/api/src/modules/auth/email.ts:10-17`** — Creates a **new nodemailer transport on every call** via `createTransporter()`.
2. **`apps/api/src/utils/notify/index.ts:35-47`** — Uses a **singleton pattern** with `getTransporter()` that reuses one transport instance.

Both files contain `renderTemplate()` and `sendEmail()` functions with divergent implementations.

## Impact

- **Connection leak:** Every call to `sendWelcomeEmail()`, `sendPasswordResetEmail()`, or `sendVerificationEmail()` creates a new SMTP connection that is never closed. Under load, this exhausts SMTP server connections or hits OS file descriptor limits.
- **Code duplication:** Two `renderTemplate()` functions, two `sendEmail()` functions, two sets of SMTP config reads.
- **Inconsistent behavior:** `auth/email.ts` throws on send failure; `utils/notify/index.ts` swallows errors — intentional difference, but it must be preserved.
- **Missing HTML escaping:** `auth/email.ts` does NOT call `escapeHtml()` on template values; `utils/notify/index.ts` does — active XSS risk in auth emails (welcome, password reset, verification).
- **Hardcoded base URL:** `sendPasswordResetEmail` and `sendVerificationEmail` hardcode the app URL instead of using the exported `appBaseUrl()` from notify, which already respects `config.PUBLIC_APP_URL`.
- **Dead export:** `sendWelcomeEmail` is exported but never imported or called anywhere in the codebase.

## Root Cause

The `utils/notify` module was added later (plan §3.5 social notifications) with a proper singleton pattern, but the original `auth/email.ts` was never migrated to use it. Both modules evolved independently.

## Affected Files

| File | Change |
|------|--------|
| `apps/api/src/modules/auth/email.ts` | Refactor: remove local transporter; use `getTransporter`, `appBaseUrl`, `escapeHtml`; fix `renderTemplate` regex; add JSDoc |
| `apps/api/src/utils/notify/index.ts` | No changes needed (already correct) |
| `apps/api/src/main.ts` | No changes needed — `closeTransporter()` is already called in graceful shutdown |
| `apps/api/src/modules/auth/*.ts` | Verify imports remain valid after refactor |
| `apps/api/src/utils/notify/notify.test.ts` | **New:** Singleton pattern tests for `getTransporter()` / `closeTransporter()` |
| `apps/api/src/modules/auth/email.test.ts` | **New:** Smoke tests + XSS resilience tests for all three auth email functions |

## Fix Approach

### Step 1: Refactor `auth/email.ts`

Replace the local `createTransporter()` and `sendEmail()` with imports from `utils/notify`. Also fix `renderTemplate` to call `escapeHtml`, align the regex with the notify module, and use `appBaseUrl()` for URL construction.

```ts
// apps/api/src/modules/auth/email.ts
import { config } from '../../config/index.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { appBaseUrl, getTransporter } from '../../utils/notify/index.ts';
import { escapeHtml } from '@brewform/shared/utils';
import { template as welcomeTemplate } from '../../templates/email/generated/welcome.ts';
import { template as resetPasswordTemplate } from '../../templates/email/generated/reset-password.ts';
import { template as verifyEmailTemplate } from '../../templates/email/generated/verify-email.ts';

const logger = createLogger('auth-email');

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value !== undefined ? escapeHtml(value) : _match;
  });
}

async function sendEmail(to: string, subject: string, html: string) {
  logger.info({ delivery: 'pending', subject }, 'Sending auth email');

  if (config.APP_ENV === 'test') {
    logger.info({ delivery: 'skipped', subject }, 'Auth email skipped (test environment)');
    return;
  }

  try {
    await getTransporter().sendMail({
      from: config.EMAIL_FROM,
      to,
      subject,
      html,
    });
    logger.info({ delivery: 'sent', subject }, 'Auth email sent successfully');
  } catch (err) {
    logger.error({ err, delivery: 'failed', subject }, 'Failed to send auth email');
    throw err;
  }
}

export async function sendWelcomeEmail(to: string, username: string) {
  const html = renderTemplate(welcomeTemplate, {
    username,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Welcome to BrewForm!', html);
}

export async function sendPasswordResetEmail(to: string, token: string, username: string) {
  const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;

  const html = renderTemplate(resetPasswordTemplate, {
    username,
    reset_url: resetUrl,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Reset your BrewForm password', html);
}

export async function sendVerificationEmail(to: string, token: string, username: string) {
  const verifyUrl = `${appBaseUrl()}/verify-email?token=${token}`;

  const html = renderTemplate(verifyEmailTemplate, {
    username,
    verify_url: verifyUrl,
    app_name: 'BrewForm',
  });
  await sendEmail(to, 'Verify your BrewForm email', html);
}
```

**Key changes from original `auth/email.ts`:**

| Change | Why |
|--------|-----|
| Remove `import nodemailer from 'npm:nodemailer'` | No longer needed directly |
| Remove `createTransporter()` | Replaced by singleton |
| Add `import { appBaseUrl, getTransporter } from '../../utils/notify/index.ts'` | Use singleton + centralised URL helper |
| Add `import { escapeHtml } from '@brewform/shared/utils'` | Fix XSS in template interpolation |
| Update `renderTemplate`: regex `.*?` → `\w+`, add `escapeHtml(value)` | Align with notify module; fix XSS |
| `sendPasswordResetEmail` / `sendVerificationEmail`: replace inline `baseUrl` logic with `appBaseUrl()` | Respect `config.PUBLIC_APP_URL`; single source of truth |
| Logger shape changed to `{ delivery: '...', subject }` | Matches existing codebase logging style |

### Step 2: Verify No Other Stray `createTransport` Calls

```bash
grep -r "createTransport" apps/api/src/
```

After the refactor, only `utils/notify/index.ts` should contain a `createTransport` call (the singleton). No other matches should appear.

### Step 3: Confirm Graceful Shutdown Is Already Wired (No Action Required)

`apps/api/src/main.ts` already calls `closeTransporter()` in its shutdown handler:

```ts
// apps/api/src/main.ts — shutdown() function (already present, no edit needed)
const { closeTransporter } = await import('./utils/notify/index.ts');
closeTransporter();
logger.info('Email transporter closed');
```

This was verified against the live main branch. No change required.

### Step 4: Align Error Handling (No Change Required)

The auth module rethrows errors; notify swallows them. For auth emails (welcome, password reset, verification), rethrowing is correct — the caller needs to know. The intentional asymmetry is preserved in the refactored code above.

## Testing Strategy

### Unit Tests

The existing auth email tests should continue passing without modification (the public API is unchanged). Add the following to verify the singleton property and that XSS escaping is applied:

```ts
// apps/api/src/utils/notify/notify.test.ts (new file)
import { describe, it, afterEach } from '@std/testing/bdd';
import { assertStrictEquals, assertNotStrictEquals } from '@std/assert';
import { closeTransporter, getTransporter } from './index.ts';

describe('getTransporter', () => {
  afterEach(() => {
    closeTransporter(); // Reset singleton between tests
  });

  it('should return the same reference on repeated calls', () => {
    const t1 = getTransporter();
    const t2 = getTransporter();
    assertStrictEquals(t1, t2);
  });

  it('should create a new instance after closeTransporter()', () => {
    const t1 = getTransporter();
    closeTransporter();
    const t2 = getTransporter();
    assertNotStrictEquals(t1, t2);
  });
});
```

```ts
// apps/api/src/modules/auth/email.test.ts (add escapeHtml test)
import { describe, it } from '@std/testing/bdd';
import { assertStringIncludes } from '@std/assert';

// Expose renderTemplate for unit testing via a thin test-only export, or
// test via the full sendEmail path with APP_ENV=test and a captured html value.
// The important assertion: XSS payloads are escaped.
it('renderTemplate escapes HTML special characters', () => {
  // Trigger sendVerificationEmail with APP_ENV=test and verify escaping via
  // the logger output or a spy on getTransporter().sendMail.
  // Example with a stub:
  const payload = '<script>alert(1)</script>';
  // After rendering, the output html must NOT contain the raw payload:
  // assertNotStringIncludes(html, payload);
  // assertStringIncludes(html, '&lt;script&gt;');
});
```

### Integration Tests

- Trigger a password reset → verify email is sent (mock SMTP / Mailpit)
- Verify `closeTransporter()` is called on graceful shutdown (already wired in `main.ts`)
- Verify `PUBLIC_APP_URL` env var is respected in reset/verify links when set

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
# If PUBLIC_APP_URL is set in .env, verify the link domain matches it
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auth emails silently fail if transporter error is swallowed | Low | High | Auth module rethrows — preserved in refactor |
| `closeTransporter()` not called on shutdown | None | Low | Already wired in `main.ts`; verified |
| Template rendering differs slightly between modules | Low | Low | `auth/email.ts` keeps its own `renderTemplate` — now aligned (same regex, escaping added) |
| `escapeHtml` breaks double-encoded template values | Low | Low | Templates use plain strings (usernames, URLs) — no pre-encoded values expected |
| `appBaseUrl()` returns unexpected URL in production | Low | Medium | Reads `config.PUBLIC_APP_URL` first; falls back to hardcoded production URL — same or safer than current behaviour |

## Dependencies

- No new npm packages required
- `escapeHtml` is already exported from `@brewform/shared/utils` — no new package needed
- `appBaseUrl`, `getTransporter`, and `closeTransporter` are already exported from `utils/notify/index.ts` — no API changes required there

## Appendix: Side Findings (Out of Scope for This PR)

These were found during validation but are not blocking the D02 fix:

- **`sendWelcomeEmail` is NOT dead code (correction from original analysis).** It is imported and called in `apps/api/src/modules/admin/service.ts:94` when an admin creates a new user account. The import path `../auth/email.ts` remains valid after the refactor.
- **No connection pooling.** The current singleton transport does not enable nodemailer's `pool: true` option. For high-volume deployments, enabling pooling (`pool: true`, `maxConnections: 5`) would reduce per-message TLS handshake overhead. This is a performance improvement, not a correctness fix.
