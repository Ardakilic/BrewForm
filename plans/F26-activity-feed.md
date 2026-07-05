# F26 — Expanded Activity Feed

> **Validation status (2026-07-04): ❌ Invalid — blocked**
>
> - Imports a nonexistent `models/index.ts` barrel and `brewLogModel` — there is no brewLogs table or brew-log module (blocked on F02).
> - Reimplements an offset-only feed while `getFeed` already supports cursor + offset pagination (D27) — build on the existing implementation instead.
> - Stale stack: `useInfiniteQuery` (no TanStack Query — use react-router v8 loaders) and `react-router-dom` imports (repo imports from 'react-router'); plan also rewrites the loader-based HomePage.
> - Needs a rewrite against current code before it is actionable.

## Overview

Expand the activity feed to include comments on followed recipes, equipment additions, brew journal entries, and badge achievements. All data is derived from existing tables — no new schema required.

## Goals

1. Show followed users' new recipes in the feed
2. Show comments on recipes the user follows
3. Show badge achievements by followed users
4. Show brew journal entries from followed users
5. Deduplicate and recency-weight feed items
6. Support cursor-based pagination for performance

## User Stories

| # | As a… | I want to… | So that… |
|---|-------|-----------|----------|
| US-1 | Authenticated user | See new recipes from users I follow | I can discover content from my network |
| US-2 | Authenticated user | See comments on recipes I follow | I can engage with discussions on recipes I care about |
| US-3 | Authenticated user | See badges earned by followed users | I can celebrate their achievements |
| US-4 | Authenticated user | See brew logs from followed users | I can see how they're brewing |
| US-5 | Authenticated user | See a mixed, chronologically sorted feed | I get a unified view of all activity |

## Technical Design

### No New Tables

This feature derives all data from existing tables:
- `recipes` — new recipes from followed users
- `comments` — comments on recipes user follows
- `userBadges` — badges earned by followed users
- `brewLogs` — brew journal entries from followed users
- `userFollows` — determines which users to include

### Feed Service

Modify `apps/api/src/modules/follow/service.ts`:

```ts
import { createLogger } from '../../utils/logger/index.ts';
import { recipeModel, commentModel, userModel, badgeModel, brewLogModel } from '../../models/index.ts';

const logger = createLogger('feed-service');

export type FeedItemType = 'recipe' | 'comment' | 'badge' | 'brew_log';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  createdAt: Date;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
  data: Record<string, unknown>;
}

/**
 * Get the expanded activity feed for a user.
 * Combines recipes, comments, badges, and brew logs from followed users.
 */
export async function getExpandedFeed(
  userId: string,
  page: number,
  perPage: number
): Promise<{ items: FeedItem[]; total: number }> {
  // Get IDs of users this person follows
  const followingIds = await userModel.getFollowedUserIds(userId);
  if (followingIds.length === 0) return { items: [], total: 0 };

  // All DB queries moved to model layer
  // See model.ts for: getFollowedRecipes, getFollowedComments, getFollowedBadges, getFollowedBrewLogs
  const [recipesData, commentsData, badgesData, brewLogsData] = await Promise.all([
    recipeModel.getFollowedRecipes(followingIds, 100),
    commentModel.getFollowedComments(followingIds, 100),
    badgeModel.getFollowedBadges(followingIds, 100),
    brewLogModel.getFollowedBrewLogs(followingIds, 100),
  ]);

  // Combine and sort all items (model methods return embedded user data)
  const allItems: FeedItem[] = [
    ...recipesData.map(r => ({
      id: r.id,
      type: 'recipe' as FeedItemType,
      createdAt: r.createdAt,
      user: r.user,
      data: { slug: r.slug, title: r.title },
    })),
    ...commentsData.map(c => ({
      id: c.id,
      type: 'comment' as FeedItemType,
      createdAt: c.createdAt,
      user: c.user,
      data: { recipeId: c.recipeId, content: c.content },
    })),
    ...badgesData.map(b => ({
      id: b.id,
      type: 'badge' as FeedItemType,
      createdAt: b.createdAt,
      user: b.user,
      data: { badgeId: b.badgeId, badgeName: b.badgeName, badgeIcon: b.badgeIcon },
    })),
    ...brewLogsData.map(b => ({
      id: b.id,
      type: 'brew_log' as FeedItemType,
      createdAt: b.createdAt,
      user: b.user,
      data: { recipeId: b.recipeId, notes: b.notes, personalRating: b.personalRating },
    })),
  ];

  // Sort by recency and deduplicate
  allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Deduplicate by composite key (type + id) to avoid collisions across entity types
  const seen = new Set<string>();
  const deduplicated = allItems.filter(item => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const total = deduplicated.length;
  const start = (page - 1) * perPage;
  const items = deduplicated.slice(start, start + perPage);

  return { items, total };
}
```

