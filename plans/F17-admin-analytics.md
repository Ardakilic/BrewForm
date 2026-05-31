# F17 — Admin Analytics Dashboard Improvements

## Overview

Enhance the existing admin analytics with time-series charts, retention metrics, and CSV export. Currently, admin dashboard shows simple stat cards. This adds visual trends and exportable data.

## Goals

1. Time-series charts for user growth, recipe creation, active users
2. Retention metrics (users active in period / total users)
3. Brew method distribution chart
4. CSV export of analytics data
5. Replace simple stat cards with interactive charts

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-17.1 | As an admin, I see user signups over time as a line chart | P0 |
| US-17.2 | As an admin, I see recipes created over time as a line chart | P0 |
| US-17.3 | As an admin, I see active users (users with activity in period) | P1 |
| US-17.4 | As an admin, I can switch between 7d/30d/90d time ranges | P1 |
| US-17.5 | As an admin, I can export analytics data as CSV | P1 |
| US-17.6 | As an admin, I see brew method distribution as a pie/bar chart | P2 |
| US-17.7 | As an admin, I see retention metrics (% of users active in period) | P2 |

## Technical Design

### API Endpoints

No new tables. Aggregate from existing data with date-grouped queries.

#### GET /admin/analytics/trends

`apps/api/src/modules/admin/index.ts`:

```ts
admin.get(
  '/analytics/trends',
  describeRoute({
    tags: ['Admin'],
    summary: 'Get analytics trends',
    description: 'Returns time-series data for user growth, recipe creation, and active users.',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Analytics trends data' } },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('query', z.object({
    period: z.enum(['7d', '30d', '90d']).default('30d'),
  })),
  async (c) => {
    const period = c.req.valid('query').period;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const data = await service.getAnalyticsTrends(days);
    return success(c, data);
  },
);
```

#### GET /admin/analytics/retention

```ts
admin.get(
  '/analytics/retention',
  describeRoute({
    tags: ['Admin'],
    summary: 'Get retention metrics',
    description: 'Returns user retention metrics for the given period.',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Retention metrics' } },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('query', z.object({
    period: z.enum(['7d', '30d', '90d']).default('30d'),
  })),
  async (c) => {
    const period = c.req.valid('query').period;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const data = await service.getRetentionMetrics(days);
    return success(c, data);
  },
);
```

#### GET /admin/analytics/export

```ts
admin.get(
  '/analytics/export',
  describeRoute({
    tags: ['Admin'],
    summary: 'Export analytics data',
    description: 'Returns analytics data as CSV.',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'CSV file' } },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('query', z.object({
    type: z.enum(['users', 'recipes', 'engagement']),
    period: z.enum(['7d', '30d', '90d']).default('30d'),
  })),
  async (c) => {
    const { type, period } = c.req.valid('query');
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const csv = await service.exportAnalyticsCsv(type, days);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${type}-analytics-${period}.csv"`,
      },
    });
  },
);
```

### Service Layer

`apps/api/src/modules/admin/service.ts` — new functions:

```ts
export async function getAnalyticsTrends(days: number) {
  return model.getAnalyticsTrends(days);
}

export async function getRetentionMetrics(days: number) {
  return model.getRetentionMetrics(days);
}

