# TODO — Log Coverage Expansion

Next steps to increase structured logging coverage across the BrewForm codebase.  
PR #1 covered the infrastructure and key paths; this lists what remains.

---

## P1 — High Priority (data mutations, auth, external calls)

### API Services

| Module | File | Notes |
|--------|------|-------|
| user | `apps/api/src/modules/user/service.ts` | Profile reads/writes, follow relationships |
| vendor | `apps/api/src/modules/vendor/service.ts` | Equipment vendor CRUD |
| bean | `apps/api/src/modules/bean/service.ts` | Bean CRUD, user-owned data |
| setup | `apps/api/src/modules/setup/service.ts` | Brewing setup CRUD |
| report | `apps/api/src/modules/report/service.ts` | Content moderation reports |
| coffee-variety | `apps/api/src/modules/coffee-variety/service.ts` | Coffee variety CRUD |

### Web Pages

| Page | File | Notes |
|------|------|-------|
| Create Recipe | `apps/web/src/pages/recipes/RecipeCreatePage.tsx` | Form submission, validation errors |
| Edit Recipe | `apps/web/src/pages/recipes/RecipeEditPage.tsx` | Data fetching + mutation |
| Login | `apps/web/src/pages/auth/LoginPage.tsx` | ✅ done |
| Register | `apps/web/src/pages/auth/RegisterPage.tsx` | ✅ done |
| Forgot Password | `apps/web/src/pages/auth/ForgotPasswordPage.tsx` | Email submission |
| Reset Password | `apps/web/src/pages/auth/ResetPasswordPage.tsx` | Token consumption |
| Verify Email | `apps/web/src/pages/auth/VerifyEmailPage.tsx` | Token verification |
| Settings | `apps/web/src/pages/settings/SettingsPage.tsx` | Account/profile mutations |

### Context Providers

| Provider | File | Notes |
|----------|------|-------|
| AuthContext | `apps/web/src/contexts/AuthContext.tsx` | Login state changes, token refresh, errors |

### Components

| Component | File | Notes |
|-----------|------|-------|
| ErrorBoundary | `apps/web/src/components/ErrorBoundary.tsx` | Catch render errors, log stack traces |

---

## P2 — Medium Priority (admin operations, secondary pages, integrations)

### API Services

| Module | File | Notes |
|--------|------|-------|
| preference | `apps/api/src/modules/preference/service.ts` | User preference CRUD |
| taste | `apps/api/src/modules/taste/service.ts` | Cached reads, hierarchy tips |
| qrcode | `apps/api/src/modules/qrcode/service.ts` | QR code generation |

### API Middleware

| Middleware | File | Notes |
|------------|------|-------|
| auth | `apps/api/src/middleware/auth.ts` | Auth success/failure, token validation timing |
| cors | `apps/api/src/middleware/cors.ts` | Blocked origins in debug |
| rateLimit | `apps/api/src/middleware/rateLimit.ts` | Rate limit hits (warn level) |
| requestId | `apps/api/src/middleware/requestId.ts` | Generation vs received header (trace) |

### Web Pages (Admin)

| Page | File |
|------|------|
| Admin Dashboard | `apps/web/src/pages/admin/AdminDashboard.tsx` |
| Admin Users | `apps/web/src/pages/admin/AdminUsersPage.tsx` |
| Admin User Create | `apps/web/src/pages/admin/AdminUserCreatePage.tsx` |
| Admin User Edit | `apps/web/src/pages/admin/AdminUserEditPage.tsx` |
| Admin User Detail | `apps/web/src/pages/admin/AdminUserDetailPage.tsx` |
| Admin Recipes | `apps/web/src/pages/admin/AdminRecipesPage.tsx` |
| Admin Equipment | `apps/web/src/pages/admin/AdminEquipmentPage.tsx` |
| Admin Vendors | `apps/web/src/pages/admin/AdminVendorsPage.tsx` |
| Admin Taste Notes | `apps/web/src/pages/admin/AdminTasteNotesPage.tsx` |
| Admin Badges | `apps/web/src/pages/admin/AdminBadgesPage.tsx` |
| Admin Compatibility | `apps/web/src/pages/admin/AdminCompatibilityPage.tsx` |
| Admin Coffee Varieties | `apps/web/src/pages/admin/AdminCoffeeVarietiesPage.tsx` |
| Admin Audit Log | `apps/web/src/pages/admin/AdminAuditLogPage.tsx` |
| Admin Cache | `apps/web/src/pages/admin/AdminCachePage.tsx` |

