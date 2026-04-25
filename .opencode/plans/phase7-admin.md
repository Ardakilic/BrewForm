# BrewForm Phase 7 — Admin Module

## Status: READY

## Overview

Implement the admin panel backend: admin middleware, all admin CRUD routes, audit logging, and cache flush endpoints.

---

## File Inventory

### 1. `apps/api/src/modules/admin/model.ts`

```typescript
import { prisma } from '@brewform/db';

export async function listUsers(page: number, perPage: number, query?: string) {
  const where: any = { deletedAt: null };
  if (query) {
    where.OR = [
      { email: { contains: query } },
      { username: { contains: query } },
      { displayName: { contains: query } },
    ];
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true, email: true, username: true, displayName: true,
        avatarUrl: true, isAdmin: true, isBanned: true, createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}

export async function banUser(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { isBanned: true } });
}

export async function unbanUser(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { isBanned: false } });
}

export async function listAllRecipes(page: number, perPage: number) {
  const [recipes, total] = await Promise.all([
    prisma.recipe.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        author: { select: { id: true, username: true } },
        versions: { take: 1, orderBy: { versionNumber: 'desc' } },
      },
    }),
    prisma.recipe.count({ where: { deletedAt: null } }),
  ]);
  return { recipes, total };
}

export async function updateRecipeVisibility(recipeId: string, visibility: string) {
  return prisma.recipe.update({
    where: { id: recipeId },
    data: { visibility: visibility as any },
  });
}

export async function listEquipment(page: number, perPage: number) {
  const [equipment, total] = await Promise.all([
    prisma.equipment.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.equipment.count({ where: { deletedAt: null } }),
  ]);
  return { equipment, total };
}

export async function createEquipment(data: { name: string; type: string; brand?: string; model?: string; description?: string }) {
  return prisma.equipment.create({ data: data as any });
}

export async function updateEquipment(id: string, data: any) {
  return prisma.equipment.update({ where: { id }, data });
}

export async function deleteEquipment(id: string) {
  return prisma.equipment.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listVendors(page: number, perPage: number) {
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.vendor.count({ where: { deletedAt: null } }),
  ]);
  return { vendors, total };
}

export async function createVendor(data: { name: string; website?: string; description?: string }) {
  return prisma.vendor.create({ data });
}

export async function updateVendor(id: string, data: any) {
  return prisma.vendor.update({ where: { id }, data });
}

export async function deleteVendor(id: string) {
  return prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listCompatibilityRules() {
  return prisma.brewMethodEquipmentRule.findMany({ orderBy: [{ brewMethod: 'asc' }, { equipmentType: 'asc' }] });
}

export async function updateCompatibilityRule(id: string, compatible: boolean) {
  return prisma.brewMethodEquipmentRule.update({ where: { id }, data: { compatible } });
}

export async function createCompatibilityRule(data: { brewMethod: string; equipmentType: string; compatible: boolean }) {
  return prisma.brewMethodEquipmentRule.create({ data: data as any });
}

export async function deleteCompatibilityRule(id: string) {
  return prisma.brewMethodEquipmentRule.delete({ where: { id } });
}

export async function createAuditLog(adminId: string, action: string, entity: string, entityId?: string, details?: string) {
  return prisma.auditLog.create({
    data: { adminId, action, entity, entityId, details },
  });
}

export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  const where: any = {};
  if (entity) where.entity = entity;
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { id: true, username: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { logs, total };
}
```

### 2. `apps/api/src/modules/admin/service.ts`

