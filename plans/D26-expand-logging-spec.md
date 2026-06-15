# D26 — Expand Structured Logging Coverage (Implementation Spec)

**Generated:** 2026-06-16 — Validated against codebase at commit after rebase.
**Source:** `TODO_logs.md` + `plans/D26-expand-logging.md` + 8 subagent research passes.
**Status:** Ready for implementation in fresh session.

---

## Quick Reference: What Changed Since Original Plan

| Item | Original Plan | Reality |
|------|--------------|---------|
| P1 services to log | 6 | **4** (vendor already logged; coffee-variety partially logged → downgraded) |
| P1 pages to log | 6 | **4** (RecipeCreate, Settings already done) |
| P2 pages total | 26 | **27** (TasteNotesPage was uncounted) |
| P2 pages already done | 0 | **6** (see Completed Work below) |
| Hooks missing from plan | 0 | **1** (`useStaticCacheSync.ts` — cross-tab cache sync) |
| Actual work scope | ~50 files | **44 files modify + 5 JSDoc only + 3 new test files + 21 test updates** |

### Completed Work (skip these files)
| File | What's Done |
|------|------------|
| `vendor/service.ts` | Logger + entry/exit `log.debug` on all 6 fns (ERROR logging MISSING — still in scope) |
| `coffee-variety/service.ts` | `updateCoffeeVariety` + `deleteCoffeeVariety` fully logged (4 of 6 fns MISSING — in scope) |
| `RecipeCreatePage.tsx` | Mount/unmount + error catches |
| `SettingsPage.tsx` | Mount/unmount |
| `UserProfilePage.tsx` | Mount/unmount |
| `RecipeFocusModePage.tsx` | Mount/unmount + error catches |
| `StarredRecipesPage.tsx` | Mount/unmount |
| `EquipmentListPage.tsx` | Mount/unmount |
| `AdminEquipmentPage.tsx` | Mount/unmount |
| `AdminTasteNotesPage.tsx` | Mount/unmount |

---

## Implementation Phases (Execute in Order)

### Phase 1 — P1 API Services (5 files, 26 functions)
**Goal:** Add structured logging to all high-priority service functions.

---

#### 1.1 `apps/api/src/modules/user/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger import, no log calls. 4 functions, 3 of 4 have JSDoc.

**Step 1.1.1: Add imports** — After existing imports, before function exports:

```ts
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('user-service');
```

**Step 1.1.2: `getProfile(userId: string)` — Add entry/exit/error logging**

Insert after `{`:
```ts
  log.debug({ userId }, 'getProfile started');
```

Before `return user;`:
```ts
  log.debug({ userId }, 'getProfile completed');
```

Before `throw new Error('USER_NOT_FOUND')`:
```ts
    log.error({ userId }, 'getProfile failed: user not found');
    throw new Error('USER_NOT_FOUND');
```

**Step 1.1.3: `getPublicProfile(username: string, requesterId?: string)`**

Insert after `{`:
```ts
  log.debug({ username, requesterId }, 'getPublicProfile started');
```

Before `return { user, isFollowing, isBlocked }`:
```ts
  log.debug({ username: user.username, requesterId }, 'getPublicProfile completed');
```

Before `throw new Error('USER_NOT_FOUND')`:
```ts
    log.error({ username }, 'getPublicProfile failed: user not found');
    throw new Error('USER_NOT_FOUND');
```

**Step 1.1.4: `updateProfile(userId: string, data: { displayName?, bio?, avatarUrl? })`**

Insert after `{`:
```ts
  log.debug({ userId }, 'updateProfile started');
```

After `model.updateProfile(userId, ...)`, before `if (!user)`:
```ts
  if (!user) {
    log.error({ userId }, 'updateProfile failed: user not found after update');
    throw new Error('USER_NOT_FOUND');
  }
```

Before `return user;` at end:
```ts
  log.debug({ userId }, 'updateProfile completed');
```

**Step 1.1.5: `deleteAccount(userId: string)`**

Insert after `{`:
```ts
  log.debug({ userId }, 'deleteAccount started');
```

After `await model.softDelete(userId);`:
```ts
  log.debug({ userId }, 'deleteAccount completed');
```

**Notes:** `deleteAccount` has no existence check before soft-delete — it should probably verify the user exists first. This is a pre-existing bug, not a logging issue. Note it but don't fix in this PR.

---

#### 1.2 `apps/api/src/modules/vendor/service.ts` — HAS LOGGER → ADD ERROR LOGGING

**Current state:** `createLogger('vendor-service')` as `log` already imported. All 6 functions have `log.debug` entry/exit. ZERO error logging.

**Step 1.2.1: `getVendor(id: string)` — Add error logging**

Before `throw new Error('VENDOR_NOT_FOUND')` (inside `if (!vendor)`):
```ts
    log.error({ id }, 'getVendor failed: vendor not found');
    throw new Error('VENDOR_NOT_FOUND');
```

**Step 1.2.2: `updateVendor(userId, id, data, isAdmin = false)` — Add error logging**

Before `throw new Error('VENDOR_NOT_FOUND')` (first guard):
```ts
    log.error({ id, userId }, 'updateVendor failed: vendor not found');
    throw new Error('VENDOR_NOT_FOUND');
```

Before `throw new Error('FORBIDDEN')`:
```ts
    log.warn({ id, userId }, 'updateVendor failed: forbidden (not creator and not admin)');
    throw new Error('FORBIDDEN');
```

**Step 1.2.3: `deleteVendor(id: string)` — Add error logging**

Before `throw new Error('VENDOR_NOT_FOUND')`:
```ts
    log.error({ id }, 'deleteVendor failed: vendor not found');
    throw new Error('VENDOR_NOT_FOUND');
```

---

#### 1.3 `apps/api/src/modules/bean/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger import, no log calls. 5 functions, 2 of 5 have JSDoc. `data` parameters in `createBean` and `updateBean` typed as `any`.

**Step 1.3.1: Add import + logger**

```ts
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('bean-service');
```

**Step 1.3.2: `listBeans(userId: string, page: number, perPage: number)`**

```ts
  log.debug({ userId, page, perPage }, 'listBeans started');
  // ... logic ...
  log.debug({ userId, page, perPage, total: result.total }, 'listBeans completed');
```

**Step 1.3.3: `getBean(id: string)`**