### API Enhancement

Modify `GET /follow/feed` endpoint:

```ts
follow.get('/feed', authMiddleware, zValidator('query', PaginationSchema), async (c) => {
  const userId = c.get('userId') as string;
  const { page, perPage } = c.req.valid('query');
  const result = await service.getExpandedFeed(userId, page, perPage);
  return paginated(c, result.items, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});
```

### Shared Schemas

Add to `packages/shared/src/schemas/follow.ts`:

```ts
export const FeedItemSchema = z.object({
  id: z.string(),
  type: z.enum(['recipe', 'comment', 'badge', 'brew_log']),
  createdAt: z.string().datetime(),
  user: z.object({
    id: z.string(),
    username: z.string().nullable(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  data: z.record(z.unknown()),
});
```

### Frontend Components

#### Feed Item Components

Create `apps/web/src/components/feed/FeedItemRenderer.tsx`:

```tsx
import type { FeedItem } from '@brewform/shared/types';
import { RecipeFeedItem } from './items/RecipeFeedItem';
import { CommentFeedItem } from './items/CommentFeedItem';
import { BadgeFeedItem } from './items/BadgeFeedItem';
import { BrewLogFeedItem } from './items/BrewLogFeedItem';

interface FeedItemRendererProps {
  item: FeedItem;
}

export function FeedItemRenderer({ item }: FeedItemRendererProps) {
  switch (item.type) {
    case 'recipe':
      return <RecipeFeedItem item={item} />;
    case 'comment':
      return <CommentFeedItem item={item} />;
    case 'badge':
      return <BadgeFeedItem item={item} />;
    case 'brew_log':
      return <BrewLogFeedItem item={item} />;
    default:
      return null;
  }
}
```

Create individual item components:

#### `apps/web/src/components/feed/items/RecipeFeedItem.tsx`

```tsx
import { Link } from 'react-router-dom';
import type { FeedItem } from '@brewform/shared/types';
import { UserAvatar } from '../../user/UserAvatar';

interface RecipeFeedItemProps {
  item: FeedItem;
}

export function RecipeFeedItem({ item }: RecipeFeedItemProps) {
  const { user, data } = item;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <UserAvatar user={user} size="sm" />
        <div>
          <Link to={`/users/${user.username}`} className="font-medium hover:underline">
            {user.displayName || user.username}
          </Link>
          <span className="text-gray-500 text-sm ml-2">shared a recipe</span>
        </div>
        <time className="text-gray-400 text-sm ml-auto">
          {new Date(item.createdAt).toLocaleDateString()}
        </time>
      </div>
      <Link
        to={`/recipes/${data.slug}`}
        className="block border rounded p-3 hover:bg-gray-50 transition-colors"
      >
        <h3 className="font-medium">{data.title as string}</h3>
      </Link>
    </div>
  );
}
```

#### `apps/web/src/components/feed/items/CommentFeedItem.tsx`

```tsx
import { Link } from 'react-router-dom';
import type { FeedItem } from '@brewform/shared/types';
import { UserAvatar } from '../../user/UserAvatar';

interface CommentFeedItemProps {
  item: FeedItem;
}

export function CommentFeedItem({ item }: CommentFeedItemProps) {
  const { user, data } = item;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <UserAvatar user={user} size="sm" />
        <div>
          <Link to={`/users/${user.username}`} className="font-medium hover:underline">
            {user.displayName || user.username}
          </Link>
          <span className="text-gray-500 text-sm ml-2">commented on a recipe</span>
        </div>
        <time className="text-gray-400 text-sm ml-auto">
          {new Date(item.createdAt).toLocaleDateString()}
        </time>
      </div>
      <p className="text-gray-700 ml-11">{data.content as string}</p>
    </div>
  );
}
```

#### `apps/web/src/components/feed/items/BadgeFeedItem.tsx`

