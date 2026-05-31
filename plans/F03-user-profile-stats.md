# F03 — Public Profile Brew Stats Dashboard

## Overview

Add a public stats dashboard to user profiles showing: most-used brew methods, average ratings given, favourite equipment, and brewing frequency over time. All data is derived from existing tables (brew_log, userRecipeLikes, userRecipeRatings, recipeVersion, recipeEquipment) — no new tables required.

## Goals

1. Display a visually rich stats dashboard on public user profiles
2. Show brew method distribution (which methods the user brews most)
3. Show average rating the user gives to recipes
4. Show favourite equipment (most frequently used)
5. Show brewing frequency over time (brews per month chart)
6. Keep the endpoint performant with proper aggregation queries

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Visitor | View a stats tab on a user's public profile | I can learn about their brewing habits |
| US-2 | Visitor | See which brew methods a user prefers | I can discover new methods through their experience |
| US-3 | Visitor | See a user's average rating pattern | I can understand their taste preferences |
| US-4 | Visitor | See a user's most-used equipment | I can discover popular equipment |
| US-5 | Visitor | See a user's brewing frequency over time | I can see how active they are |
| US-6 | Authenticated user | View my own stats on my profile | I can track my brewing journey |

## Technical Design

### Database Schema

**No new tables.** All data is derived from:
- `brewLogs` (from F02) — brew method, equipment, ratings, dates
- `userRecipeLikes` — liked recipes
- `userRecipeRatings` — user's ratings on recipes
- `recipeVersions` — brew method, equipment used
- `recipeEquipment` — equipment linked to recipe versions

### API Endpoint

#### `GET /api/v1/users/:username/stats`

**Response shape:**

```ts
{
  brewMethodDistribution: Array<{
    method: string;   // brewMethod enum value
    count: number;
    percentage: number;
  }>;
  averageRatingGiven: number | null;  // avg of userRecipeRatings for this user
  favouriteEquipment: Array<{
    equipmentId: string;
    name: string;
    type: string;
    count: number;
  }>;
  brewFrequency: Array<{
    month: string;   // "YYYY-MM" format
    count: number;
  }>;
  totalBrews: number;
  totalRatings: number;
}
```

### Service Layer

Add a new function to `apps/api/src/modules/user/service.ts`:

```ts
/**
 * Get aggregated brew stats for a public profile.
 *
 * Data is derived from brewLogs, userRecipeRatings, recipeVersions,
 * and recipeEquipment — no new tables needed.
 */
export async function getUserBrewStats(username: string) {
  const user = await model.findByUsername(username);
  if (!user) throw new Error('USER_NOT_FOUND');

  const [
    brewMethodDistribution,
    averageRatingGiven,
    favouriteEquipment,
    brewFrequency,
    totalBrews,
    totalRatings,
  ] = await Promise.all([
    model.getBrewMethodDistribution(user.id),
    model.getAverageRatingGiven(user.id),
    model.getFavouriteEquipment(user.id),
    model.getBrewFrequency(user.id),
    model.getTotalBrews(user.id),
    model.getTotalRatings(user.id),
  ]);

  return {
    brewMethodDistribution,
    averageRatingGiven,
    favouriteEquipment,
    brewFrequency,
    totalBrews,
    totalRatings,
  };
}
```

### Model Layer

Add aggregation functions to `apps/api/src/modules/user/model.ts`:

```ts
import { brewLogs, recipeEquipment, recipeVersions, userRecipeRatings } from '@brewform/db/schema';
import { and, avg, count, desc, eq, isNull, sql } from 'drizzle-orm';

/** Get brew method distribution for a user (from brew_logs). */
export async function getBrewMethodDistribution(userId: string) {
  const results = await db.select({
    method: brewLogs.recipeId, // will join through recipeVersions
    count: count(),
  })
    .from(brewLogs)
    .innerJoin(recipeVersions, eq(brewLogs.recipeVersionId, recipeVersions.id))
    .where(and(eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt)))
    .groupBy(recipeVersions.brewMethod)
    .orderBy(desc(count()));

  // Alternative: query through recipeVersions directly for users who have brew logs
  // This provides brew method from the recipe version used in each brew
  const total = results.reduce((sum, r) => sum + r.count, 0);
  return results.map((r) => ({
    method: r.method,
    count: r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));
}

/** Get average rating given by a user. */
export async function getAverageRatingGiven(userId: string) {
  const [result] = await db.select({
    avg: avg(userRecipeRatings.rating),
    total: count(),
  })
    .from(userRecipeRatings)
    .where(eq(userRecipeRatings.userId, userId));

  return {
    average: result?.avg ? Math.round(Number(result.avg) * 10) / 10 : null,
    total: result?.total ?? 0,
  };
}

/** Get favourite equipment for a user (most frequently used in brew logs). */
export async function getFavouriteEquipment(userId: string) {
  // Join brewLogs → recipeVersions → recipeEquipment → equipment
  const results = await db.select({
    equipmentId: recipeEquipment.equipmentId,
    name: sql<string>`MAX(equipment.name)`,
    type: sql<string>`MAX(equipment.type)`,
    count: count(),
  })
    .from(brewLogs)
    .innerJoin(recipeVersions, eq(brewLogs.recipeVersionId, recipeVersions.id))
    .innerJoin(recipeEquipment, eq(recipeVersions.id, recipeEquipment.recipeVersionId))
    .innerJoin(equipment, eq(recipeEquipment.equipmentId, equipment.id))
    .where(and(eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt)))
    .groupBy(recipeEquipment.equipmentId)
    .orderBy(desc(count()))
    .limit(10);

  return results;
}

/** Get brew frequency over time (brews per month, last 12 months). */
export async function getBrewFrequency(userId: string) {
  const results = await db.select({
    month: sql<string>`TO_CHAR(${brewLogs.brewedAt}, 'YYYY-MM')`,
    count: count(),
  })
    .from(brewLogs)
    .where(and(
      eq(brewLogs.userId, userId),
      isNull(brewLogs.deletedAt),
      sql`${brewLogs.brewedAt} >= NOW() - INTERVAL '12 months'`,
    ))
    .groupBy(sql`TO_CHAR(${brewLogs.brewedAt}, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${brewLogs.brewedAt}, 'YYYY-MM')`);

  return results;
}

/** Get total brew count for a user. */
export async function getTotalBrews(userId: string) {
  const [result] = await db.select({ count: count() })
    .from(brewLogs)
    .where(and(eq(brewLogs.userId, userId), isNull(brewLogs.deletedAt)));
  return result?.count ?? 0;
}

/** Get total rating count for a user. */
export async function getTotalRatings(userId: string) {
  const [result] = await db.select({ count: count() })
    .from(userRecipeRatings)
    .where(eq(userRecipeRatings.userId, userId));
  return result?.count ?? 0;
}
```