```ts
  log.debug({ id }, 'getBean started');
  // ...
  if (!bean) {
    log.error({ id }, 'getBean failed: bean not found');
    throw new Error('BEAN_NOT_FOUND');
  }
  log.debug({ id }, 'getBean completed');
```

**Step 1.3.4: `createBean(userId: string, data: any)`**

```ts
  log.debug({ userId }, 'createBean started');
  // ... logic ...
  log.debug({ userId, beanId: result.id }, 'createBean completed');
```

Note: `data` is `any` — do NOT log the data object (may contain PII or large payload). Log only IDs.

**Step 1.3.5: `updateBean(userId: string, id: string, data: any)`** — 3 throw sites

```ts
  log.debug({ userId, id }, 'updateBean started');
  // guard 1
  if (!bean) {
    log.error({ id, userId }, 'updateBean failed: bean not found');
    throw new Error('BEAN_NOT_FOUND');
  }
  // guard 2
  if (bean.userId !== userId) {
    log.warn({ id, userId, ownerId: bean.userId }, 'updateBean failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  // after model.update
  if (!updated) {
    log.error({ id, userId }, 'updateBean failed: bean not found after update');
    throw new Error('BEAN_NOT_FOUND');
  }
  log.debug({ userId, id }, 'updateBean completed');
```

**Step 1.3.6: `deleteBean(userId: string, id: string)`** — 3 throw sites

```ts
  log.debug({ userId, id }, 'deleteBean started');
  if (!bean) {
    log.error({ id, userId }, 'deleteBean failed: bean not found');
    throw new Error('BEAN_NOT_FOUND');
  }
  if (bean.userId !== userId) {
    log.warn({ id, userId, ownerId: bean.userId }, 'deleteBean failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  // after model.softDelete
  if (!deleted) {
    log.error({ id, userId }, 'deleteBean failed: bean not found after delete');
    throw new Error('BEAN_NOT_FOUND');
  }
  log.debug({ userId, id }, 'deleteBean completed');
```

---

#### 1.4 `apps/api/src/modules/setup/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger. 6 functions, `createSetup` data typed as `any`. `clearDefaultForUser` side effects in `createSetup`, `updateSetup`, `setDefault`.

**Step 1.4.1: Add import + logger**

```ts
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('setup-service');
```

**Step 1.4.2: `listSetups(userId: string, page: number, perPage: number)`**

```ts
  log.debug({ userId, page, perPage }, 'listSetups started');
  // ...
  log.debug({ userId, page, perPage, total: result.total }, 'listSetups completed');
```

**Step 1.4.3: `getSetup(id: string)`**

```ts
  log.debug({ id }, 'getSetup started');
  // guard:
  if (!setup) {
    log.error({ id }, 'getSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ id }, 'getSetup completed');
```

**Step 1.4.4: `createSetup(userId: string, data: any)`**

```ts
  log.debug({ userId }, 'createSetup started');
  // if data.isDefault:
  if (data.isDefault) {
    log.debug({ userId }, 'createSetup clearing defaults for user');
    await model.clearDefaultForUser(userId);
  }
  // ...
  log.debug({ userId, setupId: result.id }, 'createSetup completed');
```

Note: `data` is `any` — do NOT log the data object itself.

**Step 1.4.5: `updateSetup(userId: string, id: string, data: UpdateSetupPayload)`** — 3 throw sites + side effect

```ts
  log.debug({ userId, id }, 'updateSetup started');
  if (!setup) {
    log.error({ id, userId }, 'updateSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'updateSetup failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  if (data.isDefault) {
    log.debug({ userId }, 'updateSetup clearing defaults for user');
    await model.clearDefaultForUser(userId);
  }
  // after model.update
  if (!updated) {
    log.error({ id, userId }, 'updateSetup failed: setup not found after update');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ userId, id }, 'updateSetup completed');
```

**Step 1.4.6: `deleteSetup(userId: string, id: string)`** — 3 throw sites

```ts
  log.debug({ userId, id }, 'deleteSetup started');
  if (!setup) {
    log.error({ id, userId }, 'deleteSetup failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'deleteSetup failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  // after model.softDelete
  if (!deleted) {
    log.error({ id, userId }, 'deleteSetup failed: setup not found after delete');
    throw new Error('SETUP_NOT_FOUND');
  }
  log.debug({ userId, id }, 'deleteSetup completed');
```

**Step 1.4.7: `setDefault(userId: string, id: string)`** — 2 throw sites + side effect

```ts
  log.debug({ userId, id }, 'setDefault started');
  if (!setup) {
    log.error({ id, userId }, 'setDefault failed: setup not found');
    throw new Error('SETUP_NOT_FOUND');
  }
  if (setup.userId !== userId) {
    log.warn({ id, userId, ownerId: setup.userId }, 'setDefault failed: forbidden');
    throw new Error('FORBIDDEN');
  }
  log.debug({ userId }, 'setDefault clearing previous defaults');
  await model.clearDefaultForUser(userId);
  // ... set default ...
  log.debug({ userId, id }, 'setDefault completed');
```

---

#### 1.5 `apps/api/src/modules/report/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger. 3 functions, smallest service file. `createReport` is a content moderation action → use `log.info`.

**Step 1.5.1: Add import + logger**

```ts
import { createLogger } from '../../utils/logger/index.ts';

const log = createLogger('report-service');
```

**Step 1.5.2: `createReport(reporterId: string, entityType: string, entityId: string, reason: string)`**

```ts
  log.info({ reporterId, entityType, entityId }, 'createReport started');
  // ... model.create ... 
  log.info({ reporterId, entityType, entityId, reportId: result.id }, 'createReport completed');
```

Note: Use `log.info` (not debug) because content moderation reports are significant events warranting always-on logging.

**Step 1.5.3: `listReports(status: string | undefined, page: number, perPage: number)`**

```ts
  log.debug({ status, page, perPage }, 'listReports started');
  // ...
  log.debug({ status, page, perPage, total: result.total }, 'listReports completed');
```

**Step 1.5.4: `resolveReport(id: string, resolvedBy: string)`** — 2 throw sites

```ts
  log.info({ id, resolvedBy }, 'resolveReport started');
  if (!report) {
    log.error({ id, resolvedBy }, 'resolveReport failed: report not found');
    throw new Error('REPORT_NOT_FOUND');
  }
  if (report.status === 'resolved') {
    log.warn({ id, resolvedBy }, 'resolveReport failed: report already resolved');
    throw new Error('REPORT_ALREADY_RESOLVED');
  }
  // ... model.resolve ...
  log.info({ id, resolvedBy }, 'resolveReport completed');
```

