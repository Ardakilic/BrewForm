# F16 — Automated Badge Criteria Expansion

> **Validation status (2026-08-13): refreshed — corrections below**
>
> **Note:** The body below this line is the pre-refresh draft (including the 2026-07-13 banner, whose line numbers have drifted); treat the corrections in this banner as authoritative. Core approach still holds: 7 new rules + checks + 2 missing triggers + net-new gallery. No active OpenSpec change exists (`openspec/changes/` contains only `archive/`).
>
> - Rule single-sourcing confirmed, updated lines: `BADGE_RULES` (exactly 10 rules) at packages/shared/src/constants/badges.ts:2-73 → `BADGE_RULE_VALUES` (:91) → `badgeRuleEnum = pgEnum('badge_rule', [...BADGE_RULE_VALUES])` (packages/db/src/schema.ts:58). Extend `BADGE_RULES` in shared — never hand-edit the pgEnum. `checks` is typed `Array<{ rule: BadgeRule; met: boolean }>` (apps/api/src/modules/badge/model.ts:117), so new string literals won't type-check until `BADGE_RULES` grows. Enum-value migration via `make db-generate && make db-migrate` (AGENTS.md snapshot rules apply).
> - Seed: `badgeSeedData` at packages/db/src/seed-users-recipes.ts:12; `seedBadges` (packages/db/src/seed.ts:175-181) already loops it with `onConflictDoNothing` on `badges.rule` — just append entries to `badgeSeedData`, do NOT add the plan's separate insert loop to seed.ts. Tests to update: packages/db/src/seed.test.ts:77-88 (unique rules, positive thresholds) and :394-400 (social seed must reference valid rules); seed.idempotent.test.ts:204 compares against `badgeSeedData.length` dynamically (no change needed).
> - Triggers ALREADY EXIST (fire-and-forget): followUser (apps/api/src/modules/follow/service.ts:50), createRecipe (apps/api/src/modules/recipe/service.ts:243), forkRecipe (:399), comment create (apps/api/src/modules/comment/service.ts:115). STILL MISSING — the only net-new trigger work: `toggleLike` (recipe/service.ts:660, which since F05 also fans out `createLikeNotification` at :666-683) and `upsertUserRating` (recipe/service.ts:807, a pure model passthrough).
> - Cron needs NO change (drop Goal 4): `Deno.cron('evaluate-badges', '0 * * * *')` at apps/api/src/utils/jobs/cron.ts:10-17 calls `evaluateAllBadges` (apps/api/src/modules/badge/service.ts:35-56), which re-runs `evaluateBadges` per user — new checks are picked up automatically.
> - API claims wrong: there is no `GET /users/:id` — the route is `GET /users/:username`, and `getPublicProfile` stubs `badges: []` (apps/api/src/modules/user/service.ts:66). Profile badges are NET-NEW wiring: populate from `getUserBadges` (badge/model.ts:26) or fetch `GET /badges/user/:userId` (apps/api/src/modules/badge/index.ts:42) client-side. `GET /badges` exists (badge/index.ts:19); admin-only `POST /badges/evaluate/:userId` also exists (:69).
> - Frontend is ALL net-new: no `BadgeGallery`/`BadgeCard`/`BadgeIcon` anywhere; `components/user/` holds only FollowButton, `components/icons/` only `equipment/`. Current display is the inline badges tab in apps/web/src/pages/users/UserProfilePage.tsx:240-258. `AdminBadgesPage.tsx` already lists all badges for admins. Web types: `apps/web/src/api/types.ts` was DELETED (D42) — use `BadgeOutput`/`UserBadgeOutput` (z.infer) from packages/shared/src/schemas/responses/badge.ts:14,:41.
> - Icon mismatch to decide: DB seed icons are shortcode names ('coffee', 'fork_and_knife' — seed-users-recipes.ts:15,:36) while `BADGE_RULES` uses emoji, and web renders `b.icon` as raw text (UserProfilePage.tsx:247, AdminBadgesPage.tsx:44) — no icon map or icon component exists. Simplest: seed emoji like `BADGE_RULES`; otherwise the plan's `BadgeIcon` map becomes real work.
> - `taste_explorer`: 11 brew methods confirmed (packages/shared/src/constants/brew-methods.ts:2-66) — use `BREW_METHOD_VALUES` (constants/index.ts:29) instead of the plan's hardcoded array.
> - `equipment_collector` ambiguity: US-16.3 says "equipment items" and the plan's schema comment says "in setups", but the plan's query counts `recipeEquipment` rows (schema.ts:293). `setups` (schema.ts:564-594) instead has 5 nullable equipment FKs (portafilter/basket/puckScreen/paperFilter/tamper) — decide the semantics before implementing.
> - F05 interaction: badge awards do NOT fan out notifications, and the notifications spec explicitly defers a `badge` notification type (openspec/specs/notifications/spec.md:118, "deferred YAGNI — no call sites"). Adding badge-awarded notifications is a separate spec change — skip unless requested.
> - Stale References in body: `evaluateBadges` is badge/model.ts:54-142 (not :52), `evaluateAllBadges` is badge/service.ts:35 (not :36), `badgeRuleEnum` is schema.ts:58 (not :94), `badges` table is schema.ts:724-740 (not :611), `userBadges` is schema.ts:743-756.