```typescript
import * as model from './model.ts';
import type { CacheProvider } from '../../utils/cache/index.ts';

export async function listUsers(page: number, perPage: number, query?: string) {
  return model.listUsers(page, perPage, query);
}

export async function banUser(adminId: string, userId: string) {
  const user = await model.banUser(userId);
  await model.createAuditLog(adminId, 'BAN_USER', 'User', userId);
  return user;
}

export async function unbanUser(adminId: string, userId: string) {
  const user = await model.unbanUser(userId);
  await model.createAuditLog(adminId, 'UNBAN_USER', 'User', userId);
  return user;
}

export async function listAllRecipes(page: number, perPage: number) {
  return model.listAllRecipes(page, perPage);
}

export async function updateRecipeVisibility(adminId: string, recipeId: string, visibility: string) {
  const recipe = await model.updateRecipeVisibility(recipeId, visibility);
  await model.createAuditLog(adminId, 'UPDATE_RECIPE_VISIBILITY', 'Recipe', recipeId, `visibility: ${visibility}`);
  return recipe;
}

export async function listEquipment(page: number, perPage: number) {
  return model.listEquipment(page, perPage);
}

export async function createEquipment(adminId: string, data: any) {
  const equipment = await model.createEquipment(data);
  await model.createAuditLog(adminId, 'CREATE_EQUIPMENT', 'Equipment', equipment.id);
  return equipment;
}

export async function updateEquipment(adminId: string, id: string, data: any) {
  const equipment = await model.updateEquipment(id, data);
  await model.createAuditLog(adminId, 'UPDATE_EQUIPMENT', 'Equipment', id);
  return equipment;
}

export async function deleteEquipment(adminId: string, id: string) {
  await model.deleteEquipment(id);
  await model.createAuditLog(adminId, 'DELETE_EQUIPMENT', 'Equipment', id);
}

export async function listVendors(page: number, perPage: number) {
  return model.listVendors(page, perPage);
}

export async function createVendor(adminId: string, data: any) {
  const vendor = await model.createVendor(data);
  await model.createAuditLog(adminId, 'CREATE_VENDOR', 'Vendor', vendor.id);
  return vendor;
}

export async function updateVendor(adminId: string, id: string, data: any) {
  const vendor = await model.updateVendor(id, data);
  await model.createAuditLog(adminId, 'UPDATE_VENDOR', 'Vendor', id);
  return vendor;
}

export async function deleteVendor(adminId: string, id: string) {
  await model.deleteVendor(id);
  await model.createAuditLog(adminId, 'DELETE_VENDOR', 'Vendor', id);
}

export async function listCompatibilityRules() {
  return model.listCompatibilityRules();
}

export async function updateCompatibilityRule(adminId: string, id: string, compatible: boolean, cache: CacheProvider) {
  const rule = await model.updateCompatibilityRule(id, compatible);
  await model.createAuditLog(adminId, 'UPDATE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', id, `compatible: ${compatible}`);
  await cache.deleteByPrefix(['cache', 'compatibility']);
  return rule;
}

export async function createCompatibilityRule(adminId: string, data: any, cache: CacheProvider) {
  const rule = await model.createCompatibilityRule(data);
  await model.createAuditLog(adminId, 'CREATE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', rule.id);
  await cache.deleteByPrefix(['cache', 'compatibility']);
  return rule;
}

export async function deleteCompatibilityRule(adminId: string, id: string, cache: CacheProvider) {
  await model.deleteCompatibilityRule(id);
  await model.createAuditLog(adminId, 'DELETE_COMPATIBILITY_RULE', 'BrewMethodEquipmentRule', id);
  await cache.deleteByPrefix(['cache', 'compatibility']);
}

export async function listAuditLogs(page: number, perPage: number, entity?: string) {
  return model.listAuditLogs(page, perPage, entity);
}

export async function flushCache(cache: CacheProvider, keys: string[]) {
  if (keys.length === 0) {
    await cache.deleteByPrefix(['cache']);
  } else {
    for (const key of keys) {
      await cache.delete(['cache', key]);
    }
  }
  await model.createAuditLog('system', 'FLUSH_CACHE', 'Cache', undefined, keys.length > 0 ? keys.join(',') : 'ALL');
}
```

### 3. `apps/api/src/modules/admin/index.ts`

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import {
  AdminBanUserSchema,
  AdminModifyRecipeVisibilitySchema,
  AdminFlushCacheSchema,
} from '@brewform/shared/schemas';
import { PaginationSchema } from '@brewform/shared/schemas';
import * as service from './service.ts';
import { cacheProvider } from '../../main.ts';
import { success, paginated, error } from '../../utils/response/index.ts';

const admin = new Hono();

admin.use('*', authMiddleware, adminMiddleware);

