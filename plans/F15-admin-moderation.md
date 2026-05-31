# F15 — Content Moderation Queue

## Overview

Enhance the existing report module with a dedicated moderation dashboard queue, auto-flagging rules for new content, and moderation actions. Builds on the existing `reports` table and admin module.

## Goals

1. Dedicated moderation queue view aggregating pending reports
2. Auto-flagging: profanity detection, rapid-fire comments, new user spam
3. Moderation actions: approve, dismiss, escalate with audit logging
4. Context preview for flagged content (show the flagged recipe/comment/user)
5. Track all moderation actions in audit log

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-15.1 | As an admin, I see a moderation queue with pending reports | P0 |
| US-15.2 | As an admin, I can view the flagged content context before deciding | P0 |
| US-15.3 | As an admin, I can approve (resolve), dismiss, or escalate a report | P0 |
| US-15.4 | As an admin, new recipes/comments are auto-flagged for profanity | P1 |
| US-15.5 | As an admin, rapid-fire comments (>10 in 5 min) are auto-flagged | P1 |
| US-15.6 | As an admin, all moderation actions are logged in the audit trail | P1 |
| US-15.7 | As an admin, I see report count badges on the moderation nav item | P2 |

## Technical Design

### No New Tables

Enhance existing `reports` table usage and `auditLogs` table. The moderation queue is a derived view from existing data.

### Auto-Flagging Service

`apps/api/src/modules/admin/service.ts` — new functions:

```ts
// apps/api/src/modules/admin/service.ts

const PROFANITY_LIST = [
  // Basic word list — extend as needed
  // This is a simplified check; production would use a more comprehensive list
  'spam', 'scam', 'fake',
  // ... add more as needed
];

export async function checkContentForAutoFlags(
  entityType: 'recipe' | 'comment',
  entityId: string,
  authorId: string,
  content: string,
): Promise<void> {
  const flags: string[] = [];

  // 1. Profanity check
  const lowerContent = content.toLowerCase();
  const hasProfanity = PROFANITY_LIST.some((word) => lowerContent.includes(word));
  if (hasProfanity) {
    flags.push('profanity');
  }

  // 2. Rapid-fire comment check (>10 comments in 5 minutes)
  if (entityType === 'comment') {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentCommentsResult = await db.select({ count: count() })
      .from(comments)
      .where(
        and(
          eq(comments.authorId, authorId),
          gte(comments.createdAt, fiveMinAgo),
          isNull(comments.deletedAt),
        ),
      );
    if (recentCommentsResult[0].count >= 10) {
      flags.push('rapid_fire_comments');
    }
  }

  // 3. New user spam check (user created in last 24h, 3+ recipes)
  if (entityType === 'recipe') {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userResult = await db.select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, authorId))
      .limit(1);

    if (userResult.length > 0 && userResult[0].createdAt >= dayAgo) {
      const recipeCountResult = await db.select({ count: count() })
        .from(recipes)
        .where(
          and(
            eq(recipes.authorId, authorId),
            gte(recipes.createdAt, dayAgo),
            isNull(recipes.deletedAt),
          ),
        );
      if (recipeCountResult[0].count >= 3) {
        flags.push('new_user_spam');
      }
    }
  }

  // Create reports for each flag
  for (const reason of flags) {
    await db.insert(reports).values({
      reporterId: authorId, // self-reported as system
      entityType,
      entityId,
      reason: `Auto-flagged: ${reason}`,
      status: 'pending',
    });
  }
}
```

### Moderation Queue Model

`apps/api/src/modules/admin/model.ts` — new functions:

```ts
export async function getModerationQueue(
  page: number,
  perPage: number,
  status: string = 'pending',
) {
  const where = status === 'pending'
    ? eq(reports.status, 'pending')
    : status === 'all'
      ? undefined
      : eq(reports.status, status);

  const [data, totalResult] = await Promise.all([
    db.query.reports.findMany({
      where,
      orderBy: desc(reports.createdAt),
      limit: perPage,
      offset: (page - 1) * perPage,
      with: {
        reporter: { columns: { id: true, username: true, displayName: true } },
      },
    }),
    db.select({ count: count() }).from(reports).where(where),
  ]);

  // Enrich with context (flagged content preview)
  const enriched = await Promise.all(
    data.map(async (report) => {
      const context = await getReportContext(report.entityType, report.entityId);
      return { ...report, context };
    }),
  );

  return { reports: enriched, total: totalResult[0].count };
}

async function getReportContext(entityType: string, entityId: string) {
  switch (entityType) {
    case 'recipe': {
      const recipe = await db.query.recipes.findFirst({
        where: eq(recipes.id, entityId),
        with: {
          author: { columns: { id: true, username: true, displayName: true } },
        },
      });
      return recipe ? {
        title: recipe.title,
        author: recipe.author,
        createdAt: recipe.createdAt,
        preview: recipe.title,
      } : null;
    }
    case 'comment': {
      const comment = await db.query.comments.findFirst({
        where: eq(comments.id, entityId),
        with: {
          author: { columns: { id: true, username: true, displayName: true } },
        },
      });
      return comment ? {
        content: comment.content.substring(0, 200),
        author: comment.author,
        createdAt: comment.createdAt,
        preview: comment.content.substring(0, 100),
      } : null;
    }
    case 'user': {
      const user = await db.query.users.findFirst({
        where: eq(users.id, entityId),
      });
      return user ? {
        username: user.username,
        displayName: user.displayName,
        createdAt: user.createdAt,
        preview: user.username,
      } : null;
    }
    default:
      return null;
  }
}
```

### Moderation Actions

`apps/api/src/modules/admin/service.ts` — new functions:

```ts
export async function dismissReport(
  reportId: string,
  adminId: string,
): Promise<void> {
  await db.update(reports)
    .set({
      status: 'dismissed',
      resolvedAt: new Date(),
      resolvedBy: adminId,
    })
    .where(eq(reports.id, reportId));

  await db.insert(auditLogs).values({
    adminId,
    action: 'moderation.dismiss',
    entity: 'report',
    entityId: reportId,
    details: JSON.stringify({ action: 'dismiss' }),
  });
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  action: 'warn' | 'remove_content' | 'ban_user',
): Promise<void> {
  const report = await db.query.reports.findFirst({
    where: eq(reports.id, reportId),
  });

  if (!report) throw new Error('Report not found');

  // Apply the moderation action
  switch (action) {
    case 'remove_content':
      if (report.entityType === 'recipe') {
        await softDeleteRecipe(report.entityId);
      } else if (report.entityType === 'comment') {
        await db.update(comments)
          .set({ deletedAt: new Date() })
          .where(eq(comments.id, report.entityId));
      }
      break;
    case 'ban_user': {
      const targetUserId = report.entityType === 'user'
        ? report.entityId
        : await getEntityAuthorId(report.entityType, report.entityId);
      if (targetUserId) {
        await banUser(targetUserId, adminId);
      }
      break;
    }
    // 'warn' just resolves the report without content action
  }

  await db.update(reports)
    .set({
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy: adminId,
    })
    .where(eq(reports.id, reportId));

  await db.insert(auditLogs).values({
    adminId,
    action: 'moderation.resolve',
    entity: 'report',
    entityId: reportId,
    details: JSON.stringify({ action, entityType: report.entityType, entityId: report.entityId }),
  });
}

export async function escalateReport(
  reportId: string,
  adminId: string,
): Promise<void> {
  await db.update(reports)
    .set({ status: 'escalated' })
    .where(eq(reports.id, reportId));

  await db.insert(auditLogs).values({
    adminId,
    action: 'moderation.escalate',
    entity: 'report',
    entityId: reportId,
    details: JSON.stringify({ action: 'escalate' }),
  });
}

async function getEntityAuthorId(entityType: string, entityId: string): Promise<string | null> {
  switch (entityType) {
    case 'recipe': {
      const r = await db.query.recipes.findFirst({ where: eq(recipes.id, entityId) });
      return r?.authorId ?? null;
    }
    case 'comment': {
      const c = await db.query.comments.findFirst({ where: eq(comments.id, entityId) });
      return c?.authorId ?? null;
    }
    case 'user':
      return entityId;
    default:
      return null;
  }
}
```

### API Endpoints

`apps/api/src/modules/admin/index.ts` — new routes:

```ts
admin.get(
  '/moderation/queue',
  describeRoute({
    tags: ['Admin'],
    summary: 'Get moderation queue',
    description: 'Returns pending reports with context for moderation.',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Moderation queue' } },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('query', z.object({
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(50).default(20),
    status: z.enum(['pending', 'all', 'resolved', 'dismissed', 'escalated']).default('pending'),
  })),
  async (c) => {
    const { page, perPage, status } = c.req.valid('query');
    const queue = await service.getModerationQueue(page, perPage, status);
    return paginated(c, queue.reports, {
      page,
      perPage,
      total: queue.total,
      totalPages: Math.ceil(queue.total / perPage),
    });
  },
);

admin.patch(
  '/moderation/:id/dismiss',
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = c.req.param('id');
    const adminId = c.get('userId') as string;
    await service.dismissReport(id, adminId);
    return success(c, { dismissed: true });
  },
);

admin.patch(
  '/moderation/:id/resolve',
  authMiddleware,
  adminMiddleware,
  zValidator('json', z.object({
    action: z.enum(['warn', 'remove_content', 'ban_user']),
  })),
  async (c) => {
    const id = c.req.param('id');
    const adminId = c.get('userId') as string;
    const { action } = c.req.valid('json');
    await service.resolveReport(id, adminId, action);
    return success(c, { resolved: true, action });
  },
);

admin.patch(
  '/moderation/:id/escalate',
  authMiddleware,
  adminMiddleware,
  async (c) => {
    const id = c.req.param('id');
    const adminId = c.get('userId') as string;
    await service.escalateReport(id, adminId);
    return success(c, { escalated: true });
  },
);
```

### Hook into Content Creation

In `apps/api/src/modules/recipe/service.ts` — add auto-flag check after recipe creation:

```ts
export async function createRecipe(...) {
  // ... existing creation logic ...

  // Auto-flag check
  await checkContentForAutoFlags('recipe', recipe.id, authorId, `${title} ${preparationNotes}`);

  return recipe;
}
```

In `apps/api/src/modules/comment/service.ts` — add auto-flag check after comment creation:

```ts
// After creating a comment
await checkContentForAutoFlags('comment', comment.id, authorId, content);
```

### Frontend

#### ModerationQueuePage

`apps/web/src/pages/admin/ModerationQueuePage.tsx`:

```tsx
export function ModerationQueuePage() {
  const [status, setStatus] = useState<'pending' | 'all'>('pending');
  const { data, refetch } = useQuery({
    queryKey: ['moderation', status],
    queryFn: () => api.get(`/admin/moderation/queue?status=${status}&perPage=20`),
  });

  return (
    <div>
      <h1>Moderation Queue</h1>

      <StatusFilter value={status} onChange={setStatus} />

      <div className="space-y-4">
        {data?.data.map((report) => (
          <ModerationCard
            key={report.id}
            report={report}
            onDismiss={() => handleDismiss(report.id)}
            onResolve={(action) => handleResolve(report.id, action)}
            onEscalate={() => handleEscalate(report.id)}
          />
        ))}
      </div>

      <Pagination meta={data?.meta} />
    </div>
  );
}
```

#### ModerationCard

`apps/web/src/components/admin/ModerationCard.tsx`:

```tsx
interface ModerationCardProps {
  report: ModerationReport;
  onDismiss: () => void;
  onResolve: (action: 'warn' | 'remove_content' | 'ban_user') => void;
  onEscalate: () => void;
}

export function ModerationCard({ report, onDismiss, onResolve, onEscalate }: ModerationCardProps) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex justify-between">
        <div>
          <span className="badge">{report.entityType}</span>
          <span className="text-sm text-gray-500">{report.reason}</span>
        </div>
        <time>{formatDate(report.createdAt)}</time>
      </div>

      {/* Context preview */}
      {report.context && (
        <div className="mt-2 p-3 bg-gray-50 rounded">
          <p className="text-sm font-medium">{report.context.preview}</p>
          <p className="text-xs text-gray-500">
            by {report.context.author?.displayName ?? 'Unknown'} ·{' '}
            {formatDate(report.context.createdAt)}
          </p>
        </div>
      )}

      {/* Reporter info */}
      <p className="text-xs text-gray-500 mt-2">
        Reported by {report.reporter.displayName ?? report.reporter.username}
      </p>

      {/* Action buttons */}
      <div className="flex gap-2 mt-4">
        <Button onClick={onDismiss} variant="secondary">Dismiss</Button>
        <Button onClick={() => onResolve('warn')} variant="warning">Warn</Button>
        <Button onClick={() => onResolve('remove_content')} variant="danger">Remove Content</Button>
        <Button onClick={() => onResolve('ban_user')} variant="danger">Ban User</Button>
        <Button onClick={onEscalate} variant="secondary">Escalate</Button>
      </div>
    </div>
  );
}
```