Note: `resolveReport` uses `log.info` (moderation action) but individual failures use `log.error`/`log.warn`.

---

### Phase 2 — P1 Web Pages + Critical Components (6 files)

**Goal:** Add mount/unmount + error logging to auth-critical pages and components.

#### Logger Pattern for Web Pages

Every web file uses:
```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('ComponentName');
```

The `useEffect` pattern:
```ts
useEffect(() => {
  log.debug({}, 'ComponentName mounted');
  return () => { log.debug({}, 'ComponentName unmounted'); };
}, []);
```

Error catch pattern:
```ts
try {
  await action();
} catch (err: unknown) {
  log.error({ err }, 'ComponentName actionName failed');
  setError(...);
}
```

---

#### 2.1 `apps/web/src/pages/recipes/RecipeEditPage.tsx`

**Current state:** No logger, no useEffect, no error catches on data fetch/mutation.

**Step 2.1.1:** Add import + logger at top of file (PascalCase: `'RecipeEditPage'`).

**Step 2.1.2:** Add mount/unmount `useEffect`.

**Step 2.1.3:** Wrap async data-fetching (recipe load, bean list load, equipment list load) in try/catch with `log.error({ err }, 'RecipeEditPage loadRecipe failed')` etc.

**Step 2.1.4:** Wrap form submission in try/catch with `log.error({ err }, 'RecipeEditPage saveRecipe failed')`.

---

#### 2.2 `apps/web/src/pages/auth/ForgotPasswordPage.tsx`

**Current state:** No logger, no useEffect.

**Step 2.2.1:** Add import + logger (`'ForgotPasswordPage'`).

**Step 2.2.2:** Add mount/unmount `useEffect`.

**Step 2.2.3:** Wrap email submission in try/catch:
```ts
try {
  await sendResetEmail(email);
} catch (err: unknown) {
  log.error({ err }, 'ForgotPasswordPage sendResetEmail failed');
  setError(...);
}
```

---

#### 2.3 `apps/web/src/pages/auth/ResetPasswordPage.tsx`

**Current state:** No logger, no useEffect.

**Step 2.3.1:** Add import + logger (`'ResetPasswordPage'`).

**Step 2.3.2:** Add mount/unmount `useEffect`.

**Step 2.3.3:** Wrap token consumption in try/catch:
```ts
try {
  await resetPassword(token, newPassword);
} catch (err: unknown) {
  log.error({ err }, 'ResetPasswordPage resetPassword failed');
  setError(...);
}
```

---

#### 2.4 `apps/web/src/pages/auth/VerifyEmailPage.tsx`

**Current state:** Has `useEffect` for token verification but no logging.

**Step 2.4.1:** Add import + logger (`'VerifyEmailPage'`).

**Step 2.4.2:** Add mount/unmount `useEffect` (in addition to existing token verification effect).

**Step 2.4.3:** Add error log in existing token verification catch block.

---

#### 2.5 `apps/web/src/contexts/AuthContext.tsx` (CRITICAL — security gap)

**Current state:** Zero logging. Login state changes, token refresh, auth errors all silent. The single biggest security gap found.

**Step 2.5.1:** Add import + logger at top:
```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('AuthContext');
```

**Step 2.5.2:** Log login state changes:
```ts
// In login function, after successful login:
log.info({ userId: user.id }, 'AuthContext user logged in');

// In logout function:
log.info({}, 'AuthContext user logged out');

// In token refresh:
log.debug({}, 'AuthContext token refresh started');
// ... refresh ...
log.debug({}, 'AuthContext token refresh completed');
```

**Step 2.5.3:** Log auth errors:
```ts
// In login catch:
log.error({ err }, 'AuthContext login failed');

// In register catch:
log.error({ err }, 'AuthContext registration failed');

// In token refresh catch:
log.warn({ err }, 'AuthContext token refresh failed — session may be expired');

// If user is banned (check response):
log.warn({ userId }, 'AuthContext user account is banned');
```

---

#### 2.6 `apps/web/src/components/ErrorBoundary.tsx`

**Current state:** No logger. Render errors caught but not logged.

**Step 2.6.1:** Add import + logger:
```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('ErrorBoundary');
```

**Step 2.6.2:** In `componentDidCatch` (or error handler):
```ts
componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  log.error({ err: error, componentStack: errorInfo.componentStack }, 'ErrorBoundary caught render error');
  // ... existing error state logic ...
}
```

**Step 2.6.3:** Log error boundary reset:
```ts
handleReset() {
  log.info({}, 'ErrorBoundary reset triggered');
  // ... existing reset logic ...
}
```

---

### Phase 3 — P2 API Services (4 files, 22 functions)

---

#### 3.1 `apps/api/src/modules/preference/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger. 2 functions. `updatePreferences` data typed as `any`.

**Step 3.1.1:** Add import + logger:
```ts
import { createLogger } from '../../utils/logger/index.ts';
const log = createLogger('preference-service');
```

**Step 3.1.2: `getPreferences(userId: string)`** — 1 throw site

```ts
  log.debug({ userId }, 'getPreferences started');
  const prefs = await model.getByUserId(userId);
  if (!prefs) {
    log.error({ userId }, 'getPreferences failed: preferences not found');
    throw new Error('PREFERENCES_NOT_FOUND');
  }
  log.debug({ userId }, 'getPreferences completed');
```

**Step 3.1.3: `updatePreferences(userId: string, data: any)`**
```ts
  log.debug({ userId }, 'updatePreferences started');
  // ...
  log.debug({ userId }, 'updatePreferences completed');
```

---

#### 3.2 `apps/api/src/modules/taste/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger. 8 functions (7 public + 1 private `flushCache`). Heavy cache usage.

**Step 3.2.1:** Add import + logger:
```ts
import { createLogger } from '../../utils/logger/index.ts';
const log = createLogger('taste-service');
```

**Step 3.2.2: `getHierarchy(cache: CacheProvider)`** — Cache read
```ts
  log.debug({}, 'getHierarchy started');
  // ... cache miss → DB read → cache set ...
  log.debug({ cached: !!cached }, 'getHierarchy completed');
```