export async function exportAnalyticsCsv(
  type: 'users' | 'recipes' | 'engagement',
  days: number,
): Promise<string> {
  return model.exportAnalyticsCsv(type, days);
}
```

### Model Layer

`apps/api/src/modules/admin/model.ts` — new functions:

```ts
export async function getAnalyticsTrends(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // User signups by day
  const userSignups = await db
    .select({
      date: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since)))
    .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

  // Recipes created by day
  const recipeCreation = await db
    .select({
      date: sql<string>`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(recipes)
    .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
    .groupBy(sql`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`);

  // Active users (users who created recipes, commented, or rated in period)
  const activeUserIds = await db
    .selectDistinct({ userId: recipes.authorId })
    .from(recipes)
    .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
    .union(
      db.selectDistinct({ userId: comments.authorId })
        .from(comments)
        .where(and(isNull(comments.deletedAt), gte(comments.createdAt, since))),
    )
    .union(
      db.selectDistinct({ userId: userRecipeRatings.userId })
        .from(userRecipeRatings)
        .where(gte(userRecipeRatings.createdAt, since)),
    );

  // Count active users by day (approximate — use first activity of the day)
  // For simplicity, return total active users in period
  const activeCount = activeUserIds.length;

  // Brew method distribution
  const brewMethodDistribution = await db
    .select({
      method: recipeVersions.brewMethod,
      count: count(),
    })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipeVersions.recipeId, recipes.id))
    .where(and(isNull(recipes.deletedAt), gte(recipeVersions.createdAt, since)))
    .groupBy(recipeVersions.brewMethod)
    .orderBy(desc(count()));

  return {
    userSignups: fillMissingDates(userSignups, days),
    recipeCreation: fillMissingDates(recipeCreation, days),
    activeUsers: activeCount,
    brewMethodDistribution,
  };
}

// Helper: fill missing dates with zero counts
function fillMissingDates(
  data: Array<{ date: string; count: number }>,
  days: number,
): Array<{ date: string; count: number }> {
  const result: Array<{ date: string; count: number }> = [];
  const dataMap = new Map(data.map((d) => [d.date, d.count]));

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    result.push({ date: dateStr, count: dataMap.get(dateStr) ?? 0 });
  }

  return result;
}

export async function getRetentionMetrics(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const totalUsersResult = await db
    .select({ count: count() })
    .from(users)
    .where(isNull(users.deletedAt));

  // Active users = users who created recipes, commented, or rated in period
  const activeUserIds = await db
    .selectDistinct({ userId: recipes.authorId })
    .from(recipes)
    .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
    .union(
      db.selectDistinct({ userId: comments.authorId })
        .from(comments)
        .where(and(isNull(comments.deletedAt), gte(comments.createdAt, since))),
    )
    .union(
      db.selectDistinct({ userId: userRecipeRatings.userId })
        .from(userRecipeRatings)
        .where(gte(userRecipeRatings.createdAt, since)),
    );

  const totalUsers = totalUsersResult[0].count;
  const activeUsers = activeUserIds.length;
  const retentionRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

  return {
    totalUsers,
    activeUsers,
    retentionRate: Math.round(retentionRate * 100) / 100,
    period: `${days}d`,
  };
}

export async function exportAnalyticsCsv(
  type: 'users' | 'recipes' | 'engagement',
  days: number,
): Promise<string> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  let rows: string[] = [];

  switch (type) {
    case 'users': {
      const data = await db
        .select({
          date: sql<string>`to_char(${users.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(users)
        .where(and(isNull(users.deletedAt), gte(users.createdAt, since)))
        .groupBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${users.createdAt}, 'YYYY-MM-DD')`);

      rows = ['Date,Count', ...data.map((d) => `${d.date},${d.count}`)];
      break;
    }
    case 'recipes': {
      const data = await db
        .select({
          date: sql<string>`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(recipes)
        .where(and(isNull(recipes.deletedAt), gte(recipes.createdAt, since)))
        .groupBy(sql`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${recipes.createdAt}, 'YYYY-MM-DD')`);

      rows = ['Date,Count', ...data.map((d) => `${d.date},${d.count}`)];
      break;
    }
    case 'engagement': {
      const likes = await db
        .select({
          date: sql<string>`to_char(${userRecipeLikes.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(userRecipeLikes)
        .where(gte(userRecipeLikes.createdAt, since))
        .groupBy(sql`to_char(${userRecipeLikes.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${userRecipeLikes.createdAt}, 'YYYY-MM-DD')`);

      const comments = await db
        .select({
          date: sql<string>`to_char(${comments.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(comments)
        .where(and(isNull(comments.deletedAt), gte(comments.createdAt, since)))
        .groupBy(sql`to_char(${comments.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${comments.createdAt}, 'YYYY-MM-DD')`);

      const ratings = await db
        .select({
          date: sql<string>`to_char(${userRecipeRatings.createdAt}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(userRecipeRatings)
        .where(gte(userRecipeRatings.createdAt, since))
        .groupBy(sql`to_char(${userRecipeRatings.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${userRecipeRatings.createdAt}, 'YYYY-MM-DD')`);

      rows = ['Date,Likes,Comments,Ratings'];
      // Merge dates from all three sources
      const allDates = new Set([
        ...likes.map((l) => l.date),
        ...comments.map((c) => c.date),
        ...ratings.map((r) => r.date),
      ]);
      const likesMap = new Map(likes.map((l) => [l.date, l.count]));
      const commentsMap = new Map(comments.map((c) => [c.date, c.count]));
      const ratingsMap = new Map(ratings.map((r) => [r.date, r.count]));

      for (const date of [...allDates].sort()) {
        rows.push(`${date},${likesMap.get(date) ?? 0},${commentsMap.get(date) ?? 0},${ratingsMap.get(date) ?? 0}`);
      }
      break;
    }
  }

  return rows.join('\n');
}
```

### Frontend

#### Enhanced AdminDashboard

`apps/web/src/pages/admin/AdminDashboard.tsx` — replace stat cards with charts:

```tsx
export function AdminDashboard() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { data: trends } = useQuery({
    queryKey: ['analytics', 'trends', period],
    queryFn: () => api.get(`/admin/analytics/trends?period=${period}`),
  });

  const { data: retention } = useQuery({
    queryKey: ['analytics', 'retention', period],
    queryFn: () => api.get(`/admin/analytics/retention?period=${period}`),
  });

  const handleExport = async (type: 'users' | 'recipes' | 'engagement') => {
    const response = await api.get(`/admin/analytics/export?type=${type}&period=${period}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-analytics-${period}.csv`;
    link.click();
  };

  return (
    <div>
      <div className="flex justify-between items-center">
        <h1>Analytics Dashboard</h1>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Users" value={retention?.totalUsers ?? 0} />
        <StatCard title="Active Users" value={retention?.activeUsers ?? 0} />
        <StatCard title="Retention Rate" value={`${retention?.retentionRate ?? 0}%`} />
        <StatCard title="Recipes Created" value={trends?.recipeCreation?.reduce((sum, d) => sum + d.count, 0) ?? 0} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-8">
        <LineChart
          title="User Signups"
          data={trends?.userSignups ?? []}
          color="#3b82f6"
        />
        <LineChart
          title="Recipes Created"
          data={trends?.recipeCreation ?? []}
          color="#10b981"
        />
        <PieChart
          title="Brew Method Distribution"
          data={trends?.brewMethodDistribution?.map((d) => ({
            label: formatMethodName(d.method),
            value: d.count,
          })) ?? []}
        />
        <div>
          <h3>Export Data</h3>
          <div className="space-y-2">
            <Button onClick={() => handleExport('users')}>Export Users CSV</Button>
            <Button onClick={() => handleExport('recipes')}>Export Recipes CSV</Button>
            <Button onClick={() => handleExport('engagement')}>Export Engagement CSV</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### Chart Components

Lightweight chart components using SVG (no external library dependency):

`apps/web/src/components/admin/charts/LineChart.tsx`:

```tsx
interface LineChartProps {
  title: string;
  data: Array<{ date: string; count: number }>;
  color: string;
}

export function LineChart({ title, data, color }: LineChartProps) {
  // Simple SVG line chart
  // Scale data to fit viewport
  // Render with SVG path elements
  return (
    <div>
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${data.length * 20} 200`} className="w-full">
        {/* Render path, axes, labels */}
      </svg>
    </div>
  );
}
```

`apps/web/src/components/admin/charts/PieChart.tsx`:

```tsx
interface PieChartProps {
  title: string;
  data: Array<{ label: string; value: number }>;
}

export function PieChart({ title, data }: PieChartProps) {
  // Simple SVG pie chart
  // Calculate angles from values
  // Render with SVG arc paths
  return (
    <div>
      <h3>{title}</h3>
      <svg viewBox="0 0 200 200" className="w-full max-w-xs">
        {/* Render pie slices */}
      </svg>
      <Legend items={data} />
    </div>
  );
}
```

### Types

`apps/web/src/api/types.ts`:

```ts
export interface AnalyticsTrends {
  userSignups: Array<{ date: string; count: number }>;
  recipeCreation: Array<{ date: string; count: number }>;
  activeUsers: number;
  brewMethodDistribution: Array<{ method: string; count: number }>;
}

export interface RetentionMetrics {
  totalUsers: number;
  activeUsers: number;
  retentionRate: number;
  period: string;
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/analytics/trends` | Time-series analytics |
| `GET` | `/api/v1/admin/analytics/retention` | Retention metrics |
| `GET` | `/api/v1/admin/analytics/export` | CSV export |

**Trends Request:**
```
GET /api/v1/admin/analytics/trends?period=30d
```

**Trends Response:**
```json
{
  "data": {
    "userSignups": [
      { "date": "2025-12-01", "count": 5 },
      { "date": "2025-12-02", "count": 3 }
    ],
    "recipeCreation": [...],
    "activeUsers": 150,
    "brewMethodDistribution": [
      { "method": "espresso_machine", "count": 45 },
      { "method": "v60", "count": 38 }
    ]
  }
}
```

**Retention Response:**
```json
{
  "data": {
    "totalUsers": 1200,
    "activeUsers": 450,
    "retentionRate": 37.5,
    "period": "30d"
  }
}
```

**Export:** Returns CSV file with `Content-Type: text/csv`.

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `AdminDashboard` | `pages/admin/AdminDashboard.tsx` | Enhanced with charts |
| `LineChart` | `components/admin/charts/LineChart.tsx` | SVG line chart |
| `PieChart` | `components/admin/charts/PieChart.tsx` | SVG pie chart |
| `PeriodSelector` | `components/admin/PeriodSelector.tsx` | 7d/30d/90d toggle |
| `StatCard` | `components/admin/StatCard.tsx` | Summary stat card |

## Acceptance Criteria

- [ ] User signups chart shows daily data for selected period
- [ ] Recipes created chart shows daily data for selected period
- [ ] Active users count displayed correctly
- [ ] Period selector switches between 7d/30d/90d
- [ ] Brew method distribution shown as pie chart
- [ ] Retention rate calculated correctly
- [ ] CSV export downloads correct data
- [ ] CSV export includes proper headers
- [ ] Charts render without external chart library (SVG-based)
- [ ] Empty states handled (no data for period)
- [ ] Charts are responsive
- [ ] Response time < 300ms
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add `getAnalyticsTrends()`** to `apps/api/src/modules/admin/model.ts`
2. **Add `getRetentionMetrics()`** to admin model
3. **Add `exportAnalyticsCsv()`** to admin model
4. **Add service functions** to admin service
5. **Add routes** to admin index (trends, retention, export)
6. **Create `LineChart`** SVG component
7. **Create `PieChart`** SVG component
8. **Update `AdminDashboard`** with charts and period selector
9. **Add CSV download handler**
10. **Add API types** to frontend
11. **Add tests** for analytics queries
12. **Run `make check && make lint && make test`**

## Dependencies

- Existing: admin module, admin model with existing `getUserGrowth()`, `getRecipeGrowth()`
- Existing: `users`, `recipes`, `comments`, `userRecipeLikes`, `userRecipeRatings` tables
- No external chart library — SVG-based charts

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — aggregate queries, date functions
- Existing: `apps/api/src/modules/admin/model.ts:453` — `getDashboardStats()` pattern
- Existing: `apps/api/src/modules/admin/model.ts:491` — `getUserGrowth()` for time-series pattern
