import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { describeRoute } from 'hono-openapi';
import { z } from 'zod';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import {
  AdminBanUserSchema,
  AdminCreateUserSchema,
  AdminFlushCacheSchema,
  AdminModifyRecipeVisibilitySchema,
  AdminUpdateUserSchema,
  BrewMethodCompatibilityCreateSchema,
  BrewMethodCompatibilityUpdateSchema,
  CoffeeVarietyCategoryEnum,
  CoffeeVarietyCreateSchema,
  CoffeeVarietyUpdateSchema,
  EquipmentCreateSchema,
  EquipmentUpdateSchema,
  PaginationSchema,
  ReportFilterSchema,
  TasteNoteCreateSchema,
  TasteNoteUpdateSchema,
  VendorCreateSchema,
  VendorUpdateSchema,
} from '@brewform/shared/schemas';
import * as service from './service.ts';
import { cacheProvider } from '../../utils/cache/singleton.ts';
import { error, paginated, success, zodValidationHook } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const admin = new Hono<AppEnv>();

admin.use('*', authMiddleware, adminMiddleware);

// --- Analytics Dashboard ---
admin.get(
  '/stats',
  describeRoute({
    tags: ['Admin'],
    summary: 'Dashboard summary stats',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Aggregate counters for the admin home page' } },
  }),
  async (c) => {
    const stats = await service.getDashboardStats(c.get('requestId'));
    return success(c, stats);
  },
);

admin.get(
  '/analytics/users',
  describeRoute({
    tags: ['Admin'],
    summary: 'User signup growth over a window of days',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Time-series of new users per day' } },
  }),
  zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })),
  async (c) => {
    const { days } = c.req.valid('query');
    const growth = await service.getUserGrowth(days, c.get('requestId'));
    return success(c, growth);
  },
);

admin.get(
  '/analytics/recipes',
  describeRoute({
    tags: ['Admin'],
    summary: 'Recipe creation growth over a window of days',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Time-series of new recipes per day' } },
  }),
  zValidator('query', z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })),
  async (c) => {
    const { days } = c.req.valid('query');
    const growth = await service.getRecipeGrowth(days, c.get('requestId'));
    return success(c, growth);
  },
);

admin.get(
  '/analytics/top-recipes',
  describeRoute({
    tags: ['Admin'],
    summary: 'Top recipes leaderboard',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Top recipes by like count' } },
  }),
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) })),
  async (c) => {
    const { limit } = c.req.valid('query');
    const recipes = await service.getTopRecipes(limit, c.get('requestId'));
    return success(c, recipes);
  },
);

admin.get(
  '/analytics/top-users',
  describeRoute({
    tags: ['Admin'],
    summary: 'Top users leaderboard',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Top users by recipe / follower counts' } },
  }),
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) })),
  async (c) => {
    const { limit } = c.req.valid('query');
    const users = await service.getTopUsers(limit, c.get('requestId'));
    return success(c, users);
  },
);

// --- Users ---
admin.get(
  '/users',
  zValidator('query', PaginationSchema.extend({ q: z.string().optional() })),
  async (c) => {
    const { page, perPage, q } = c.req.valid('query');
    const result = await service.listUsers(page, perPage, q, c.get('requestId'));
    return paginated(c, result.users, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

admin.get('/users/:id', async (c) => {
  const id = c.req.param('id')!;
  const user = await service.getUserDetail(id, c.get('requestId'));
  if (!user) return error(c, 'NOT_FOUND', 'User not found', 404);
  return success(c, user);
});

admin.post(
  '/users',
  zValidator('json', AdminCreateUserSchema),
  async (c) => {
    const adminId = c.get('userId') as string;
    const data = c.req.valid('json');
    try {
      const user = await service.adminCreateUser(adminId, data);
      return success(c, user, 201);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'EMAIL_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Email is already registered.', 409);
      }
      if (message === 'USERNAME_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Username is already taken.', 409);
      }
      throw err;
    }
  },
);

admin.post('/users/:id/ban', zValidator('json', AdminBanUserSchema), async (c) => {
  const adminId = c.get('userId') as string;
  const targetId = c.req.param('id')!;
  const { banned, reason } = c.req.valid('json');
  try {
    if (banned) {
      const user = await service.banUser(adminId, targetId, reason);
      return success(c, user);
    } else {
      const user = await service.unbanUser(adminId, targetId);
      return success(c, user);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'USER_NOT_FOUND') {
      return error(c, 'NOT_FOUND', 'User not found.', 404);
    }
    throw err;
  }
});