**Step 3.2.3: `searchTasteNotes(query: string, _cache: CacheProvider)`** — 1 throw site
```ts
  log.debug({ query }, 'searchTasteNotes started');
  if (query.length < 3) {
    log.warn({ query }, 'searchTasteNotes failed: query too short');
    throw new Error('QUERY_TOO_SHORT');
  }
  // ...
  log.debug({ query, resultCount: results.length }, 'searchTasteNotes completed');
```

**Step 3.2.4: `getFlatList(cache: CacheProvider)`** — Cache read
```ts
  log.debug({}, 'getFlatList started');
  // ...
  log.debug({ cached: !!cached }, 'getFlatList completed');
```

**Step 3.2.5: `getTasteNoteRootMap(cache: CacheProvider): Promise<Record<string, string>>`**
```ts
  log.debug({}, 'getTasteNoteRootMap started');
  // ...
  log.debug({ cached: !!cached, count: Object.keys(result).length }, 'getTasteNoteRootMap completed');
```

**Step 3.2.6: `createTasteNote(data, cache: CacheProvider)`** — Mutation + cache flush
```ts
  log.debug({ name: data.name }, 'createTasteNote started');
  // ...
  log.debug({ name: data.name }, 'flushing taste note cache after create');
  await flushCache(cache);
  log.debug({ name: data.name }, 'createTasteNote completed');
```

**Step 3.2.7: `updateTasteNote(id, data, cache: CacheProvider)`** — Mutation + cache flush
```ts
  log.debug({ id }, 'updateTasteNote started');
  // ...
  log.debug({ id }, 'flushing taste note cache after update');
  await flushCache(cache);
  log.debug({ id }, 'updateTasteNote completed');
```

**Step 3.2.8: `deleteTasteNote(id, cache: CacheProvider)`** — Mutation + cache flush
```ts
  log.debug({ id }, 'deleteTasteNote started');
  // ...
  log.debug({ id }, 'flushing taste note cache after delete');
  await flushCache(cache);
  log.debug({ id }, 'deleteTasteNote completed');
```

**Step 3.2.9: `flushCache(cache: CacheProvider)`** (private function)
```ts
  log.debug({}, 'flushCache started');
  // ... flush logic ...
  log.debug({}, 'flushCache completed');
```

---

#### 3.3 `apps/api/src/modules/qrcode/service.ts` — ZERO LOGGING → FULL

**Current state:** No logger. 1 function with 2 throw sites.

**Step 3.3.1:** Add import + logger:
```ts
import { createLogger } from '../../utils/logger/index.ts';
const log = createLogger('qrcode-service');
```

**Step 3.3.2: `getRecipeQRCode(slug: string, format: 'png' | 'svg', baseUrl: string)`**

```ts
  log.debug({ slug, format }, 'getRecipeQRCode started');
  if (!recipe) {
    log.error({ slug }, 'getRecipeQRCode failed: recipe not found');
    throw new Error('RECIPE_NOT_FOUND');
  }
  if (recipe.visibility === 'draft' || recipe.visibility === 'private') {
    log.warn({ slug, visibility: recipe.visibility }, 'getRecipeQRCode failed: recipe not available');
    throw new Error('RECIPE_NOT_AVAILABLE');
  }
  // ... generate QR ...
  log.debug({ slug, format }, 'getRecipeQRCode completed');
```

---

#### 3.4 `apps/api/src/modules/coffee-variety/service.ts` — PARTIAL → COMPLETE

**Current state:** Has `createLogger('coffee-variety-service')` as `log`. `updateCoffeeVariety` and `deleteCoffeeVariety` are fully logged. 4 read functions are NOT logged.

**Step 3.4.1: `getCoffeeVarietyById(id, deps)`** — Cache read with DI
```ts
  log.debug({ id }, 'getCoffeeVarietyById started');
  // ... cache logic ...
  log.debug({ id, cached: !!cached }, 'getCoffeeVarietyById completed');
```

**Step 3.4.2: `listCoffeeVarieties(params, deps)`** — DI
```ts
  log.debug({ category: params.category, search: params.search, page: params.page, perPage: params.perPage }, 'listCoffeeVarieties started');
  // ...
  log.debug({ total: result.total, page: params.page }, 'listCoffeeVarieties completed');
```

**Step 3.4.3: `createCoffeeVariety(data, userId, deps)`** — DI
```ts
  log.debug({ userId, name: data.name }, 'createCoffeeVariety started');
  // ...
  log.debug({ userId, varietyId: result.id }, 'createCoffeeVariety completed');
```

**Step 3.4.4: `getRecipesForVariety(varietyId, page, perPage, deps)`** — DI
```ts
  log.debug({ varietyId, page, perPage }, 'getRecipesForVariety started');
  // ...
  log.debug({ varietyId, page, perPage, total: result.total }, 'getRecipesForVariety completed');
```

Note: The DI `deps` parameter means tests can inject a mock logger via deps. See Phase 8 Testing.

---

### Phase 4 — API Middleware (4 files)

---

#### 4.1 `apps/api/src/middleware/auth.ts` (CRITICAL — security)

**Current state:** Zero logging. Auth failures (missing/invalid/expired tokens, user not found, banned users) all silent. Catch blocks swallow errors.

**Step 4.1.1:** Add import + logger at top:
```ts
import { createLogger } from '../utils/logger/index.ts';
const log = createLogger('auth-middleware');
```

**Step 4.1.2: `authMiddleware` — Add logging to key decision points**

```ts
// In extractToken — log missing token:
if (!token) {
  log.debug({}, 'authMiddleware no token found in Authorization header');
  return c.json({ message: 'Unauthorized' }, 401);
}

// In token verification catch block (currently swallows error):
catch (err) {
  log.error({ err }, 'authMiddleware token verification failed');
  return c.json({ message: 'Unauthorized' }, 401);
}

// On user not found:
if (!user) {
  log.warn({ userId: payload.sub }, 'authMiddleware user not found for valid token');
  return c.json({ message: 'Unauthorized' }, 401);
}

// On banned user:
if (user.isBanned) {
  log.warn({ userId: user.id }, 'authMiddleware access denied: user is banned');
  return c.json({ message: 'Account suspended' }, 403);
}

// On successful auth:
c.set('userId', user.id);
c.set('user', user);
log.debug({ userId: user.id }, 'authMiddleware authentication successful');
```

**Step 4.1.3: `optionalAuthMiddleware` — Log auth decisions**