> **Validation status (2026-07-13): ⚠️ Outdated — much already wired**
>
> - Badge rules single-sourced from `BADGE_RULES` (packages/shared/src/constants/badges.ts:1-72, exactly 10) → `BADGE_RULE_VALUES` (:89) → `badgeRuleEnum` (schema.ts:50). Add new rules to BADGE_RULES (NOT a hand-edited pgEnum); `evaluateBadges` types `checks` as `Array<{ rule: BadgeRule; met }>` (badge/model.ts:118) so string literals won't type-check until BADGE_RULES is extended.
> - Seed data is the hand-written array `badgeSeedData` in packages/db/src/seed-users-recipes.ts:10 (consumed by `seedBadges`, seed.ts:174) — NOT seed.ts as the plan says; `seed.test.ts` asserts every seed rule is valid, so update there too.
> - Triggers ALREADY EXIST (fire-and-forget `evaluateBadges`): followUser (follow/service.ts:46), createRecipe (recipe/service.ts:241), forkRecipe (:397), comment create (comment/service.ts:115). Only the LIKE (`toggleLike`, recipe/service.ts:565) and RATING (`upsertUserRating`) triggers are still missing — add those two; the plan's follow/create triggers are redundant.
> - evaluateBadges shape confirmed (badge/model.ts:53-141): count queries → `checks[]` → insert userBadges with onConflictDoNothing. New checks slot in cleanly. 11 brew methods for taste_explorer match BREW_METHOD_VALUES.
> - Frontend: there is NO `BadgeGallery.tsx` — badges render inline in apps/web/src/pages/users/UserProfilePage.tsx; the "enhanced gallery" is net-new, not an edit.

## Overview

Expand the existing badge system with social badges (first follow, follower milestones), equipment badges, taste badges, and community badges. Extends the existing `badgeRuleEnum` and badge evaluation logic — no new tables.

## Goals

1. Add 7 new badge rules to existing enum
2. Seed new badge definitions
3. Extend badge evaluation logic in `evaluateBadges()`
4. Update cron job to evaluate new badge types
5. Enhanced BadgeGallery on UserProfilePage

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-16.1 | As a user, I earn a "First Follow" badge when I follow someone | P0 |
| US-16.2 | As a user, I earn "Social Butterfly" when I reach 50 followers | P1 |
| US-16.3 | As a user, I earn "Equipment Collector" when I have 5+ equipment items | P1 |
| US-16.4 | As a user, I earn "Taste Explorer" when I've tried all brew methods | P1 |
| US-16.5 | As a user, I earn "Community Helper" when I have 10+ comments | P1 |
| US-16.6 | As a user, I earn "Recipe Master" when I have 10+ recipes | P0 (overlaps with existing decade_brewer) |
| US-16.7 | As a user, I earn "Feedback Provider" when I've rated 50 recipes | P2 |
| US-16.8 | As a user, I see all my badges in an enhanced gallery on my profile | P1 |

