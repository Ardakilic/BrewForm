import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.ts';
import {
  AdminBanUserSchema,
  AdminModifyRecipeVisibilitySchema,
  AdminFlushCacheSchema,
  PaginationSchema,
} from '@brewform/shared/schemas';
import * as service from './service.ts';
import { cacheProvider } from '../../main.ts';
import { success, paginated, error } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const admin = new Hono<AppEnv>();

admin.use('*', authMiddleware, adminMiddleware);

// --- Analytics Dashboard ---
admin.get('/stats', async (c) => {
  const stats = await service.getDashboardStats();
  return success(c, stats);
});

admin.get('/analytics/users', zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })), async (c) => {
  const { days } = c.req.valid('query');
  const growth = await service.getUserGrowth(days);
  return success(c, growth);
});

admin.get('/analytics/recipes', zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })), async (c) => {
  const { days } = c.req.valid('query');
  const growth = await service.getRecipeGrowth(days);
  return success(c, growth);
});

admin.get('/analytics/top-recipes', zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) })), async (c) => {
  const { limit } = c.req.valid('query');
  const recipes = await service.getTopRecipes(limit);
  return success(c, recipes);
});

admin.get('/analytics/top-users', zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) })), async (c) => {
  const { limit } = c.req.valid('query');
  const users = await service.getTopUsers(limit);
  return success(c, users);
});

// --- Users ---
admin.get('/users', zValidator('query', PaginationSchema.extend({ q: z.string().optional() })), async (c) => {
  const { page, perPage, q } = c.req.valid('query');
  const result = await service.listUsers(page, perPage, q);
  return paginated(c, result.users, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.get('/users/:id', async (c) => {
  const id = c.req.param('id')!;
  const user = await service.getUserDetail(id);
  if (!user) return error(c, 'NOT_FOUND', 'User not found', 404);
  return success(c, user);
});

admin.post('/users', async (c) => {
  const adminId = c.get('userId') as string;
  const body = await c.req.json();
  const parsed = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(30),
    password: z.string().min(8),
    displayName: z.string().optional(),
    isAdmin: z.boolean().optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return error(c, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  try {
    const user = await service.adminCreateUser(adminId, parsed.data);
    return success(c, user, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Unique constraint')) {
      return error(c, 'CONFLICT', 'Email or username already exists', 409);
    }
    throw err;
  }
});

admin.post('/users/:id/ban', zValidator('json', AdminBanUserSchema), async (c) => {
  const adminId = c.get('userId') as string;
  const { userId, banned } = c.req.valid('json');
  if (banned) {
    const user = await service.banUser(adminId, userId);
    return success(c, user);
  } else {
    const user = await service.unbanUser(adminId, userId);
    return success(c, user);
  }
});

admin.patch('/users/:id/admin', zValidator('json', z.object({ isAdmin: z.boolean() })), async (c) => {
  const adminId = c.get('userId') as string;
  const userId = c.req.param('id')!;
  const { isAdmin } = c.req.valid('json');
  const user = await service.setUserAdminRole(adminId, userId, isAdmin);
  return success(c, user);
});

admin.delete('/users/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const userId = c.req.param('id')!;
  await service.softDeleteUser(adminId, userId);
  return success(c, { message: 'User deleted' });
});

// --- Recipes ---
admin.get('/recipes', zValidator('query', PaginationSchema.extend({ visibility: z.string().optional() })), async (c) => {
  const { page, perPage, visibility } = c.req.valid('query');
  const result = await service.listAllRecipes(page, perPage, visibility);
  return paginated(c, result.recipes, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.patch('/recipes/:id/visibility', zValidator('json', AdminModifyRecipeVisibilitySchema), async (c) => {
  const adminId = c.get('userId') as string;
  const recipeId = c.req.param('id')!;
  const { visibility } = c.req.valid('json');
  const recipe = await service.updateRecipeVisibility(adminId, recipeId, visibility);
  return success(c, recipe);
});

admin.delete('/recipes/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const recipeId = c.req.param('id')!;
  await service.softDeleteRecipe(adminId, recipeId);
  return success(c, { message: 'Recipe deleted' });
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
  const adminId = c.get('userId') as string;
  const body = await c.req.json();
  const equipment = await service.createEquipment(adminId, body);
  return success(c, equipment, 201);
});

admin.patch('/equipment/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  const body = await c.req.json();
  const equipment = await service.updateEquipment(adminId, id, body);
  return success(c, equipment);
});

admin.delete('/equipment/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
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
  const adminId = c.get('userId') as string;
  const body = await c.req.json();
  const vendor = await service.createVendor(adminId, body);
  return success(c, vendor, 201);
});

admin.patch('/vendors/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  const body = await c.req.json();
  const vendor = await service.updateVendor(adminId, id, body);
  return success(c, vendor);
});

admin.delete('/vendors/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteVendor(adminId, id);
  return success(c, { message: 'Vendor deleted' });
});

// --- Taste Notes (admin) ---
admin.get('/taste-notes', async (c) => {
  const hierarchy = await service.listTasteNotes(cacheProvider!);
  return success(c, hierarchy);
});

admin.post('/taste-notes', async (c) => {
  const adminId = c.get('userId') as string;
  const body = await c.req.json();
  const note = await service.createTasteNote(adminId, body, cacheProvider!);
  return success(c, note, 201);
});

admin.patch('/taste-notes/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  const body = await c.req.json();
  const note = await service.updateTasteNote(adminId, id, body, cacheProvider!);
  return success(c, note);
});

admin.delete('/taste-notes/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteTasteNote(adminId, id, cacheProvider!);
  return success(c, { message: 'Taste note deleted' });
});

// --- Reports (admin) ---
admin.get('/reports', zValidator('query', PaginationSchema.extend({ status: z.string().optional(), entityType: z.string().optional() })), async (c) => {
  const { page, perPage, status, entityType } = c.req.valid('query');
  const result = await service.listReports(page, perPage, status, entityType);
  return paginated(c, result.reports, {
    page, perPage, total: result.total, totalPages: Math.ceil(result.total / perPage),
  });
});

admin.patch('/reports/:id/resolve', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  try {
    const report = await service.resolveReport(adminId, id);
    return success(c, report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'REPORT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Report not found', 404);
    if (message === 'REPORT_ALREADY_RESOLVED') return error(c, 'CONFLICT', 'Report already resolved', 409);
    throw err;
  }
});

admin.patch('/reports/:id/dismiss', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  try {
    const report = await service.dismissReport(adminId, id);
    return success(c, report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'REPORT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Report not found', 404);
    throw err;
  }
});

// --- Brew Method Compatibility Matrix ---
admin.get('/compatibility', async (c) => {
  const rules = await service.listCompatibilityRules();
  return success(c, rules);
});

admin.patch('/compatibility/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  const { compatible } = await c.req.json();
  const rule = await service.updateCompatibilityRule(adminId, id, compatible, cacheProvider!);
  return success(c, rule);
});

admin.post('/compatibility', async (c) => {
  const adminId = c.get('userId') as string;
  const body = await c.req.json();
  const rule = await service.createCompatibilityRule(adminId, body, cacheProvider!);
  return success(c, rule, 201);
});

admin.delete('/compatibility/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
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