### Web Pages (User-facing)

| Page | File | Notes |
|------|------|-------|
| User Profile | `apps/web/src/pages/users/UserProfilePage.tsx` | Follow/block actions |
| Recipe Versions | `apps/web/src/pages/recipes/RecipeVersionsPage.tsx` | Version loading |
| Recipe Compare | `apps/web/src/pages/recipes/RecipeComparePage.tsx` | Comparison loading |
| Recipe Focus Mode | `apps/web/src/pages/recipes/RecipeFocusModePage.tsx` | Specialty view |
| Starred Recipes | `apps/web/src/pages/recipes/StarredRecipesPage.tsx` | Favourite list |
| Bean List | `apps/web/src/pages/beans/BeanListPage.tsx` | CRUD |
| Setup List | `apps/web/src/pages/setups/SetupListPage.tsx` | CRUD |
| Equipment Catalog | `apps/web/src/pages/equipment/EquipmentCatalogPage.tsx` | Browsing |
| Equipment Detail | `apps/web/src/pages/equipment/EquipmentDetailPage.tsx` | Viewing |
| Equipment List | `apps/web/src/pages/equipment/EquipmentListPage.tsx` | CRUD |
| Coffee Varieties | `apps/web/src/pages/coffee-varieties/CoffeeVarietiesPage.tsx` | Browsing/admin |
| Coffee Variety Detail | `apps/web/src/pages/coffee-varieties/CoffeeVarietyDetailPage.tsx` | Viewing |
| Taste Notes | `apps/web/src/pages/TasteNotesPage.tsx` | Browsing |

### Context Providers

| Provider | File |
|----------|------|
| ThemeContext | `apps/web/src/contexts/ThemeContext.tsx` |
| I18nContext | `apps/web/src/contexts/I18nContext.tsx` |

### Hooks

| Hook | File |
|------|------|
| useDebounce | `apps/web/src/hooks/useDebounce.ts` |
| useUnitSystem | `apps/web/src/hooks/useUnitSystem.ts` |

---

## P3 — Low Priority (static pages, read-only pass-through)

### Web Pages

| Page | File | Notes |
|------|------|-------|
| Recipe Not Available | `apps/web/src/pages/recipes/RecipeNotAvailablePage.tsx` | Static message |
| Terms | `apps/web/src/pages/TermsPage.tsx` | Static content |
| Privacy | `apps/web/src/pages/PrivacyPage.tsx` | Static content |
| Contact | `apps/web/src/pages/ContactPage.tsx` | Static content |
| Error | `apps/web/src/pages/ErrorPage.tsx` | Already has error handling |
| NotFound | `apps/web/src/pages/NotFoundPage.tsx` | Simple 404 |
| Admin Layout | `apps/web/src/pages/admin/AdminLayout.tsx` | Wrapper, no logic |

### Components

| Component | File | Notes |
|-----------|------|-------|
| CookieConsent | `apps/web/src/components/CookieConsent.tsx` | One-time banner |
| EmailVerificationBanner | `apps/web/src/components/EmailVerificationBanner.tsx` | Conditional banner |

---

## Cross-Cutting Improvements

These apply across all modules once coverage is built:

- [ ] Add `performance.now()` timing to service entry/exit logs for latency tracking
- [ ] Add log sampling rate config (`LOG_SAMPLE_RATE`) to reduce volume in production
- [ ] Standardize log object keys: always `userId`, `recipeId`, `equipmentId` (camelCase IDs)
- [ ] Add `http` module to API logger with request method, path, status code, duration
- [ ] Add `db` module logger for slow query detection (>100ms warns)
- [ ] Consider structured error serialization (error code + message + stack) in error log objects
- [ ] Web: add navigation timing logs via `performance.getEntriesByType('navigation')`
- [ ] Web: log unhandled promise rejections via `window.addEventListener('unhandledrejection')`
