# F15 — Content Moderation Queue (split into F15a and F15b)

> **Split (2026-11-21): F15a ships the user-facing report flow and an admin reports page over the
> existing endpoints; F15b adds auto-flagging. F15a does not depend on F15b.**
>
> **F15a — Report button/dialog + admin reports page** (no schema change, no new report endpoint).
> This is the user-facing moderation UI follow-up recorded in the wave-6 debt ledger.
>
> - Today there is NO web UI for reports at all: no report button anywhere, no `reportApi` in
>   `apps/web/src/api/index.ts`, no admin reports page in `apps/web/src/pages/admin/` and no
>   reports link in `AdminLayout`. The backend is complete for a first version:
>   - users: `POST /api/v1/reports` (`apps/api/src/modules/report/index.ts`, `ReportCreateSchema`
>     in `packages/shared/src/schemas/report.ts`: exactly one of `recipeId`/`commentId`, `type`
>     `spam|harassment|inappropriate|other`, `reason` 1–2000 chars), rate-limited by the named
>     policies `reportIp`/`reportUser` (3 per 15 min, `apps/api/src/utils/rate-limit/policies.ts`);
>   - admins: `GET /api/v1/admin/reports` (`ReportFilterSchema` + `entityType`),
>     `PATCH /api/v1/admin/reports/:id/resolve` and `/dismiss` (`apps/api/src/modules/admin/index.ts`),
>     each writing an audit-log entry; `GET /admin/stats` already returns `pendingReports` for the
>     nav badge (US-15.7).
> - F15a scope:
>   1. A `ReportDialog` (type select + reason) opened from a "Report" button on the recipe detail
>      page and on each comment in `apps/web/src/components/recipe/CommentSection.tsx`, shown to
>      signed-in users who are not the author; it submits through a resource-route action
>      (web data-loading rule: components never import `api/index.ts`) and maps 429 with
>      `t('error.rateLimited')`. User reports are out of F15a, because `ReportCreateSchema` only
>      accepts recipes and comments; widening it is an F15a follow-up.
>   2. `/admin/reports` (`AdminReportsPage` + `.data.ts` loader, lazy child under `/admin`) listing
>      reports with status/entity-type filters, `PaginationControls`, a link to the reported
>      recipe or comment, and Resolve/Dismiss actions through a route action; an `AdminLayout` nav
>      link with the pending count. Moderation actions on the content itself use the existing
>      admin pages (recipe soft delete, ban dialog) — no one-step resolve-with-action in F15a.
>   3. `describeRoute()` metadata for the three admin report routes (they have none today; they
>      are part of the admin OpenAPI coverage gap in the debt ledger), every string in `en.json`
>      and `tr.json`, page mount/unmount logs.
> - Optional F15a extension if the bare entity link proves too thin: the context-enriched list
>   (reporter + recipe title/comment excerpt) as a NEW additive output schema, built in
>   `admin/model.ts` (see the 2026-08-13 corrections below).
>
> **F15b — Auto-flagging** (after F15a; the queue UI is F15a's page).
>
> - `checkContentForAutoFlags` (profanity list, rapid-fire comments, new-user recipe spam) wired
>   fire-and-forget beside `evaluateBadges` in `createRecipe`/`createComment`, with its queries in
>   `admin/model.ts` (never `db` in a service) and entry/exit debug logs.
> - Open design points F15b must settle first: which reporter an automatic report records
>   (`reports.reporterId` is a NOT NULL FK; there is no system user — seed one or make the column
>   nullable with an `autoFlag` reason prefix), whether `escalated` joins `REPORT_STATUS_VALUES`
>   (enum migration via `packages/db/src/schema.ts` + `make db-generate`), and the
>   resolve-with-action endpoint (`moderateReport`, not a redefined `resolveReport`).
> - US-15.4/15.5 and the auto-flag acceptance criteria below belong to F15b; US-15.1/15.2/15.3
>   (resolve/dismiss only)/15.6/15.7 belong to F15a.
>
> **Superseded by wave 6:** the 2026-08-13 "Frontend reality" bullet below (admin pages fetch via
> `useEffect` + `api.get`) is stale — every admin page now loads through a `*.data.ts` route
> loader and mutates through actions/fetchers, enforced by `data-loading.enforcement.test.ts`.
> Follow that pattern.

> **Validation status (2026-08-13): refreshed — corrections below**
>
> **Note:** The body below this line is the pre-refresh draft (itself carrying a 2026-07-13 validation banner, kept as historical context); treat the corrections below as authoritative. All file:line references re-verified against the codebase on 2026-08-13.
>
> - **Already shipped (most of US-15.1/15.3/15.6):** `reports` table + `report_status` pgEnum (packages/db/src/schema.ts:860, :73), `auditLogs` table (schema.ts:804); report module with rate-limited POST + admin GET list + PATCH resolve (apps/api/src/modules/report/index.ts:26, :73, :117; rate-limit constants :22-24); admin `GET /reports`, `PATCH /reports/:id/resolve`, `PATCH /reports/:id/dismiss` (apps/api/src/modules/admin/index.ts:475, :493, :509) backed by `resolveReport(adminId, id)` / `dismissReport(adminId, id)` (admin/service.ts:463, :472) → model `resolveReport(id, resolvedBy)` / `dismissReport` / `createAuditLog` (admin/model.ts:434, :443, :452); audit-log UI exists (apps/web/src/pages/admin/AdminAuditLogPage.tsx). `GET /admin/reports?status=pending` already IS a pending queue — what is genuinely net-new: context enrichment per report, auto-flagging, one-step resolve-with-action, escalate, the ModerationQueuePage UI, and the nav badge.
> - `'escalated'` is still NOT a valid status: `REPORT_STATUS_VALUES = ['pending','reviewed','resolved','dismissed']` (packages/shared/src/constants/report-status.ts:8-13), enforced by pgEnum (schema.ts:73) and locked as single source of truth by openspec/specs/report-status-enum/spec.md. Adding it requires editing `REPORT_STATUS_VALUES` + schema.ts then `make db-generate && db-migrate` (enum-value migration per AGENTS.md); otherwise drop escalate.
> - Signature conflicts unchanged from the 2026-07-13 banner, re-verified: service takes `adminId` FIRST — `resolveReport(adminId, id)` (admin/service.ts:463), `dismissReport(adminId, id)` (:472), `banUser(adminId, userId, reason?)` (:53), `softDeleteRecipe(adminId, recipeId)` (:215). The plan's `resolveReport(reportId, adminId, action)` and its `softDeleteRecipe(entityId)` / `banUser(targetUserId, adminId)` calls are wrong; name the new action-taking function something new (e.g. `moderateReport`).
> - Layering violations in the plan's service code: services never touch `drizzle-orm`/`db` directly — every `db.select/update/insert` block in the draft belongs in admin/model.ts, and raw `db.insert(auditLogs)` must go through `model.createAuditLog(adminId, action, entity, entityId?, details?)` (admin/model.ts:452).
> - Route conventions: the admin sub-router already guards everything via `admin.use('*', authGuard, adminGuard)` (admin/index.ts:53) — drop the per-route `authMiddleware, adminMiddleware` args (they bypass the DI test seam at :38-48). Every new route needs full `describeRoute()` with `resolver(paginatedEnvelope(...))` / `resolver(successEnvelope(...))` + `ErrorEnvelopeSchema` responses and `jsonRequestBody()` for the resolve body (AGENTS.md); the plan's bare `responses: { 200: { description } }` and undocumented PATCH routes are incomplete. `/api/v1/admin/*` is outside the OpenAPI coverage test's 19 in-scope prefixes (apps/api/src/routes/openapi.coverage.test.ts:59-79), but documentation is still mandatory.
> - Do not hand-roll the queue query schema: extend `ReportFilterSchema` (packages/shared/src/schemas/report.ts:41), which already validates `status` against the real enum plus page/perPage. The plan's inline `z.enum([... 'escalated'])` and `'all'` sentinel fail against the current enum; the existing admin list route already extends this schema with `entityType` (admin/index.ts:479) — copy that pattern.
> - Response types: `ReportOutputSchema` (packages/shared/src/schemas/responses/report.ts:10) has no `reporter`/`context` fields — the enriched queue shape needs a NEW additive output schema in packages/shared/src/schemas/responses/ with a co-located unit test. Implementation step 9 ("Add API types") is stale: apps/web/src/api/types.ts was DELETED (D42) — web types are `z.infer` from @brewform/shared schemas.
> - Frontend reality: TanStack Query is NOT installed (absent from apps/web/package.json); admin pages fetch via `useEffect` + `api.get` from `../../api/client.ts` (pattern: AdminAuditLogPage.tsx:38-48) — follow that, not `useQuery` or a router loader. There is no `<Button variant=...>` component — admin UI uses plain `<button>` with `btn-primary`/`btn-secondary` classes (components/admin/BanDialog.tsx:61-68). The pagination component is `PaginationControls` (components/ui/PaginationControls.tsx), not `Pagination`. Router pattern confirmed: lazy child under `/admin` (apps/web/src/router.tsx:321-350). `AdminLayout` nav (pages/admin/AdminLayout.tsx:22-34) currently has NO reports/moderation link, and admin pages use `t('admin.*')` i18n keys — add both.
> - US-15.7 badge: `getDashboardStats` already returns `pendingReports` (admin/model.ts:480-515) via `GET /admin/stats` — reuse it, no new count endpoint needed.
> - Auto-flag hook points confirmed: `createRecipe` (apps/api/src/modules/recipe/service.ts:164) and `createComment` (apps/api/src/modules/comment/service.ts:48) already fire-and-forget `evaluateBadges` (:243 and :115) — wire `checkContentForAutoFlags` the same fire-and-forget way. Caveats: `reports.reporterId` is a NOT NULL FK to users (schema.ts:864), so `reporterId: authorId` self-flagging works but there is no seeded 'system' user; and `ReportCreateSchema` only supports recipe/comment entities (report.ts:10-35), so the plan's `case 'user'` context branch is dead code unless entity types are widened.
> - Logging: AGENTS.md requires `createLogger` entry/exit debug logs on every new service function — the plan's code has none (admin service pattern: admin/service.ts:464-467).
> - Reference fix: `reports` table is at packages/db/src/schema.ts:860, not :740 as the References section claims.

> **Validation status (2026-07-13): ⚠️ Outdated — corrections below**
>
> - `'escalated'` is still NOT a valid status — `REPORT_STATUS_VALUES = ['pending','reviewed','resolved','dismissed']` (packages/shared/src/constants/report-status.ts:7). The escalate route + `escalateReport` require adding the enum value first (+ migration); drop it or formalize it.
> - `resolveReport`/`dismissReport` ALREADY EXIST with DIFFERENT signatures: service `resolveReport(adminId, id)` (admin/service.ts:462), `dismissReport(adminId, id)` (:471), delegating to model `resolveReport(id, resolvedBy)` (admin/model.ts:421) + `model.createAuditLog(...)`. The plan's `resolveReport(reportId, adminId, action)` / `dismissReport(reportId, adminId)` conflict — rename the new action-taking fn (e.g. `moderateReport`) or extend the existing ones; don't redefine.
> - Admin service signatures take `adminId` FIRST: `banUser(adminId, userId, reason?)` (:52), `softDeleteRecipe(adminId, recipeId)` (:214) — the plan's resolveReport→banUser/softDeleteRecipe calls have the wrong order and omit adminId.
> - Raw `db.insert(auditLogs)` should go through `model.createAuditLog(adminId, action, entity, entityId?, details?)` (admin/model.ts:439).
> - Existing routes `/reports` (index.ts:459), `/reports/:id/resolve` (:477), `/reports/:id/dismiss` (:493) already cover resolve/dismiss — the queue overlaps them; no `/moderation/*` yet. Report POST is rate-limited 3/15min (D38, report/index.ts:21-23) but does NOT auto-flag.
> - No TanStack Query — ModerationQueuePage `useQuery` → react-router v8 loader + custom fetch. Auto-flag hooks: `createRecipe` (recipe/service.ts:161) and comment create (comment/service.ts:115) already fire-and-forget `evaluateBadges` — add `checkContentForAutoFlags` the same fire-and-forget way.

## Overview

Enhance the existing report module with a dedicated moderation dashboard queue, auto-flagging rules for new content, and moderation actions. Builds on the existing `reports` table and admin module.

## Goals

1. Dedicated moderation queue view aggregating pending reports
2. Auto-flagging: profanity detection, rapid-fire comments, new user spam
3. Moderation actions: approve, dismiss, escalate with audit logging
4. Context preview for flagged content (show the flagged recipe/comment/user)
5. Track all moderation actions in audit log

## User Stories

| ID | Story | Priority | Phase |
|----|-------|----------|-------|
| US-15.0 | As a signed-in user, I can report a recipe or a comment with a type and a reason | P0 | F15a |
| US-15.1 | As an admin, I see a moderation queue with pending reports | P0 | F15a |
| US-15.2 | As an admin, I can view the flagged content context before deciding | P0 | F15a (link; enriched context optional) |
| US-15.3 | As an admin, I can approve (resolve), dismiss, or escalate a report | P0 | F15a resolve/dismiss; escalate F15b |
| US-15.4 | As an admin, new recipes/comments are auto-flagged for profanity | P1 | F15b |
| US-15.5 | As an admin, rapid-fire comments (>10 in 5 min) are auto-flagged | P1 | F15b |
| US-15.6 | As an admin, all moderation actions are logged in the audit trail | P1 | F15a (already true for resolve/dismiss) |
| US-15.7 | As an admin, I see report count badges on the moderation nav item | P2 | F15a |

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

**F15a** adds no endpoint: it uses `POST /api/v1/reports`, `GET /api/v1/admin/reports`, `PATCH /api/v1/admin/reports/:id/resolve` and `PATCH /api/v1/admin/reports/:id/dismiss` as they exist. The table below is the pre-split draft; only what F15b adopts (an enriched queue, resolve-with-action, escalate) is built, and then under `/api/v1/admin/reports/*` beside the existing routes rather than a parallel `/moderation/*` tree.

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

**F15a**

- [ ] Signed-in non-authors see a "Report" button on recipe detail pages and on comments; the dialog submits `POST /api/v1/reports` through a resource-route action and shows the 429 message
- [ ] Admin reports page accessible at `/admin/reports`, loaded by a route loader, with an `AdminLayout` nav link and pending-count badge
- [ ] Status filter switches between pending/reviewed/resolved/dismissed (the real `REPORT_STATUS_VALUES`) and entity type
- [ ] Each row links to the reported recipe or comment
- [ ] Resolve and Dismiss call the existing admin endpoints and are logged in the audit log
- [ ] The three admin report routes carry `describeRoute()` metadata
- [ ] Every new string in `en.json` and `tr.json`
- [ ] `make check`, `make lint`, `make test-web` and `make test-api` pass

**F15b**

- [ ] Auto-flagging detects profanity in new recipes/comments
- [ ] Auto-flagging detects rapid-fire comments (>10 in 5 min)
- [ ] Auto-flagging detects new user spam (3+ recipes in 24h)
- [ ] Auto-flagged content appears in the F15a reports page
- [ ] If adopted: escalate marks a report as `escalated` (enum value added through `schema.ts` + `make db-generate`), and resolve-with-action (`remove_content`, `ban_user`) acts on the content and logs to the audit log
- [ ] `make check` and `make lint` pass

## Implementation Steps

**F15a**

1. **Add `describeRoute()`** to `GET /admin/reports`, `PATCH /admin/reports/:id/resolve` and `/dismiss`
2. **Add `reportApi.create` and admin report calls** to `apps/web/src/api/index.ts`, plus a resource route for the report action
3. **Create `ReportDialog`** and wire the "Report" button into the recipe detail page and `CommentSection`
4. **Create `AdminReportsPage`** (`.tsx` + `.data.ts` loader + action) and add the lazy `/admin/reports` route and `AdminLayout` nav link with the pending badge
5. **Add i18n keys** to `en.json` and `tr.json`
6. **Add tests** (dialog, page loader/action, route metadata) and run `make check && make lint && make test-web && make test-api`

**F15b**

1. **Add the auto-flag queries** to `apps/api/src/modules/admin/model.ts` and `checkContentForAutoFlags()` to the admin service
2. **Settle the reporter for automatic reports** (system user or nullable reporter) and, if adopted, the `escalated` status and `moderateReport()`
3. **Hook auto-flagging** fire-and-forget into recipe creation and comment creation
4. **Add tests** for the auto-flagging rules and run `make check && make lint && make test-api`

## Dependencies

- Existing: `reports` table, `auditLogs` table, admin module, report module
- Existing: `comments`, `recipes`, `users` tables
- Existing: `banUser()`, `softDeleteRecipe()` in admin service
- Existing: admin middleware for route protection

## References

- [Drizzle ORM docs](https://orm.drizzle.team/docs) (Context7 id `/drizzle-team/drizzle-orm-docs`) — updates, inserts
- Existing: `apps/api/src/modules/admin/service.ts` — admin service pattern
- Existing: `apps/api/src/modules/admin/index.ts` — admin routes pattern
- Existing: `apps/api/src/modules/report/index.ts` — existing report routes
- Existing: `packages/db/src/schema.ts` `reports` table (`report`, :1063)