### Route Changes

Add to existing `apps/api/src/modules/user/index.ts`:

```ts
user.get('/:username/stats', optionalAuthMiddleware, async (c) => {
  const username = c.req.param('username') as string;
  try {
    const stats = await service.getUserBrewStats(username);
    return success(c, stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_NOT_FOUND') return error(c, 'NOT_FOUND', 'User not found', 404);
    throw err;
  }
});
```

**Important**: Route must be registered **before** the `/:username` catch-all route to avoid path collision.

### Frontend Components

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `StatsTab` | `components/user/StatsTab.tsx` | Tab content showing the full stats dashboard |
| `BrewMethodChart` | `components/user/BrewMethodChart.tsx` | Horizontal bar chart or pie chart of brew method distribution |
| `RatingDistribution` | `components/user/RatingDistribution.tsx` | Display of average rating given with visual indicator |
| `FavouriteEquipmentList` | `components/user/FavouriteEquipmentList.tsx` | List of top equipment with usage counts |
| `BrewFrequencyChart` | `components/user/BrewFrequencyChart.tsx` | Line/bar chart showing brews per month over last 12 months |

#### Chart Library Consideration

Use a lightweight chart library that works with React and doesn't bandle the bundle:
- **Option A**: `recharts` — popular, good React integration, ~40KB gzipped
- **Option B**: CSS-only charts (horizontal bars, simple visual indicators) — zero dependencies
- **Option C**: `@nivo/bar` + `@nivo/line` — tree-shakeable, beautiful defaults

Recommendation: Start with CSS-only bar charts and simple visual indicators. Upgrade to a chart library if more complex visualizations are needed.

#### Modifications to Existing Pages

**UserProfilePage** (`apps/web/src/pages/users/UserProfilePage.tsx`):

Add a new tab `stats` to the existing tab system:

```tsx
type Tab = 'recipes' | 'badges' | 'followers' | 'following' | 'stats';

const tabs: { key: Tab; label: string }[] = [
  { key: 'recipes', label: t('user.recipes') },
  { key: 'badges', label: t('user.badges') },
  { key: 'stats', label: t('user.stats') },  // NEW
  { key: 'followers', label: t('user.followers') },
  { key: 'following', label: t('user.following') },
];

// In render:
{tab === 'stats' && <StatsTab username={profile.username} />}
```

#### API Usage

```ts
api.get(`/users/${username}/stats`)
```

#### Internationalization

Add translation keys:

```json
{
  "user.stats": "Stats",
  "user.stats.totalBrews": "Total Brews",
  "user.stats.averageRating": "Average Rating Given",
  "user.stats.brewMethods": "Brew Methods",
  "user.stats.favouriteEquipment": "Favourite Equipment",
  "user.stats.brewFrequency": "Brewing Activity",
  "user.stats.noData": "No brew data available yet",
  "user.stats.brewsPerMonth": "Brews per month"
}
```

## Acceptance Criteria

- [ ] New "Stats" tab appears on UserProfilePage
- [ ] Stats tab shows brew method distribution with counts and percentages
- [ ] Stats tab shows average rating the user gives (with visual indicator)
- [ ] Stats tab shows favourite equipment (top 10 by usage count)
- [ ] Stats tab shows brewing frequency over last 12 months (chart or visual)
- [ ] Stats are derived from existing data (no new tables)
- [ ] Endpoint returns empty/default values gracefully when user has no brew data
- [ ] Stats are visible to all visitors (public profile data)
- [ ] Performance: endpoint responds within 200ms for users with <1000 brews
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add aggregation model functions to `apps/api/src/modules/user/model.ts`
2. Add `getUserBrewStats` service function to `apps/api/src/modules/user/service.ts`
3. Add `GET /:username/stats` route to `apps/api/src/modules/user/index.ts`
4. Create frontend components: `StatsTab.tsx`, `BrewMethodChart.tsx`, `RatingDistribution.tsx`, `FavouriteEquipmentList.tsx`, `BrewFrequencyChart.tsx`
5. Modify `UserProfilePage.tsx` to add "Stats" tab and render `StatsTab`
6. Add i18n translation keys
7. Write tests for the stats aggregation functions
8. Run `make check && make lint && make test`

## Dependencies

- `brewLogs` table (from F02 — Brew Journal)
- `userRecipeRatings` table (existing)
- `recipeVersions` table (existing)
- `recipeEquipment` table (existing)
- `equipment` table (existing)
- Existing user profile page and tab system