admin.patch(
  '/users/:id',
  zValidator('json', AdminUpdateUserSchema),
  async (c) => {
    const adminId = c.get('userId') as string;
    const targetUserId = c.req.param('id')!;
    const data = c.req.valid('json');

    try {
      const user = await service.adminUpdateUser(adminId, targetUserId, data);
      return success(c, user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'SELF_EDIT_FORBIDDEN') {
        return error(
          c,
          'FORBIDDEN',
          'You cannot edit your own account from the admin panel. Use Profile Settings instead.',
          403,
        );
      }
      if (message === 'EMAIL_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Email is already registered by another user.', 409);
      }
      if (message === 'USERNAME_ALREADY_EXISTS') {
        return error(c, 'CONFLICT', 'Username is already taken by another user.', 409);
      }
      if (message === 'USER_NOT_FOUND') {
        return error(c, 'NOT_FOUND', 'User not found.', 404);
      }
      throw err;
    }
  },
);

admin.patch(
  '/users/:id/admin',
  zValidator('json', z.object({ isAdmin: z.boolean() })),
  async (c) => {
    const adminId = c.get('userId') as string;
    const userId = c.req.param('id')!;
    const { isAdmin } = c.req.valid('json');
    const user = await service.setUserAdminRole(adminId, userId, isAdmin);
    return success(c, user);
  },
);

admin.delete('/users/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const userId = c.req.param('id')!;
  try {
    await service.softDeleteUser(adminId, userId);
    return success(c, { message: 'User deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'SELF_DELETE_FORBIDDEN') {
      return error(c, 'FORBIDDEN', 'You cannot delete your own account.', 403);
    }
    throw err;
  }
});