```ts
// On successful optional auth:
log.debug({ userId: payload.sub }, 'optionalAuthMiddleware authenticated user');

// On no token (expected — this is optional auth):
log.debug({}, 'optionalAuthMiddleware no auth token supplied (proceeding unauthenticated)');
```

**Step 4.1.4: `adminMiddleware` — Log forbidden access**

```ts
// On non-admin user:
if (user.role !== 'admin') {
  log.warn({ userId: user.id, role: user.role }, 'adminMiddleware access denied: non-admin user');
  return c.json({ message: 'Forbidden' }, 403);
}

// On success:
log.debug({ userId: user.id }, 'adminMiddleware admin access granted');
```

---

#### 4.2 `apps/api/src/middleware/cors.ts` — Log blocked origins

**Current state:** Exports a configured `cors()` constant. No custom logic to inspect requests. The `TODO_logs.md` calls for "Blocked origins in debug" — this requires wrapping the Hono cors middleware.

**Step 4.2.1:** Add import + logger:
```ts
import { createLogger } from '../utils/logger/index.ts';
const log = createLogger('cors-middleware');
```

**Step 4.2.2:** Since Hono's `cors()` handles rejection internally, the approach is to add a debug log in the origin function. If the existing config has a custom `origin` function, add logging there. If it uses the default (which blocks internally), add a note that full blocked-origin logging requires a custom `origin` function. For P2 scope, add the logger and at minimum log middleware application:

```ts
export const corsMiddleware = cors({
  origin: (origin) => {
    // Log how this request was handled
    // ... existing logic ...
    return origin; // or condition check
  },
  // ... existing config ...
});
```

If `corsMiddleware` is already a simple `cors()` call without an origin function, wrap it minimally. The key deliverable is having the logger available. Consult the actual file for exact approach.

---

#### 4.3 `apps/api/src/middleware/rateLimit.ts` — Log rate limit hits

**Current state:** Zero logging. When rate limit exceeded, returns 429 JSON but emits no log.

**Step 4.3.1:** Add import + logger at top:
```ts
import { createLogger } from '../utils/logger/index.ts';
const log = createLogger('rate-limit-middleware');
```

**Step 4.3.2: In `rateLimitMiddleware` — Log when limit exceeded:**

Before the `return c.json({ message: 'Too many requests' }, 429)`:
```ts
log.warn({ ip: c.req.header('x-forwarded-for') || 'unknown', limit: options.limit }, 'rateLimitMiddleware rate limit exceeded');
```

**Step 4.3.3: In `authRateLimitMiddleware` — Same pattern:**

Before the 429 response:
```ts
log.warn({ userId: c.get('userId'), ip: c.req.header('x-forwarded-for') || 'unknown', limit: options.limit }, 'authRateLimitMiddleware rate limit exceeded');
```

---

#### 4.4 `apps/api/src/middleware/requestId.ts` — Log ID generation

**Current state:** 5-line file exporting `requestId()`. Stock Hono middleware.

**Step 4.4.1:** Add import + logger:
```ts
import { createLogger } from '../utils/logger/index.ts';
const log = createLogger('request-id-middleware');
```

**Step 4.4.2:** The stock `hono/request-id` doesn't expose whether an ID was generated or received. For the `TODO_logs.md` requirement of "Generation vs received header (trace)", this would need a custom wrapper. For P2 scope, add the logger for future use and optionally add a trace log:

```ts
import { requestId as honoRequestId } from 'hono/request-id';

export const requestIdMiddleware = honoRequestId({
  // ... existing config ...
});

// Or if wrapping is acceptable:
// Custom middleware that wraps requestId and logs at trace level
```

Check the actual 5-line implementation and add the logger. If it's a one-liner, any expansion should be minimal.

---

### Phase 5 — P2 Web Pages (21 files)

**Goal:** Add mount/unmount `useEffect` logging to all remaining admin and user-facing pages.

All pages follow the same pattern (see Phase 2 reference). For each file:

1. Add `import { createLogger } from '@/utils/logger.ts';` (or relative path `'../../utils/logger.ts'` depending on nesting depth)
2. Add `const log = createLogger('PageName');` (PascalCase matching component)
3. Add mount/unmount `useEffect` at the start of the component

---

#### 5.1 Admin Pages (12 files needing work)

| # | File | Logger Name | Import Path |
|---|------|------------|-------------|
| 1 | `pages/admin/AdminDashboard.tsx` | `'AdminDashboard'` | `'../../utils/logger.ts'` |
| 2 | `pages/admin/AdminUsersPage.tsx` | `'AdminUsersPage'` | `'../../utils/logger.ts'` |
| 3 | `pages/admin/AdminUserCreatePage.tsx` | `'AdminUserCreatePage'` | `'../../utils/logger.ts'` |
| 4 | `pages/admin/AdminUserEditPage.tsx` | `'AdminUserEditPage'` | `'../../utils/logger.ts'` |
| 5 | `pages/admin/AdminUserDetailPage.tsx` | `'AdminUserDetailPage'` | `'../../utils/logger.ts'` |
| 6 | `pages/admin/AdminRecipesPage.tsx` | `'AdminRecipesPage'` | `'../../utils/logger.ts'` |
| 7 | `pages/admin/AdminVendorsPage.tsx` | `'AdminVendorsPage'` | `'../../utils/logger.ts'` |
| 8 | `pages/admin/AdminBadgesPage.tsx` | `'AdminBadgesPage'` | `'../../utils/logger.ts'` |
| 9 | `pages/admin/AdminCompatibilityPage.tsx` | `'AdminCompatibilityPage'` | `'../../utils/logger.ts'` |
| 10 | `pages/admin/AdminCoffeeVarietiesPage.tsx` | `'AdminCoffeeVarietiesPage'` | `'../../utils/logger.ts'` |
| 11 | `pages/admin/AdminAuditLogPage.tsx` | `'AdminAuditLogPage'` | `'../../utils/logger.ts'` |
| 12 | `pages/admin/AdminCachePage.tsx` | `'AdminCachePage'` | `'../../utils/logger.ts'` |

Already done (SKIP): `AdminEquipmentPage`, `AdminTasteNotesPage`

**Mount/unmount pattern for each:**
```tsx
useEffect(() => {
  log.debug({}, 'AdminDashboard mounted');
  return () => { log.debug({}, 'AdminDashboard unmounted'); };
}, []);
```

