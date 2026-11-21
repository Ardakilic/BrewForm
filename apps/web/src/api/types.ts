/**
 * Web-side API payload types that have no shared Zod schema (admin projections, request
 * bodies, small response shapes). Kept outside `api/index.ts` so pages and components can
 * import them without importing the API client (the data-loading lint rule restricts
 * `api/client.ts`, `api/index.ts` and `api/static-cache.ts`). `api/index.ts` re-exports them.
 */
import type { RecipeVersionRow, UserPreferences } from '@brewform/shared/schemas';

/** Rate-route response: `{ rating, avgRating, ratingCount }` returned by POST /recipes/:id/rate. */
export type RateResponse = {
  rating: number;
  avgRating: number | null;
  ratingCount: number;
};

/** `GET /recipes/:slug/versions` payload: the recipe title/slug plus its version rows. */
export interface RecipeVersionsResponse {
  title: string;
  slug: string;
  versions: RecipeVersionRow[];
}

/** Preferences patch body: any subset of the preference fields, plus the onboarding flag. */
export type PreferencesPatch = Partial<UserPreferences> & { onboardingCompleted?: boolean };

/** Contact-form payload posted to `POST /contact`. */
export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/** Admin user-management payload for create (`POST /admin/users`). */
export interface AdminUserCreate {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  bio?: string;
  isAdmin?: boolean;
  isBanned?: boolean;
}

/** Admin user-management payload for update (`PATCH /admin/users/:id`). */
export type AdminUserUpdate = Partial<AdminUserCreate>;

/** Admin user-list row — the core account fields surfaced in the admin users table. */
export interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
}

/** Admin user-detail projection — {@link AdminUser} plus bio, `updatedAt`, and profile counts. */
export interface AdminUserDetail extends AdminUser {
  bio: string | null;
  updatedAt: string;
  recipeCount?: number;
  followerCount?: number;
  followingCount?: number;
}

/**
 * Admin dashboard counters returned by `GET /admin/stats` (`getDashboardStats` in
 * `apps/api/src/modules/admin/model.ts`; the keys are pinned by the route test in
 * `apps/api/src/modules/admin/index.test.ts`). "Today" starts at the server's local midnight.
 */
export interface AdminDashboardStats {
  totalUsers: number;
  totalRecipes: number;
  totalComments: number;
  totalReports: number;
  pendingReports: number;
  newUsersToday: number;
  newRecipesToday: number;
}

/**
 * Admin recipe-moderation row returned by `GET /admin/recipes`. The author is always present:
 * admin pages keep the name of a deleted account.
 */
export interface AdminRecipe {
  id: string;
  title: string;
  slug: string;
  visibility: string;
  author: { id: string; username: string; displayName: string | null };
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

/** Admin vendor create/update body. */
export interface AdminVendorInput {
  name: string;
  website?: string;
  description?: string;
}

/** Brew-method × equipment-type compatibility rule managed at `/admin/compatibility`. */
export interface CompatibilityRule {
  id: string;
  brewMethod: string;
  equipmentType: string;
  isCompatible: boolean;
}

/** Admin audit-log row returned by `GET /admin/audit-log`. */
export interface AuditLogEntry {
  id: string;
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
  admin?: { username: string };
}

/** Coffee-variety typeahead result — `id`, `name`, and `category` for the search dropdown. */
export interface CoffeeVarietySearchResult {
  id: string;
  name: string;
  category: string;
}