```tsx
import { Link } from 'react-router-dom';
import type { FeedItem } from '@brewform/shared/types';
import { UserAvatar } from '../../user/UserAvatar';

interface BadgeFeedItemProps {
  item: FeedItem;
}

export function BadgeFeedItem({ item }: BadgeFeedItemProps) {
  const { user, data } = item;

  return (
    <div className="border rounded-lg p-4 bg-yellow-50">
      <div className="flex items-center gap-3">
        <UserAvatar user={user} size="sm" />
        <div>
          <Link to={`/users/${user.username}`} className="font-medium hover:underline">
            {user.displayName || user.username}
          </Link>
          <span className="text-gray-500 text-sm ml-2">
            earned the <strong>{data.badgeName as string}</strong> badge
          </span>
        </div>
        <span className="text-2xl ml-auto">{data.badgeIcon as string}</span>
      </div>
    </div>
  );
}
```

#### `apps/web/src/components/feed/items/BrewLogFeedItem.tsx`

```tsx
import { Link } from 'react-router-dom';
import type { FeedItem } from '@brewform/shared/types';
import { UserAvatar } from '../../user/UserAvatar';

interface BrewLogFeedItemProps {
  item: FeedItem;
}

export function BrewLogFeedItem({ item }: BrewLogFeedItemProps) {
  const { user, data } = item;

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        <UserAvatar user={user} size="sm" />
        <div>
          <Link to={`/users/${user.username}`} className="font-medium hover:underline">
            {user.displayName || user.username}
          </Link>
          <span className="text-gray-500 text-sm ml-2">logged a brew</span>
        </div>
        <time className="text-gray-400 text-sm ml-auto">
          {new Date(item.createdAt).toLocaleDateString()}
        </time>
      </div>
      {data.personalRating && (
        <div className="ml-11 text-sm text-gray-600">
          Rating: {data.personalRating}/10
        </div>
      )}
      {data.notes && (
        <p className="ml-11 text-gray-700 mt-1">{data.notes as string}</p>
      )}
    </div>
  );
}
```

### Enhanced Feed Page

Modify `apps/web/src/pages/HomePage.tsx`:

```tsx
import { FeedItemRenderer } from '../components/feed/FeedItemRenderer';
import { useInfiniteQuery } from '@tanstack/react-query';
import { client } from '../api/client';

export function HomePage() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam = 1 }) =>
      client.get('/follow/feed', { params: { page: pageParam, perPage: 20 } }),
    getNextPageParam: (lastPage) =>
      lastPage.meta.pagination.page < lastPage.meta.pagination.totalPages
        ? lastPage.meta.pagination.page + 1
        : undefined,
  });

  const items = data?.pages.flatMap(page => page.data) || [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Activity Feed</h1>
      <div className="space-y-4">
        {items.map(item => (
          <FeedItemRenderer key={item.id} item={item} />
        ))}
      </div>
      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="w-full mt-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/follow/feed` | Required | Expanded activity feed with mixed content types |

## Acceptance Criteria

- [ ] Feed shows new recipes from followed users
- [ ] Feed shows comments on recipes user follows
- [ ] Feed shows badge achievements by followed users
- [ ] Feed shows brew journal entries from followed users
- [ ] Feed items are sorted by recency (newest first)
- [ ] Feed items are deduplicated
- [ ] Feed supports pagination
- [ ] Each feed item type has distinct visual styling
- [ ] Feed items link to the relevant content
- [ ] Type-check passes (`make check`)
- [ ] Lint passes (`make lint`)
- [ ] Tests pass (`make test`)

## Implementation Steps

1. Add `getExpandedFeed` to `apps/api/src/modules/follow/service.ts`
2. Modify `GET /follow/feed` endpoint to use expanded feed
3. Add `FeedItemSchema` to shared schemas
4. Create `apps/web/src/components/feed/FeedItemRenderer.tsx`
5. Create `apps/web/src/components/feed/items/RecipeFeedItem.tsx`
6. Create `apps/web/src/components/feed/items/CommentFeedItem.tsx`
7. Create `apps/web/src/components/feed/items/BadgeFeedItem.tsx`
8. Create `apps/web/src/components/feed/items/BrewLogFeedItem.tsx`
9. Modify `HomePage.tsx` to use expanded feed with infinite scroll
10. Write tests for expanded feed service
11. Run `make check && make lint && make test`

## Dependencies

- Existing `recipes`, `comments`, `userBadges`, `brewLogs`, `userFollows` tables
- Existing `users` table (for user data)
- Existing `authMiddleware`
- Existing response helpers
- Existing `UserAvatar` component