// --- Recipes ---
admin.get(
  '/recipes',
  zValidator(
    'query',
    PaginationSchema.extend({
      visibility: z.enum(['draft', 'private', 'unlisted', 'public']).optional(),
    }),
  ),
  async (c) => {
    const { page, perPage, visibility } = c.req.valid('query');
    const result = await service.listAllRecipes(page, perPage, visibility, c.get('requestId'));
    return paginated(c, result.recipes, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

admin.patch(
  '/recipes/:id/visibility',
  zValidator('json', AdminModifyRecipeVisibilitySchema),
  async (c) => {
    const adminId = c.get('userId') as string;
    const recipeId = c.req.param('id')!;
    const { visibility } = c.req.valid('json');
    const recipe = await service.updateRecipeVisibility(adminId, recipeId, visibility);
    return success(c, recipe);
  },
);

admin.delete('/recipes/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const recipeId = c.req.param('id')!;
  await service.softDeleteRecipe(adminId, recipeId);
  return success(c, { message: 'Recipe deleted' });
});

// --- Equipment ---
admin.get('/equipment', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listEquipment(page, perPage, c.get('requestId'));
  return paginated(c, result.equipment, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

admin.post(
  '/equipment',
  zValidator('json', EquipmentCreateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const body = c.req.valid('json');
    const equipment = await service.createEquipment(adminId, body);
    return success(c, equipment, 201);
  },
);

admin.patch(
  '/equipment/:id',
  zValidator('json', EquipmentUpdateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const id = c.req.param('id')!;
    const body = c.req.valid('json');
    const equipment = await service.updateEquipment(adminId, id, body);
    return success(c, equipment);
  },
);

admin.delete('/equipment/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteEquipment(adminId, id);
  return success(c, { message: 'Equipment deleted' });
});

// --- Vendors ---
admin.get('/vendors', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listVendors(page, perPage, c.get('requestId'));
  return paginated(c, result.vendors, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

admin.post('/vendors', zValidator('json', VendorCreateSchema, zodValidationHook), async (c) => {
  const adminId = c.get('userId') as string;
  const body = c.req.valid('json');
  const vendor = await service.createVendor(adminId, body);
  return success(c, vendor, 201);
});

admin.patch(
  '/vendors/:id',
  zValidator('json', VendorUpdateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const id = c.req.param('id')!;
    const body = c.req.valid('json');
    const vendor = await service.updateVendor(adminId, id, body);
    return success(c, vendor);
  },
);

admin.delete('/vendors/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteVendor(adminId, id);
  return success(c, { message: 'Vendor deleted' });
});

// --- Taste Notes (admin) ---
admin.get('/taste-notes', async (c) => {
  const hierarchy = await service.listTasteNotes(cacheProvider!, c.get('requestId'));
  return success(c, hierarchy);
});

admin.post(
  '/taste-notes',
  zValidator('json', TasteNoteCreateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const body = c.req.valid('json');
    const note = await service.createTasteNote(adminId, body, cacheProvider!);
    return success(c, note, 201);
  },
);

admin.patch(
  '/taste-notes/:id',
  zValidator('json', TasteNoteUpdateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const id = c.req.param('id')!;
    const body = c.req.valid('json');
    const note = await service.updateTasteNote(adminId, id, body, cacheProvider!);
    return success(c, note);
  },
);

admin.delete('/taste-notes/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteTasteNote(adminId, id, cacheProvider!);
  return success(c, { message: 'Taste note deleted' });
});

// --- Reports (admin) ---
admin.get(
  '/reports',
  zValidator(
    'query',
    ReportFilterSchema.extend({ entityType: z.string().optional() }),
  ),
  async (c) => {
    const { page, perPage, status, entityType } = c.req.valid('query');
    const result = await service.listReports(page, perPage, status, entityType, c.get('requestId'));
    return paginated(c, result.reports, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

admin.patch('/reports/:id/resolve', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  try {
    const report = await service.resolveReport(adminId, id);
    return success(c, report);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'REPORT_NOT_FOUND') return error(c, 'NOT_FOUND', 'Report not found', 404);
    if (message === 'REPORT_ALREADY_RESOLVED') {
      return error(c, 'CONFLICT', 'Report already resolved', 409);
    }
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
  const rules = await service.listCompatibilityRules(c.get('requestId'));
  return success(c, rules);
});

admin.patch(
  '/compatibility/:id',
  zValidator('json', BrewMethodCompatibilityUpdateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const id = c.req.param('id')!;
    const { compatible } = c.req.valid('json');
    const rule = await service.updateCompatibilityRule(adminId, id, compatible, cacheProvider!);
    return success(c, rule);
  },
);

admin.post(
  '/compatibility',
  zValidator('json', BrewMethodCompatibilityCreateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const body = c.req.valid('json');
    const rule = await service.createCompatibilityRule(adminId, body, cacheProvider!);
    return success(c, rule, 201);
  },
);

admin.delete('/compatibility/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteCompatibilityRule(adminId, id, cacheProvider!);
  return success(c, { message: 'Compatibility rule deleted' });
});

// --- Audit Log ---
admin.get(
  '/audit-log',
  zValidator('query', PaginationSchema.extend({ entity: z.string().optional() })),
  async (c) => {
    const { page, perPage, entity } = c.req.valid('query');
    const result = await service.listAuditLogs(page, perPage, entity, c.get('requestId'));
    return paginated(c, result.logs, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

// --- Cache Flush ---
admin.post('/cache/flush', zValidator('json', AdminFlushCacheSchema.optional()), async (c) => {
  const body = c.req.valid('json') ?? { keys: [] };
  await service.flushCache(cacheProvider!, body.keys ?? []);
  return success(c, { message: 'Cache flushed' });
});

// --- Coffee Varieties (admin) ---
admin.get(
  '/coffee-varieties',
  zValidator(
    'query',
    PaginationSchema.extend({
      category: CoffeeVarietyCategoryEnum.optional(),
      search: z.string().optional(),
    }),
  ),
  async (c) => {
    const { page, perPage, category, search } = c.req.valid('query');
    const result = await service.listCoffeeVarieties(
      page,
      perPage,
      category,
      search,
      c.get('requestId'),
    );
    return paginated(c, result.varieties, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

admin.post(
  '/coffee-varieties',
  zValidator('json', CoffeeVarietyCreateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const data = c.req.valid('json');
    const variety = await service.createCoffeeVariety(adminId, data);
    return success(c, variety, 201);
  },
);

admin.patch(
  '/coffee-varieties/:id',
  zValidator('json', CoffeeVarietyUpdateSchema, zodValidationHook),
  async (c) => {
    const adminId = c.get('userId') as string;
    const id = c.req.param('id')!;
    const data = c.req.valid('json');
    const variety = await service.updateCoffeeVariety(adminId, id, data);
    return success(c, variety);
  },
);

admin.delete('/coffee-varieties/:id', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  await service.deleteCoffeeVariety(adminId, id);
  return success(c, { message: 'Coffee variety deleted' });
});

admin.get('/coffee-varieties/:id/recipe-count', async (c) => {
  const id = c.req.param('id')!;
  const count = await service.getVarietyRecipeCount(id, c.get('requestId'));
  return success(c, { count });
});

// --- Equipment Delete Requests (admin) ---
admin.get(
  '/equipment/delete-requests',
  zValidator(
    'query',
    PaginationSchema.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() }),
  ),
  async (c) => {
    const { page, perPage, status } = c.req.valid('query');
    const result = await service.listEquipmentDeleteRequests(
      page,
      perPage,
      status,
      c.get('requestId'),
    );
    return paginated(c, result.requests, {
      page,
      perPage,
      total: result.total,
      totalPages: Math.ceil(result.total / perPage),
    });
  },
);

admin.post('/equipment/delete-requests/:id/approve', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  try {
    const request = await service.approveEquipmentDeleteRequest(adminId, id);
    return success(c, request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'DELETE_REQUEST_NOT_FOUND') {
      return error(c, 'NOT_FOUND', 'Delete request not found', 404);
    }
    throw err;
  }
});

admin.post('/equipment/delete-requests/:id/reject', async (c) => {
  const adminId = c.get('userId') as string;
  const id = c.req.param('id')!;
  try {
    const request = await service.rejectEquipmentDeleteRequest(adminId, id);
    return success(c, request);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'DELETE_REQUEST_NOT_FOUND') {
      return error(c, 'NOT_FOUND', 'Delete request not found', 404);
    }
    throw err;
  }
});

export default admin;