## Technical Design

### Schema Changes

Extend `badgeRuleEnum` in `packages/db/src/schema.ts`:

```ts
badgeRuleEnum = pgEnum('badge_rule', [
  // Existing (keep all)
  'first_brew',
  'decade_brewer',
  'centurion',
  'first_fork',
  'fan_favourite',
  'community_star',
  'conversationalist',
  'precision_brewer',
  'explorer',
  'influencer',

  // NEW social badges
  'first_follow',          // Followed someone for the first time
  'social_butterfly',      // 50 followers

  // NEW equipment badge
  'equipment_collector',   // 5+ equipment items in setups

  // NEW taste badge
  'taste_explorer',        // Tried all 11 brew methods

  // NEW community badges
  'community_helper',      // 10+ comments (overlaps with conversationalist)
  'recipe_master',         // 10+ recipes (overlaps with decade_brewer)
  'feedback_provider',     // Rated 50 recipes
]);
```

**Note:** `community_helper` and `recipe_master` overlap with existing `conversationalist` (10+ comments) and `decade_brewer` (10+ recipes). These are intentionally kept as separate badges with different display names for better UX — users see more descriptive badge names.

### Badge Definitions Seed

Add to `packages/db/src/seed.ts`:

```ts
const newBadges = [
  {
    name: 'First Follow',
    icon: 'user-plus',
    description: 'Followed another brewer for the first time',
    rule: 'first_follow',
    threshold: 1,
  },
  {
    name: 'Social Butterfly',
    icon: 'users',
    description: 'Gained 50 followers',
    rule: 'social_butterfly',
    threshold: 50,
  },
  {
    name: 'Equipment Collector',
    icon: 'coffee',
    description: 'Added 5 or more equipment items',
    rule: 'equipment_collector',
    threshold: 5,
  },
  {
    name: 'Taste Explorer',
    icon: 'compass',
    description: 'Tried all brew methods',
    rule: 'taste_explorer',
    threshold: 11, // all brew methods
  },
  {
    name: 'Community Helper',
    icon: 'message-circle',
    description: 'Left 10 or more comments',
    rule: 'community_helper',
    threshold: 10,
  },
  {
    name: 'Recipe Master',
    icon: 'award',
    description: 'Created 10 or more recipes',
    rule: 'recipe_master',
    threshold: 10,
  },
  {
    name: 'Feedback Provider',
    icon: 'star',
    description: 'Rated 50 or more recipes',
    rule: 'feedback_provider',
    threshold: 50,
  },
];

// Insert with onConflictDoNothing to avoid duplicates
for (const badge of newBadges) {
  await db.insert(badges)
    .values(badge)
    .onConflictDoNothing({ target: [badges.rule] });
}
```

### Badge Evaluation Logic

Extend `evaluateBadges()` in `apps/api/src/modules/badge/model.ts`:

```ts
export async function evaluateBadges(userId: string) {
  // ... existing queries (userRecipes, userComments, userForks, userFollowers, etc.) ...

  // NEW queries
  const userFollowingResult = await db.select({ count: count() }).from(userFollows)
    .where(eq(userFollows.followerId, userId));
  const userFollowing = userFollowingResult[0].count;

  const userEquipmentResult = await db.select({ count: count() })
    .from(recipeEquipment)
    .innerJoin(recipeVersions, eq(recipeEquipment.recipeVersionId, recipeVersions.id))
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(and(eq(recipes.authorId, userId), isNull(recipes.deletedAt)));
  const userEquipmentCount = userEquipmentResult[0].count;

  const distinctMethodsResult = await db.selectDistinct({ brewMethod: recipeVersions.brewMethod })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(
      and(
        eq(recipes.authorId, userId),
        isNull(recipes.deletedAt),
        isNotNull(recipeVersions.brewMethod),
      ),
    );
  const allBrewMethods = ['espresso_machine', 'v60', 'french_press', 'aeropress',
    'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave', 'moka_pot', 'cold_brew', 'siphon'];
  const triedAllMethods = distinctMethodsResult.length >= allBrewMethods.length;

  const userRatingsResult = await db.select({ count: count() }).from(userRecipeRatings)
    .where(eq(userRecipeRatings.userId, userId));
  const userRatingsCount = userRatingsResult[0].count;

  const checks: Array<{ rule: string; met: boolean }> = [
    // Existing checks
    { rule: 'first_brew', met: userRecipes >= 1 },
    { rule: 'decade_brewer', met: userRecipes >= 10 },
    { rule: 'centurion', met: userRecipes >= 100 },
    { rule: 'first_fork', met: userForks >= 1 },
    { rule: 'fan_favourite', met: maxLikes >= 10 },
    { rule: 'community_star', met: maxLikes >= 50 },
    { rule: 'conversationalist', met: userComments >= 10 },
    { rule: 'precision_brewer', met: precisionBrewerMet },
    { rule: 'explorer', met: distinctMethods.length >= 5 },
    { rule: 'influencer', met: userFollowers >= 25 },

    // NEW checks
    { rule: 'first_follow', met: userFollowing >= 1 },
    { rule: 'social_butterfly', met: userFollowers >= 50 },
    { rule: 'equipment_collector', met: userEquipmentCount >= 5 },
    { rule: 'taste_explorer', met: triedAllMethods },
    { rule: 'community_helper', met: userComments >= 10 },
    { rule: 'recipe_master', met: userRecipes >= 10 },
    { rule: 'feedback_provider', met: userRatingsCount >= 50 },
  ];

  // ... existing badge awarding logic (unchanged) ...
}
```

### Trigger on Follow

In `apps/api/src/modules/follow/service.ts` — trigger badge evaluation after follow:

```ts
export async function followUser(followerId: string, followingId: string) {
  // ... existing follow logic ...

  // Trigger badge evaluation for follower (first_follow badge)
  await evaluateBadges(followerId);
}
```

### Trigger on Rating

In `apps/api/src/modules/recipe/service.ts` — trigger badge evaluation after rating:

```ts
export async function toggleLike(...) {
  // ... existing like logic ...

  // Trigger badge evaluation (fan_favourite, community_star for recipe author)
  await evaluateBadges(recipe.authorId);
}

export async function upsertUserRating(...) {
  // ... existing rating logic ...

  // Trigger badge evaluation (feedback_provider for rater)
  await evaluateBadges(userId);
}
```

### Frontend

#### Enhanced BadgeGallery

`apps/web/src/components/user/BadgeGallery.tsx`:

```tsx
interface BadgeGalleryProps {
  userBadges: UserBadge[];
  allBadges: Badge[];
}

export function BadgeGallery({ userBadges, allBadges }: BadgeGalleryProps) {
  const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));

  // Group by category
  const categories = {
    brewing: allBadges.filter((b) =>
      ['first_brew', 'decade_brewer', 'centurion', 'precision_brewer'].includes(b.rule)
    ),
    social: allBadges.filter((b) =>
      ['first_follow', 'social_butterfly', 'influencer'].includes(b.rule)
    ),
    community: allBadges.filter((b) =>
      ['community_star', 'community_helper', 'conversationalist', 'feedback_provider'].includes(b.rule)
    ),
    exploration: allBadges.filter((b) =>
      ['explorer', 'taste_explorer', 'equipment_collector'].includes(b.rule)
    ),
    recipes: allBadges.filter((b) =>
      ['first_fork', 'fan_favourite', 'recipe_master'].includes(b.rule)
    ),
  };

  return (
    <div>
      {Object.entries(categories).map(([category, badges]) => (
        <div key={category} className="mb-6">
          <h3 className="text-lg font-semibold capitalize">{category}</h3>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
            {badges.map((badge) => (
              <BadgeCard
                key={badge.id}
                badge={badge}
                earned={earnedBadgeIds.has(badge.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### BadgeCard

`apps/web/src/components/user/BadgeCard.tsx`:

```tsx
interface BadgeCardProps {
  badge: Badge;
  earned: boolean;
}