For pages that load data with `useEffect`, add error logging in catch blocks if present:
```tsx
useEffect(() => {
  async function loadData() {
    try {
      // ... fetch ...
    } catch (err: unknown) {
      log.error({ err }, 'AdminUsersPage loadData failed');
    }
  }
  loadData();
}, []);
```

---

#### 5.2 User-Facing Pages (9 files needing work)

| # | File | Logger Name | Import Path |
|---|------|------------|-------------|
| 1 | `pages/recipes/RecipeVersionsPage.tsx` | `'RecipeVersionsPage'` | `'../../utils/logger.ts'` |
| 2 | `pages/recipes/RecipeComparePage.tsx` | `'RecipeComparePage'` | `'../../utils/logger.ts'` |
| 3 | `pages/beans/BeanListPage.tsx` | `'BeanListPage'` | `'../../utils/logger.ts'` |
| 4 | `pages/setups/SetupListPage.tsx` | `'SetupListPage'` | `'../../utils/logger.ts'` |
| 5 | `pages/equipment/EquipmentCatalogPage.tsx` | `'EquipmentCatalogPage'` | `'../../utils/logger.ts'` |
| 6 | `pages/equipment/EquipmentDetailPage.tsx` | `'EquipmentDetailPage'` | `'../../utils/logger.ts'` |
| 7 | `pages/coffee-varieties/CoffeeVarietiesPage.tsx` | `'CoffeeVarietiesPage'` | `'../../../utils/logger.ts'` |
| 8 | `pages/coffee-varieties/CoffeeVarietyDetailPage.tsx` | `'CoffeeVarietyDetailPage'` | `'../../../utils/logger.ts'` |
| 9 | `pages/TasteNotesPage.tsx` | `'TasteNotesPage'` | `'../utils/logger.ts'` |

Already done (SKIP): `UserProfilePage`, `RecipeFocusModePage`, `StarredRecipesPage`, `EquipmentListPage`

---

### Phase 6 — P2 Context Providers & Hooks (5 files)

---

#### 6.1 `apps/web/src/contexts/ThemeContext.tsx`

```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('ThemeContext');

// In theme toggle:
log.debug({ theme: newTheme }, 'ThemeContext theme changed');
```

---

#### 6.2 `apps/web/src/contexts/I18nContext.tsx`

```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('I18nContext');

// In locale change:
log.debug({ locale: newLocale }, 'I18nContext locale changed');
```

---

#### 6.3 `apps/web/src/hooks/useDebounce.ts`

```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('useDebounce');

// In effect that sets/clears timeout:
useEffect(() => {
  log.trace({ value }, 'useDebounce timer set');
  const timer = setTimeout(() => setDebouncedValue(value), delay);
  return () => {
    log.trace({}, 'useDebounce timer cleared');
    clearTimeout(timer);
  };
}, [value, delay]);
```

Note: Use `log.trace` (not debug) — debounce triggers are extremely high-frequency and would be noisy at debug level.

---

#### 6.4 `apps/web/src/hooks/useUnitSystem.ts`

```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('useUnitSystem');

// On unit system read when preferences change:
const unitSystem = user?.preferences?.unitSystem || 'metric';
log.trace({ unitSystem }, 'useUnitSystem unit system read');
```

Note: This is a one-line context read — minimal logging value. Use `trace` to avoid noise.

---

#### 6.5 `apps/web/src/hooks/useStaticCacheSync.ts` (NEW — NOT in TODO_logs.md)

**Current state:** No logger. Manages cross-tab cache bust via `storage` event listener. Has mount/unmount lifecycle (`addEventListener`/`removeEventListener`). Directly calls `invalidateStaticCache()`.

**Priority: Medium-high.** This hook has more side effects than `useDebounce` or `useUnitSystem` combined.

```ts
import { createLogger } from '@/utils/logger.ts';
const log = createLogger('useStaticCacheSync');

// Add mount/unmount effect:
useEffect(() => {
  log.debug({}, 'useStaticCacheSync mounted');
  return () => { log.debug({}, 'useStaticCacheSync unmounted'); };
}, []);

// In storage event handler:
const handleStorageChange = (event: StorageEvent) => {
  if (event.key === 'brewform-static-cache-bust') {
    log.debug({ key: event.key }, 'useStaticCacheSync cross-tab cache bust detected');
    invalidateStaticCache();
  }
};
```

---

### Phase 7 — Docblock/JSDoc Additions (5 files, independent work)

These are NOT logging-specific — just documentation gaps discovered during the audit.

---

#### 7.1 `apps/api/src/modules/equipment/service.ts` — COMPLETE FILE MISSING JSDOC

**Current state:** 9 exported functions, zero JSDoc blocks. File-level block missing.

**Add file-level JSDoc** (at top of file):
```ts
/**
 * Equipment business-logic / service layer.
 *
 * Handles equipment CRUD operations, search, filtering, and recipe-association
 * queries. All DB access is delegated to {@link ./model.ts} — no Drizzle calls
 * directly from this module.
 */
```

**Add JSDoc to each function** (exact text):

| Function | JSDoc |
|----------|-------|
| `getEquipment(id)` | `/** Get equipment by ID with 24h cache. Returns null if not found. */` |
| `getEquipmentById(id)` | `/** Get equipment by ID with 24h caching. Returns null if not found. */` |
| `listEquipmentWithFilters(params)` | `/** List equipment with optional type and search filters, paginated. */` |
| `searchEquipment(query)` | `/** Search non-deleted equipment by name or description. */` |
| `createEquipment(userId, data)` | `/** Create a new equipment entry. @param userId - The ID of the creating user @param data - Equipment fields to insert @returns The created equipment row */` |
| `updateEquipment(userId, id, data)` | `/** Update an equipment entry. Only the creator may update. @param userId - The ID of the requesting user @param id - Equipment ID to update @param data - Fields to patch @throws EQUIPMENT_NOT_FOUND if equipment doesn't exist @throws FORBIDDEN if user is not the creator */` |
| `deleteEquipment(userId, id)` | `/** Soft-delete an equipment entry. Only the creator may delete. @param userId - The ID of the requesting user @param id - Equipment ID to delete @throws EQUIPMENT_NOT_FOUND if equipment doesn't exist @throws FORBIDDEN if user is not the creator */` |
| `requestEquipmentDeletion(equipmentId, userId, reason?)` | `/** Submit a deletion request for equipment. @param equipmentId - The equipment to request deletion for @param userId - The requesting user @param reason - Optional reason for deletion @throws EQUIPMENT_NOT_FOUND if equipment doesn't exist */` |
| `getRecipesForEquipment(equipmentId, page, perPage)` | `/** List paginated recipes that use the given equipment. */` |