// --- Users ---
admin.get('/users', zValidator('query', PaginationSchema.extend({ q: z.string().optional() })), async (c) => {
  const { page, perPage, q } = c.req.valid('query');
  const result = await service.listUsers(page, perPage, q);
  return paginated(c, result.users, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.post('/users/:id/ban', zValidator('json', AdminBanUserSchema), async (c) => {
  const adminId = c.get('userId');
  const { userId, banned } = c.req.valid('json');
  if (banned) {
    const user = await service.banUser(adminId, userId);
    return success(c, user);
  } else {
    const user = await service.unbanUser(adminId, userId);
    return success(c, user);
  }
});

// --- Recipes ---
admin.get('/recipes', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listAllRecipes(page, perPage);
  return paginated(c, result.recipes, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.patch('/recipes/:id/visibility', zValidator('json', AdminModifyRecipeVisibilitySchema), async (c) => {
  const adminId = c.get('userId');
  const recipeId = c.req.param('id');
  const { visibility } = c.req.valid('json');
  const recipe = await service.updateRecipeVisibility(adminId, recipeId, visibility);
  return success(c, recipe);
});

// --- Equipment ---
admin.get('/equipment', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listEquipment(page, perPage);
  return paginated(c, result.equipment, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.post('/equipment', async (c) => {
  const adminId = c.get('userId');
  const body = await c.req.json();
  const equipment = await service.createEquipment(adminId, body);
  return success(c, equipment, 201);
});

admin.patch('/equipment/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const equipment = await service.updateEquipment(adminId, id, body);
  return success(c, equipment);
});

admin.delete('/equipment/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  await service.deleteEquipment(adminId, id);
  return success(c, { message: 'Equipment deleted' });
});

// --- Vendors ---
admin.get('/vendors', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listVendors(page, perPage);
  return paginated(c, result.vendors, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.post('/vendors', async (c) => {
  const adminId = c.get('userId');
  const body = await c.req.json();
  const vendor = await service.createVendor(adminId, body);
  return success(c, vendor, 201);
});

admin.patch('/vendors/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const vendor = await service.updateVendor(adminId, id, body);
  return success(c, vendor);
});

admin.delete('/vendors/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  await service.deleteVendor(adminId, id);
  return success(c, { message: 'Vendor deleted' });
});

// --- Taste Notes (delegates to taste module with admin middleware) ---
admin.get('/taste-notes', async (c) => {
  const { getHierarchy } = await import('../taste/service.ts');
  const hierarchy = await getHierarchy(cacheProvider!);
  return success(c, hierarchy);
});

// --- Brew Method Compatibility Matrix ---
admin.get('/compatibility', async (c) => {
  const rules = await service.listCompatibilityRules();
  return success(c, rules);
});

admin.patch('/compatibility/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  const { compatible } = await c.req.json();
  const rule = await service.updateCompatibilityRule(adminId, id, compatible, cacheProvider!);
  return success(c, rule);
});

admin.post('/compatibility', async (c) => {
  const adminId = c.get('userId');
  const body = await c.req.json();
  const rule = await service.createCompatibilityRule(adminId, body, cacheProvider!);
  return success(c, rule, 201);
});

admin.delete('/compatibility/:id', async (c) => {
  const adminId = c.get('userId');
  const id = c.req.param('id');
  await service.deleteCompatibilityRule(adminId, id, cacheProvider!);
  return success(c, { message: 'Compatibility rule deleted' });
});

// --- Audit Log ---
admin.get('/audit-log', zValidator('query', PaginationSchema.extend({ entity: z.string().optional() })), async (c) => {
  const { page, perPage, entity } = c.req.valid('query');
  const result = await service.listAuditLogs(page, perPage, entity);
  return paginated(c, result.logs, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

// --- Cache Flush ---
admin.post('/cache/flush', zValidator('json', AdminFlushCacheSchema.optional()), async (c) => {
  const body = c.req.valid('json') ?? { keys: [] };
  await service.flushCache(cacheProvider!, body.keys ?? []);
  return success(c, { message: 'Cache flushed' });
});

export default admin;
```

*(Note: the `z` import from `zod` needs to be added at the top of admin/index.ts for inline `z.string().optional()` usage.)*

---

## Route Registration

In `apps/api/src/routes/index.ts`, add:

```typescript
import admin from '../modules/admin/index.ts';
// ...
routes.route('/api/v1/admin', admin);
```

---

## Key Design Decisions

- **All admin routes require `authMiddleware` + `adminMiddleware`** — applied via `admin.use('*', authMiddleware, adminMiddleware)`.
- **Every admin action creates an AuditLog entry** — tracks who did what, when, to which entity.
- **Cache flush after compatibility matrix changes** — when admins update brew method equipment rules, the Deno KV cache is flushed immediately.
- **Taste note admin CRUD** — delegates to the taste module service but uses admin middleware. Admin changes to taste notes also flush the taste note cache.
- **User ban/unban** — simple boolean flag on User model. Banned users cannot log in (checked in auth middleware).
- **Recipe visibility changes** — admins can force any recipe's visibility (e.g., make a private recipe public, or hide a public recipe).