export function BadgeCard({ badge, earned }: BadgeCardProps) {
  return (
    <div className={`text-center p-3 rounded-lg ${earned ? 'bg-amber-50' : 'bg-gray-100 opacity-50'}`}>
      <BadgeIcon name={badge.icon} className={earned ? 'text-amber-500' : 'text-gray-400'} />
      <p className="text-sm font-medium mt-1">{badge.name}</p>
      <p className="text-xs text-gray-500">{badge.description}</p>
      {!earned && (
        <p className="text-xs text-gray-400 mt-1">
          {badge.threshold} {getThresholdLabel(badge.rule)}
        </p>
      )}
    </div>
  );
}
```

## API Endpoints

No new endpoints. Existing badge endpoints are reused:
- `GET /badges` — list all badges (already exists)
- `GET /users/:id` — includes user badges (already exists)

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BadgeGallery` | `components/user/BadgeGallery.tsx` | Enhanced badge grid with categories |
| `BadgeCard` | `components/user/BadgeCard.tsx` | Individual badge card (earned/locked) |
| `BadgeIcon` | `components/icons/BadgeIcon.tsx` | Icon component for badge icons |

## Acceptance Criteria

- [ ] 7 new badge rules added to enum
- [ ] New badge definitions seeded
- [ ] `evaluateBadges()` checks new rules
- [ ] First follow triggers badge evaluation
- [ ] Follow/unfollow triggers badge re-evaluation
- [ ] Rating recipes triggers badge evaluation
- [ ] Equipment additions trigger badge evaluation
- [ ] BadgeGallery shows badges grouped by category
- [ ] Earned badges visually distinct from locked badges
- [ ] Locked badges show progress toward threshold
- [ ] Cron job evaluates new badge types
- [ ] No duplicate badge awards (existing onConflictDoNothing)
- [ ] `make db-generate && make db-migrate` succeeds
- [ ] `make check` passes
- [ ] `make lint` passes
- [ ] `make test` passes

## Implementation Steps

1. **Extend `badgeRuleEnum`** in `packages/db/src/schema.ts` with 7 new values
2. **Run `make db-generate && make db-migrate`** to apply enum change
3. **Add badge seed data** to `packages/db/src/seed.ts`
4. **Run `make db-seed`** to insert new badge definitions
5. **Extend `evaluateBadges()`** in `apps/api/src/modules/badge/model.ts` with new checks
6. **Add follow trigger** in `apps/api/src/modules/follow/service.ts`
7. **Add rating trigger** in `apps/api/src/modules/recipe/service.ts`
8. **Create `BadgeGallery`** component with category grouping
9. **Create `BadgeCard`** component with earned/locked states
10. **Update `UserProfilePage`** to use enhanced BadgeGallery
11. **Add tests** for new badge rules
12. **Run `make check && make lint && make test`**

## Dependencies

- Existing: badge module (model/service/index), `badgeRuleEnum`, `badges` table, `userBadges` table
- Existing: follow module, recipe module (for triggers)
- Existing: cron job for periodic badge evaluation

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — enum modification, inserts
- Existing: `apps/api/src/modules/badge/model.ts:52` — `evaluateBadges()` current implementation
- Existing: `apps/api/src/modules/badge/service.ts:36` — `evaluateAllBadges()` cron function
- Existing: `packages/db/src/schema.ts:94` — `badgeRuleEnum` current values
- Existing: `packages/db/src/schema.ts:611` — `badges` table schema