#### Router

`apps/web/src/router.tsx` — add under admin children:

```tsx
{
  path: 'moderation',
  lazy: async () => {
    const { ModerationQueuePage } = await import('./pages/admin/ModerationQueuePage.tsx');
    return { Component: ModerationQueuePage };
  },
},
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/moderation/queue` | Get moderation queue |
| `PATCH` | `/api/v1/admin/moderation/:id/dismiss` | Dismiss report |
| `PATCH` | `/api/v1/admin/moderation/:id/resolve` | Resolve with action |
| `PATCH` | `/api/v1/admin/moderation/:id/escalate` | Escalate report |

**Queue Request:**
```http
GET /api/v1/admin/moderation/queue?status=pending&page=1&perPage=20
```

**Queue Response:**
```json
{
  "data": [
    {
      "id": "...",
      "entityType": "recipe",
      "entityId": "...",
      "reason": "Auto-flagged: profanity",
      "status": "pending",
      "reporter": { "id": "...", "username": "...", "displayName": "..." },
      "context": {
        "title": "Recipe Title",
        "author": { "id": "...", "username": "..." },
        "createdAt": "2025-12-01T10:00:00Z",
        "preview": "Recipe Title"
      },
      "createdAt": "2025-12-01T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "perPage": 20, "total": 5, "totalPages": 1 }
}
```

**Resolve Request:**
```json
{ "action": "remove_content" }
```

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `ModerationQueuePage` | `pages/admin/ModerationQueuePage.tsx` | Main moderation dashboard |
| `ModerationCard` | `components/admin/ModerationCard.tsx` | Individual report card with actions |
| `StatusFilter` | `components/admin/StatusFilter.tsx` | Filter by report status |

## Acceptance Criteria

- [ ] Moderation queue accessible at `/admin/moderation`
- [ ] Queue shows pending reports with context preview
- [ ] Status filter switches between pending/all/resolved/dismissed/escalated
- [ ] Dismiss action resolves report without content action
- [ ] Resolve action with "remove_content" deletes the flagged content
- [ ] Resolve action with "ban_user" bans the content author
- [ ] Escalate action marks report as escalated
- [ ] All actions logged in audit log
- [ ] Auto-flagging detects profanity in new recipes/comments
- [ ] Auto-flagging detects rapid-fire comments (>10 in 5 min)
- [ ] Auto-flagging detects new user spam (3+ recipes in 24h)
- [ ] Auto-flagged content appears in moderation queue
- [ ] Context preview shows flagged content details
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add `checkContentForAutoFlags()`** to `apps/api/src/modules/admin/service.ts`
2. **Add `getModerationQueue()` and context functions** to `apps/api/src/modules/admin/model.ts`
3. **Add `dismissReport()`, `resolveReport()`, `escalateReport()`** to admin service
4. **Add moderation routes** to `apps/api/src/modules/admin/index.ts`
5. **Hook auto-flagging** into recipe creation and comment creation
6. **Create `ModerationQueuePage`** in admin pages
7. **Create `ModerationCard`** component
8. **Add route** `/admin/moderation` to router
9. **Add API types** for moderation responses
10. **Add tests** for auto-flagging logic and moderation actions
11. **Run `make check && make lint && make test`**

## Dependencies

- Existing: `reports` table, `auditLogs` table, admin module, report module
- Existing: `comments`, `recipes`, `users` tables
- Existing: `banUser()`, `softDeleteRecipe()` in admin service
- Existing: admin middleware for route protection

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — updates, inserts
- Existing: `apps/api/src/modules/admin/service.ts` — admin service pattern
- Existing: `apps/api/src/modules/admin/index.ts` — admin routes pattern
- Existing: `apps/api/src/modules/report/index.ts` — existing report routes
- Existing: `packages/db/src/schema.ts:740` — `reports` table