---

#### 7.2 `apps/api/src/modules/coffee-variety/service.ts` — FILE-LEVEL + 4 FUNCTIONS MISSING

**Add file-level JSDoc:**
```ts
/**
 * Coffee variety business-logic / service layer.
 *
 * Manages user-defined and system-defined coffee variety records with
 * CRUD operations, caching, and recipe association queries. System varieties
 * are immutable by non-admin users. All DB access is delegated to
 * {@link ./model.ts}.
 */
```

**Add JSDoc to 4 functions:**

| Function | JSDoc |
|----------|-------|
| `getCoffeeVarietyById(id, deps?)` | `/** Get a coffee variety by ID with 24h caching. Returns null if not found. */` |
| `listCoffeeVarieties(params, deps?)` | `/** List coffee varieties with optional category and search filters, paginated. */` |
| `createCoffeeVariety(data, userId, deps?)` | `/** Create a new user-defined coffee variety. */` |
| `getRecipesForVariety(varietyId, page, perPage, deps?)` | `/** List paginated recipes that use the given coffee variety. */` |

Note: `updateCoffeeVariety` (lines 52-61) and `deleteCoffeeVariety` (lines 94-103) already have proper JSDoc — do NOT modify.

---

#### 7.3 `apps/api/src/middleware/rateLimit.ts` — COMPLETE FILE MISSING JSDOC

**Current state:** Zero JSDoc — no file-level, no function-level, no type-level. 93 lines.

**Add file-level JSDoc:**
```ts
/**
 * Rate limiting middleware for the API.
 *
 * Provides two middleware factories:
 * - {@link rateLimitMiddleware} — IP-based rate limiting for unauthenticated endpoints.
 * - {@link authRateLimitMiddleware} — User-ID-based rate limiting for authenticated endpoints.
 *
 * Uses an in-memory store (Map) with per-entry timestamps. Entries are automatically
 * expired after the configured window duration.
 */
```

**Add JSDoc to exports:**
```ts
/** In-memory rate limit tracking entry. */
interface RateLimitEntry { ... }

/**
 * Create an IP-based rate limiting middleware.
 *
 * @param options.limit - Maximum requests within the window (default: 100)
 * @param options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns Hono middleware function
 */
export function rateLimitMiddleware(options: ...) { ... }

/**
 * Create a user-ID-based rate limiting middleware for authenticated endpoints.
 *
 * Falls back to IP-based limiting when no user is authenticated.
 *
 * @param options.limit - Maximum requests within the window (default: 100)
 * @param options.windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns Hono middleware function
 */
export function authRateLimitMiddleware(options: ...) { ... }
```

---

#### 7.4 `apps/api/src/middleware/requestId.ts` — MISSING JSDOC

**Current state:** 5-line file. No JSDoc.

**Add:**
```ts
/**
 * Request ID middleware.
 *
 * Attaches a unique request identifier (UUID v4) to every incoming request
 * via the {@link https://hono.dev/docs/middleware/builtin/request-id | hono/request-id} middleware.
 * The ID is accessible via `c.get('requestId')`.
 */
export const requestIdMiddleware = requestId();
```

---

#### 7.5 `apps/api/src/middleware/cors.ts` — CONVERT COMMENT TO FORMAL JSDOC

**Current state:** Has a `/* ... */` block comment (non-JSDoc). Content is good, just needs `/**`.

**Action:** Change the opening `/*` to `/**` on the existing file-level comment block.

---

### Phase 8 — Tests

**Goal:** Add logging assertions to existing tests and create tests for untested code.

#### Logger Mocking Patterns

**For Deno test runner (API services):**
```ts
import { createLogger } from '../../utils/logger/index.ts';
import { spy, assertSpyCalls, assertSpyCallArgs } from 'jsr:@std/testing/mock';

// Spy on the module-level createLogger result
const logSpy = {
  debug: spy(),
  info: spy(),
  warn: spy(),
  error: spy(),
};
// Then in tests, verify: assertSpyCalls(logSpy.debug, 2) or assertSpyCallArgs(logSpy.debug, 0, [{ userId: '...' }, 'fnName started'])
```

**For Vitest (web pages/components):**
```ts
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), trace: vi.fn(), fatal: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

// In test:
expect(mockLogger.debug).toHaveBeenCalledWith({}, 'PageName mounted');
expect(mockLogger.debug).toHaveBeenCalledWith({}, 'PageName unmounted');
```

---

#### 8.1 API Service Tests — Files to Update

**Vendor service** (`apps/api/src/modules/vendor/service.test.ts`) — ADD error logging assertions:
- In `getVendor` test: assert `log.error` called with `{ id: 'nonexistent' }` when vendor not found
- In `updateVendor` test: assert `log.error` for VENDOR_NOT_FOUND, `log.warn` for FORBIDDEN
- In `deleteVendor` test: assert `log.error` for VENDOR_NOT_FOUND

**Coffee variety service** (`apps/api/src/modules/coffee-variety/service.test.ts`) — ADD logging assertions:
- For the 4 unlogged functions (`getCoffeeVarietyById`, `listCoffeeVarieties`, `createCoffeeVariety`, `getRecipesForVariety`): assert `log.debug` entry/exit called
- Since this service uses DI, inject a spy logger via `deps`

**Bean service** (`apps/api/src/modules/bean/service.test.ts`) — REWRITE + ADD logging assertions:
- Current test is 14 lines, doesn't test real service
- Rewrite as integration tests (like vendor) or use mock model (like coffee-variety)
- Assert `log.debug` entry/exit on all 5 functions
- Assert `log.error` on BEAN_NOT_FOUND, `log.warn` on FORBIDDEN

**Setup service** (`apps/api/src/modules/setup/service.test.ts`) — REWRITE + ADD logging assertions:
- Current test is 42 lines, doesn't test real service
- Assert `log.debug` entry/exit on all 6 functions
- Assert error/warn logging on throw sites
- Assert `log.debug` around `clearDefaultForUser` calls

**User service** (`apps/api/src/modules/user/service.test.ts`) — REWRITE + ADD logging assertions:
- Current test is 73 lines, uses inline mock model, doesn't test real service
- Assert `log.debug` and `log.error` on all 4 functions

