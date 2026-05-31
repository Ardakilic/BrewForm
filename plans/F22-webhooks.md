# F22 — Webhook System

## Overview

Allow users to register webhooks for events (new recipe, new follower, badge earned). Webhooks are HTTP POST requests with HMAC-signed payloads, delivered with retry logic and exponential backoff.

## Goals

1. Let users register webhooks for specific event types
2. Deliver webhook payloads with HMAC signature verification
3. Support retry with exponential backoff for failed deliveries
4. Provide delivery logs for debugging
5. Keep webhook management simple and self-service

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | Register a webhook URL for specific events | I can automate responses to BrewForm events |
| US-2 | Authenticated user | Choose which events trigger my webhook | I only receive notifications I care about |
| US-3 | Authenticated user | View my webhook delivery history | I can debug failed deliveries |
| US-4 | Authenticated user | Pause/resume a webhook | I can temporarily disable without deleting |
| US-5 | Authenticated user | Revoke a webhook | I can remove webhooks I no longer need |
| US-6 | Developer | Verify webhook signatures using HMAC | I can trust the webhook payload is authentic |

## Technical Design

### Database Schema (Drizzle ORM)

Add to `packages/db/src/schema.ts`:

```ts
export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'success',
  'failed',
]);

export const webhooks = pgTable(
  'webhook',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
    url: varchar('url', { length: 500 }).notNull(),
    events: text('events').array().notNull(), // e.g., ['recipe.created', 'badge.earned']
    secret: varchar('secret', { length: 64 }).notNull().$defaultFn(() => crypto.randomUUID().replace(/-/g, '')),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('webhook_user_id_idx').on(table.userId),
    index('webhook_deleted_at_idx').on(table.deletedAt),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_delivery',
  {
    id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
    webhookId: varchar('webhook_id', { length: 36 }).notNull().references(() => webhooks.id),
    event: varchar('event', { length: 100 }).notNull(),
    payload: text('payload').notNull(), // JSON string
    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    responseStatus: integer('response_status'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_delivery_webhook_id_idx').on(table.webhookId),
    index('webhook_delivery_status_idx').on(table.status),
    index('webhook_delivery_created_at_idx').on(table.createdAt),
  ],
);
```

**Relations to add:**

```ts
export const usersRelations = relations(users, ({ one, many }) => ({
  // ... existing relations
  webhooks: many(webhooks),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  user: one(users, {
    fields: [webhooks.userId],
    references: [users.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, {
    fields: [webhookDeliveries.webhookId],
    references: [webhooks.id],
  }),
}));
```

### Migration

Run `make db-generate` to produce the SQL migration. **Never write manual SQL.**

### Webhook Delivery Service

Create `apps/api/src/modules/webhook/delivery.ts`:

```ts
import { db } from '@brewform/db';
import { webhooks, webhookDeliveries } from '@brewform/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('webhook-delivery');

/**
 * Supported webhook event types.
 */
export type WebhookEvent =
  | 'recipe.created'
  | 'recipe.liked'
  | 'recipe.commented'
  | 'user.followed'
  | 'badge.earned';

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 */
async function signPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deliver a webhook payload with retry logic.
 */
async function deliverWebhook(
  webhook: { id: string; url: string; secret: string },
  event: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; responseStatus?: number }> {
  const payloadStr = JSON.stringify(payload);
  const signature = await signPayload(payloadStr, webhook.secret);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BrewForm-Signature': `sha256=${signature}`,
          'X-BrewForm-Event': event,
          'X-BrewForm-Delivery': crypto.randomUUID(),
        },
        body: payloadStr,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) {
        return { success: true, responseStatus: response.status };
      }

      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      return { success: false, responseStatus: response.status };
    } catch (err) {
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      logger.error({ err, webhookId: webhook.id, attempt }, 'Webhook delivery failed');
    }
  }

  return { success: false };
}

/**
 * Dispatch a webhook event to all matching webhooks.
 */
export async function dispatchWebhookEvent(event: WebhookEvent, payload: Record<string, unknown>) {
  const matchingWebhooks = await db.select().from(webhooks)
    .where(
      and(
        eq(webhooks.isActive, true),
        isNull(webhooks.deletedAt),
      )
    );

  const relevant = matchingWebhooks.filter(w => w.events.includes(event));

  for (const webhook of relevant) {
    const delivery = await db.insert(webhookDeliveries).values({
      webhookId: webhook.id,
      event,
      payload: JSON.stringify(payload),
      status: 'pending',
    }).returning();

    // Deliver asynchronously
    deliverWebhook(webhook, event, payload)
      .then(async (result) => {
        await db.update(webhookDeliveries)
          .set({
            status: result.success ? 'success' : 'failed',
            responseStatus: result.responseStatus,
            attempts: 1,
            lastAttemptAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, delivery[0].id));
      })
      .catch((err) => {
        logger.error({ err, deliveryId: delivery[0].id }, 'Webhook delivery error');
      });
  }
}
```

### Module: `modules/webhook/`

#### `model.ts`

