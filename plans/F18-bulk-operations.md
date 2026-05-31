# F18 — Bulk Admin Operations

## Overview

Enable admins to perform bulk actions on users, recipes, and equipment from admin list pages. Includes checkbox selection, bulk action dropdown, confirmation dialogs, and audit logging.

## Goals

1. Bulk user actions: ban, unban, delete
2. Bulk recipe actions: feature, unfeature, delete
3. Bulk equipment actions: delete
4. Checkbox selection on admin list pages
5. Confirmation dialog before executing bulk actions
6. Audit log for each operation
7. Rate limiting: max 50 items per bulk operation

## User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-18.1 | As an admin, I can select multiple users and ban/unban/delete them | P0 |
| US-18.2 | As an admin, I can select multiple recipes and feature/unfeature/delete them | P0 |
| US-18.3 | As an admin, I can select multiple equipment items and delete them | P1 |
| US-18.4 | As an admin, I see a confirmation dialog before bulk actions | P0 |
| US-18.5 | As an admin, I see the count of selected items | P1 |
| US-18.6 | As an admin, all bulk actions are logged in the audit trail | P1 |
| US-18.7 | As an admin, I get error feedback if some items fail | P2 |

## Technical Design

### API Endpoints

No new tables. All bulk operations validated individually, then applied.

#### POST /admin/users/bulk

`apps/api/src/modules/admin/index.ts`:

```ts
admin.post(
  '/users/bulk',
  describeRoute({
    tags: ['Admin'],
    summary: 'Bulk user operations',
    description: 'Perform bulk actions on multiple users.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Bulk operation result' },
      400: { description: 'Invalid request' },
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('json', z.object({
    action: z.enum(['ban', 'unban', 'delete']),
    userIds: z.array(z.string().uuid()).min(1).max(50),
  })),
  async (c) => {
    const { action, userIds } = c.req.valid('json');
    const adminId = c.get('userId') as string;

    const results = await service.bulkUserAction(action, userIds, adminId);
    return success(c, results);
  },
);
```

#### POST /admin/recipes/bulk

```ts
admin.post(
  '/recipes/bulk',
  describeRoute({
    tags: ['Admin'],
    summary: 'Bulk recipe operations',
    description: 'Perform bulk actions on multiple recipes.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Bulk operation result' },
      400: { description: 'Invalid request' },
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('json', z.object({
    action: z.enum(['feature', 'unfeature', 'delete']),
    recipeIds: z.array(z.string().uuid()).min(1).max(50),
  })),
  async (c) => {
    const { action, recipeIds } = c.req.valid('json');
    const adminId = c.get('userId') as string;

    const results = await service.bulkRecipeAction(action, recipeIds, adminId);
    return success(c, results);
  },
);
```

#### POST /admin/equipment/bulk

```ts
admin.post(
  '/equipment/bulk',
  describeRoute({
    tags: ['Admin'],
    summary: 'Bulk equipment operations',
    description: 'Perform bulk actions on multiple equipment items.',
    security: [{ bearerAuth: [] }],
    responses: {
      200: { description: 'Bulk operation result' },
      400: { description: 'Invalid request' },
    },
  }),
  authMiddleware,
  adminMiddleware,
  zValidator('json', z.object({
    action: z.enum(['delete']),
    equipmentIds: z.array(z.string().uuid()).min(1).max(50),
  })),
  async (c) => {
    const { action, equipmentIds } = c.req.valid('json');
    const adminId = c.get('userId') as string;

    const results = await service.bulkEquipmentAction(action, equipmentIds, adminId);
    return success(c, results);
  },
);
```

### Service Layer

`apps/api/src/modules/admin/service.ts` — new functions:

```ts
interface BulkOperationResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  total: number;
}

export async function bulkUserAction(
  action: 'ban' | 'unban' | 'delete',
  userIds: string[],
  adminId: string,
): Promise<BulkOperationResult> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const userId of userIds) {
    try {
      switch (action) {
        case 'ban':
          await banUser(userId, adminId);
          break;
        case 'unban':
          await unbanUser(userId, adminId);
          break;
        case 'delete':
          await softDeleteUser(userId, adminId);
          break;
      }
      succeeded.push(userId);
    } catch (err) {
      failed.push({ id: userId, error: (err as Error).message });
    }
  }

  // Audit log for bulk operation
  await db.insert(auditLogs).values({
    adminId,
    action: `bulk.users.${action}`,
    entity: 'user',
    entityId: null,
    details: JSON.stringify({
      action,
      userIds,
      succeededCount: succeeded.length,
      failedCount: failed.length,
    }),
  });

  return { succeeded, failed, total: userIds.length };
}

export async function bulkRecipeAction(
  action: 'feature' | 'unfeature' | 'delete',
  recipeIds: string[],
  adminId: string,
): Promise<BulkOperationResult> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const recipeId of recipeIds) {
    try {
      switch (action) {
        case 'feature':
          await model.toggleFeature(recipeId, true);
          break;
        case 'unfeature':
          await model.toggleFeature(recipeId, false);
          break;
        case 'delete':
          await softDeleteRecipe(recipeId);
          break;
      }
      succeeded.push(recipeId);
    } catch (err) {
      failed.push({ id: recipeId, error: (err as Error).message });
    }
  }

  await db.insert(auditLogs).values({
    adminId,
    action: `bulk.recipes.${action}`,
    entity: 'recipe',
    entityId: null,
    details: JSON.stringify({
      action,
      recipeIds,
      succeededCount: succeeded.length,
      failedCount: failed.length,
    }),
  });

  return { succeeded, failed, total: recipeIds.length };
}

export async function bulkEquipmentAction(
  action: 'delete',
  equipmentIds: string[],
  adminId: string,
): Promise<BulkOperationResult> {
  const succeeded: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const equipmentId of equipmentIds) {
    try {
      switch (action) {
        case 'delete':
          await deleteEquipment(equipmentId);
          break;
      }
      succeeded.push(equipmentId);
    } catch (err) {
      failed.push({ id: equipmentId, error: (err as Error).message });
    }
  }

  await db.insert(auditLogs).values({
    adminId,
    action: `bulk.equipment.${action}`,
    entity: 'equipment',
    entityId: null,
    details: JSON.stringify({
      action,
      equipmentIds,
      succeededCount: succeeded.length,
      failedCount: failed.length,
    }),
  });

  return { succeeded, failed, total: equipmentIds.length };
}
```

### Frontend

#### Selection State Hook

`apps/web/src/hooks/useBulkSelection.ts`:

```ts
import { useState, useCallback } from 'react';

export function useBulkSelection<T extends { id: string }>() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback((items: T[]) => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) {
        return new Set(); // deselect all
      }
      return new Set(items.map((i) => i.id));
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);
  const isAllSelected = useCallback(
    (items: T[]) => items.length > 0 && items.every((i) => selectedIds.has(i.id)),
    [selectedIds],
  );

  return { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected, count: selectedIds.size };
}
```

#### BulkActionToolbar

`apps/web/src/components/admin/BulkActionToolbar.tsx`:

```tsx
interface BulkActionToolbarProps {
  selectedCount: number;
  actions: Array<{ label: string; value: string; variant?: string }>;
  onAction: (action: string) => void;
  onClear: () => void;
}

export function BulkActionToolbar({ selectedCount, actions, onAction, onClear }: BulkActionToolbarProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleAction = (action: string) => {
    setPendingAction(action);
    setShowConfirm(true);
  };

  const confirmAction = () => {
    if (pendingAction) {
      onAction(pendingAction);
    }
    setShowConfirm(false);
    setPendingAction(null);
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <select
          onChange={(e) => handleAction(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="">Choose action...</option>
          {actions.map((action) => (
            <option key={action.value} value={action.value}>{action.label}</option>
          ))}
        </select>
        <button onClick={onClear} className="text-sm text-gray-500">Clear selection</button>
      </div>

      {showConfirm && (
        <ConfirmationDialog
          title={`Confirm ${pendingAction}`}
          message={`Are you sure you want to ${pendingAction} ${selectedCount} items?`}
          onConfirm={confirmAction}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
```

#### Updated AdminUsersPage

`apps/web/src/pages/admin/AdminUsersPage.tsx`:

```tsx
export function AdminUsersPage() {
  const { selectedIds, toggle, toggleAll, clear, isSelected, isAllSelected, count } = useBulkSelection<User>();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get('/admin/users'),
  });

  const bulkMutation = useMutation({
    mutationFn: (params: { action: string; userIds: string[] }) =>
      api.post('/admin/users/bulk', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      clear();
    },
  });

  const handleBulkAction = (action: string) => {
    bulkMutation.mutate({ action, userIds: Array.from(selectedIds) });
  };

  return (
    <div>
      <h1>Users</h1>

      <BulkActionToolbar
        selectedCount={count}
        actions={[
          { label: 'Ban', value: 'ban' },
          { label: 'Unban', value: 'unban' },
          { label: 'Delete', value: 'delete' },
        ]}
        onAction={handleBulkAction}
        onClear={clear}
      />

      <table>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={isAllSelected(data?.users ?? [])}
                onChange={() => toggleAll(data?.users ?? [])}
              />
            </th>
            {/* ... other columns */}
          </tr>
        </thead>
        <tbody>
          {data?.users.map((user) => (
            <tr key={user.id}>
              <td>
                <input
                  type="checkbox"
                  checked={isSelected(user.id)}
                  onChange={() => toggle(user.id)}
                />
              </td>
              {/* ... other cells */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### Updated AdminRecipesPage

Same pattern as users — add checkbox column, `BulkActionToolbar` with actions: feature, unfeature, delete.

#### Updated AdminEquipmentPage

Same pattern — checkbox column, `BulkActionToolbar` with action: delete.

#### ConfirmationDialog

`apps/web/src/components/admin/ConfirmationDialog.tsx`:

```tsx
interface ConfirmationDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({ title, message, onConfirm, onCancel }: ConfirmationDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-gray-600">{message}</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={onCancel} variant="secondary">Cancel</Button>
          <Button onClick={onConfirm} variant="danger">Confirm</Button>
        </div>
      </div>
    </div>
  );
}
```

### Types

`apps/web/src/api/types.ts`:

```ts
export interface BulkOperationResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  total: number;
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/admin/users/bulk` | Bulk user actions |
| `POST` | `/api/v1/admin/recipes/bulk` | Bulk recipe actions |
| `POST` | `/api/v1/admin/equipment/bulk` | Bulk equipment actions |

**Users Bulk Request:**
```json
{
  "action": "ban",
  "userIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

**Users Bulk Response:**
```json
{
  "data": {
    "succeeded": ["uuid-1", "uuid-2"],
    "failed": [{ "id": "uuid-3", "error": "User not found" }],
    "total": 3
  }
}
```

**Recipes Bulk Request:**
```json
{
  "action": "feature",
  "recipeIds": ["uuid-1", "uuid-2"]
}
```

**Equipment Bulk Request:**
```json
{
  "action": "delete",
  "equipmentIds": ["uuid-1", "uuid-2"]
}
```

## Frontend Components

| Component | Location | Description |
|-----------|----------|-------------|
| `BulkActionToolbar` | `components/admin/BulkActionToolbar.tsx` | Selection count + action dropdown |
| `ConfirmationDialog` | `components/admin/ConfirmationDialog.tsx` | Confirmation modal |
| `useBulkSelection` | `hooks/useBulkSelection.ts` | Selection state management hook |
| `AdminUsersPage` | `pages/admin/AdminUsersPage.tsx` | Updated with checkbox + bulk actions |
| `AdminRecipesPage` | `pages/admin/AdminRecipesPage.tsx` | Updated with checkbox + bulk actions |
| `AdminEquipmentPage` | `pages/admin/AdminEquipmentPage.tsx` | Updated with checkbox + bulk actions |

## Acceptance Criteria

- [ ] Admin list pages show checkboxes for selection
- [ ] Select all/deselect all checkbox works
- [ ] Bulk action toolbar appears when items selected
- [ ] Selection count displayed correctly
- [ ] Confirmation dialog shown before bulk action
- [ ] Ban action bans all selected users
- [ ] Unban action unbans all selected users
- [ ] Delete action soft-deletes all selected items
- [ ] Feature/unfeature action toggles recipe featured status
- [ ] Error feedback shown for failed items
- [ ] Successful items removed from selection
- [ ] Audit log created for each bulk operation
- [ ] Max 50 items per bulk operation enforced
- [ ] Empty selection hides toolbar
- [ ] `make check` passes
- [ ] `make lint` passes

## Implementation Steps

1. **Add bulk routes** to `apps/api/src/modules/admin/index.ts` (users, recipes, equipment)
2. **Add `bulkUserAction()`, `bulkRecipeAction()`, `bulkEquipmentAction()`** to admin service
3. **Create `useBulkSelection` hook** in `apps/web/src/hooks/`
4. **Create `BulkActionToolbar`** component
5. **Create `ConfirmationDialog`** component
6. **Update `AdminUsersPage`** with checkbox column and bulk toolbar
7. **Update `AdminRecipesPage`** with checkbox column and bulk toolbar
8. **Update `AdminEquipmentPage`** with checkbox column and bulk toolbar
9. **Add API types** for bulk operation results
10. **Add tests** for bulk operations (validation, individual item processing)
11. **Run `make check && make lint && make test`**

## Dependencies

- Existing: admin module, admin service with `banUser()`, `unbanUser()`, `softDeleteUser()`, `softDeleteRecipe()`, `deleteEquipment()`
- Existing: `auditLogs` table for audit logging
- Existing: `toggleFeature()` in recipe model

## References

- [Drizzle ORM docs](/drizzle-team/drizzle-orm-docs) — batch updates
- [React docs](/reactjs/react.dev) — hooks, state management
- Existing: `apps/api/src/modules/admin/service.ts` — existing admin service functions
- Existing: `apps/api/src/modules/admin/index.ts` — existing admin routes pattern
- Existing: `apps/web/src/pages/admin/AdminUsersPage.tsx` — current admin users page