**Report service** — CREATE `apps/api/src/modules/report/service.test.ts` FROM SCRATCH:
- Test `createReport`: assert entry/exit + error cases
- Test `listReports`: assert entry/exit
- Test `resolveReport`: assert entry/exit + REPORT_NOT_FOUND + REPORT_ALREADY_RESOLVED
- Assert `log.info` on `createReport` and `resolveReport`

**Preference service** (`apps/api/src/modules/preference/service.test.ts`) — REWRITE:
- Current test only tests data transformation, not the actual service
- Test `getPreferences` and `updatePreferences`
- Assert `log.debug` and `log.error` on PREFERENCES_NOT_FOUND

**Taste service** (`apps/api/src/modules/taste/service.test.ts`) — ADD service-level tests:
- Current test only tests cache behavior, not service functions directly
- Add tests for `searchTasteNotes` asserting `log.warn` on QUERY_TOO_SHORT
- Add tests for `createTasteNote`, `updateTasteNote`, `deleteTasteNote` asserting entry/exit + cache flush logging

**QR code service** (`apps/api/src/modules/qrcode/service.test.ts`) — EXPAND:
- Current test is 20 lines, only tests slug generation
- Add service tests for `getRecipeQRCode`
- Assert `log.error` on RECIPE_NOT_FOUND, `log.warn` on RECIPE_NOT_AVAILABLE

---

#### 8.2 Middleware Tests — Files to Create

**Auth middleware** — CREATE `apps/api/src/middleware/auth.test.ts`:
- Test `authMiddleware`: assert warn/error on missing token, invalid token, user not found, banned user
- Test `optionalAuthMiddleware`: assert debug on no token (expected), debug on authenticated
- Test `adminMiddleware`: assert warn on non-admin user, assert debug on allowed admin
- Mock `c.env.JWT_SECRET` for token verification tests

**Rate limit middleware** — CREATE `apps/api/src/middleware/rateLimit.test.ts`:
- Test `rateLimitMiddleware`: assert `log.warn` when limit exceeded
- Test `authRateLimitMiddleware`: assert `log.warn` when limit exceeded with user ID

---

#### 8.3 Web Tests — Files to Update

For files that ALREADY have tests, add the `vi.hoisted` mockLogger pattern and assert mount/unmount:

| Test File | Status |
|-----------|--------|
| `LoginPage.test.tsx` | Add mount/unmount logger assertions (LoginPage already has logging!) |
| `RegisterPage.test.tsx` | Add mount/unmount logger assertions |
| `RecipeVersionsPage.test.tsx` | Add mount/unmount logger assertions + error catch assertions |
| `EquipmentCatalogPage.test.tsx` | Add mount/unmount logger assertions |
| `EquipmentDetailPage.test.tsx` | Add mount/unmount logger assertions |
| `CoffeeVarietiesPage.test.tsx` | Add mount/unmount logger assertions |
| `CoffeeVarietyDetailPage.test.tsx` | Add mount/unmount logger assertions |
| `TasteNotesPage.test.tsx` | Add mount/unmount logger assertions |

For files WITHOUT tests (most P2 admin pages, most auth pages), skip — mount/unmount logging is additive and low risk.

For `AuthContext` and `ErrorBoundary` (both have NO tests), creating full component tests is out of scope for this logging PR. Add a note in the PR description that these should have tests in a follow-up.

---

### Phase 9 — Verification (run in order)

```bash
# 1. Format all changes
make fmt

# 2. Lint — must pass with zero errors
make lint

# 3. Type-check API
make check-api

# 4. Type-check web
make check-web

# 5. Run all tests
make test

# 6. If any test fails, fix and re-run
```

### Phase 10 (Optional) — Cross-Cutting Improvements

These are OUT OF SCOPE for this PR but noted for future work:

- [ ] Add `performance.now()` timing to service entry/exit logs
- [ ] Add `http` module logger with method, path, status, duration
- [ ] Add `db` module logger for slow query detection
- [ ] Web: add navigation timing logs
- [ ] Web: log unhandled promise rejections
- [ ] Fix `data: any` params in bean, setup, preference services (not logging)
- [ ] Fix missing existence check in `user/service.ts` `deleteAccount`

---

### Dependency Graph Between Phases

```
Phase 1 (API services) ─── independent, can be done first
Phase 2 (Web P1 pages) ─── independent, can run parallel to Phase 1
Phase 3 (P2 services) ──── depends on Phase 1 (uses same patterns)
Phase 4 (Middleware) ────── independent
Phase 5 (P2 pages) ──────── depends on Phase 2 (same patterns)
Phase 6 (Hooks) ─────────── independent
Phase 7 (JSDoc) ─────────── independent of all others
Phase 8 (Tests) ─────────── depends on Phases 1-6 being complete
Phase 9 (Verify) ────────── depends on ALL phases
Phase 10 (Optional)─────── independent, future work
```

Recommended execution order: **1 → 2 (parallel) → 3 → 4 (parallel) → 5 → 6 → 7 → 8 → 9**

---

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Additive changes only — no behavior modification | Low | All changes are `import` + `log.x()` calls |
| Debug logs filtered in production (LOG_LEVEL=info) | Low | Zero production log volume increase |
| Pino redacts sensitive fields automatically | Low | passwordHash, token, secret etc. protected |
| New test assertions could fail | Low | Tests are additive, verify only new log behavior |
| Incorrect import paths in web pages | Medium | Check nesting depth; `@/utils/logger.ts` alias always works |
| Auth middleware changes break auth | Medium | Carefully test token flow; the logging code is additive around existing logic |

---

### Summary: File Count

| Category | Modify | Create | Skip (already done) |
|----------|--------|--------|---------------------|
| P1 API services | 5 | 0 | 1 (vendor partial) |
| P1 Web pages + components | 6 | 0 | 0 |
| P2 API services | 4 | 0 | 0 |
| P2 Middleware | 4 | 0 | 0 |
| P2 Admin pages | 12 | 0 | 2 |
| P2 User pages | 9 | 0 | 4 |
| P2 Context/Hooks | 5 | 0 | 0 |
| JSDoc additions | 5 (doc-only) | 0 | 0 |
| API tests | 8 (update) | 1 (report) | 0 |
| Middleware tests | 0 | 2 (auth, rateLimit) | 0 |
| Web tests | 8 (update) | 0 | ~12 (skip) |
| **TOTAL** | **66 operations** | **3 new files** | **7 already done** |