```ts
import { db } from '@brewform/db';
import { webhooks, webhookDeliveries } from '@brewform/db/schema';
import { and, count, desc, eq, isNull } from 'drizzle-orm';

export async function findById(id: string) { /* ... */ }
export async function findByUserId(userId: string) { /* ... */ }
export async function create(data: typeof webhooks.$inferInsert) { /* ... */ }
export async function update(id: string, data: Partial<typeof webhooks.$inferInsert>) { /* ... */ }
export async function softDelete(id: string) { /* ... */ }
export async function getDeliveries(webhookId: string, page: number, perPage: number) { /* ... */ }
```

#### `service.ts`

```ts
import * as model from './model.ts';
import { createLogger } from '../../utils/logger/index.ts';

const logger = createLogger('webhook-service');

export async function createWebhook(userId: string, url: string, events: string[]) {
  return model.create({ userId, url, events });
}

export async function listWebhooks(userId: string) {
  return model.findByUserId(userId);
}

export async function updateWebhook(userId: string, webhookId: string, data: { url?: string; events?: string[]; isActive?: boolean }) {
  const webhook = await model.findById(webhookId);
  if (!webhook) throw new Error('WEBHOOK_NOT_FOUND');
  if (webhook.userId !== userId) throw new Error('FORBIDDEN');
  return model.update(webhookId, data);
}

export async function deleteWebhook(userId: string, webhookId: string) {
  const webhook = await model.findById(webhookId);
  if (!webhook) throw new Error('WEBHOOK_NOT_FOUND');
  if (webhook.userId !== userId) throw new Error('FORBIDDEN');
  return model.softDelete(webhookId);
}

export async function getDeliveries(userId: string, webhookId: string, page: number, perPage: number) {
  const webhook = await model.findById(webhookId);
  if (!webhook) throw new Error('WEBHOOK_NOT_FOUND');
  if (webhook.userId !== userId) throw new Error('FORBIDDEN');
  return model.getDeliveries(webhookId, page, perPage);
}
```

#### `index.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/webhooks` | Required | List user's webhooks |
| `POST` | `/webhooks` | Required | Create a webhook |
| `PATCH` | `/webhooks/:id` | Required | Update a webhook |
| `DELETE` | `/webhooks/:id` | Required | Revoke a webhook |
| `GET` | `/webhooks/:id/deliveries` | Required | List delivery logs |

### Frontend Components

#### New Pages

| Page | Route | Description |
|------|-------|-------------|
| `WebhookSettingsPage` | `/settings/webhooks` | Webhook management interface |

#### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `WebhookList` | `components/settings/WebhookList.tsx` | List of webhooks with status |
| `WebhookCreateForm` | `components/settings/WebhookCreateForm.tsx` | Form to create webhook |
| `WebhookDeliveryLog` | `components/settings/WebhookDeliveryLog.tsx` | Delivery history table |

### Event Integration Points

Webhook events are dispatched from existing services:

```ts
// In recipe/service.ts — after creating a recipe
import { dispatchWebhookEvent } from '../webhook/delivery.ts';
dispatchWebhookEvent('recipe.created', { recipeId: recipe.id, title: recipe.title });

// In follow/service.ts — after following a user
dispatchWebhookEvent('user.followed', { followerId, followingId });

// In badge/service.ts — after awarding a badge
dispatchWebhookEvent('badge.earned', { userId, badgeId, badgeName });
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/webhooks` | Required | List user's webhooks |
| `POST` | `/api/v1/webhooks` | Required | Create a webhook |
| `PATCH` | `/api/v1/webhooks/:id` | Required | Update a webhook |
| `DELETE` | `/api/v1/webhooks/:id` | Required | Revoke a webhook |
| `GET` | `/api/v1/webhooks/:id/deliveries` | Required | List delivery logs |

## Acceptance Criteria

- [ ] User can create a webhook with URL and event types
- [ ] User can list their webhooks with status
- [ ] User can toggle webhook active/inactive
- [ ] User can delete a webhook
- [ ] User can view delivery history for a webhook
- [ ] Webhook payloads include HMAC-SHA256 signature in X-BrewForm-Signature header
- [ ] Failed deliveries retry up to 3 times with exponential backoff
- [ ] Delivery status is tracked (pending/success/failed)
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add Drizzle schema changes (webhooks, webhookDeliveries, relations) to schema.ts
2. Run `make db-generate` and `make db-migrate`
3. Create `apps/api/src/modules/webhook/delivery.ts`
4. Create `apps/api/src/modules/webhook/model.ts`
5. Create `apps/api/src/modules/webhook/service.ts`
6. Create `apps/api/src/modules/webhook/index.ts`
7. Register route in `apps/api/src/routes/index.ts`
8. Add webhook dispatch calls to recipe, follow, and badge services
9. Create `apps/web/src/pages/settings/WebhookSettingsPage.tsx`
10. Create frontend components
11. Add route to router
12. Write tests for delivery, model, service, and API endpoints
13. Run `make check && make lint && make test`

## Dependencies

- Existing `users` table (for foreign key)
- Existing `recipes`, `userFollows`, `userBadges` tables (for event sources)
- Existing `authMiddleware`
- Existing response helpers
