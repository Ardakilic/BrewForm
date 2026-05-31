import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  PaginationSchema,
  SearchQuerySchema,
  VendorCreateSchema,
  VendorUpdateSchema,
} from '@brewform/shared/schemas';
import { adminMiddleware, authMiddleware } from '../../middleware/auth.ts';
import * as service from './service.ts';
import { error, paginated, success } from '../../utils/response/index.ts';
import type { AppEnv } from '../../types/hono.ts';

const vendor = new Hono<AppEnv>();

vendor.get('/', zValidator('query', PaginationSchema), async (c) => {
  const { page, perPage } = c.req.valid('query');
  const result = await service.listVendors(page, perPage);
  return paginated(c, result.vendors, {
    page,
    perPage,
    total: result.total,
    totalPages: Math.ceil(result.total / perPage),
  });
});

vendor.get('/search', zValidator('query', SearchQuerySchema), async (c) => {
  const { q } = c.req.valid('query');
  const results = await service.searchVendors(q);
  return success(c, results);
});

vendor.post('/', authMiddleware, zValidator('json', VendorCreateSchema), async (c) => {
  const userId = c.get('userId') as string;
  const body = c.req.valid('json');
  const v = await service.createVendor(userId, body);
  return success(c, v, 201);
});

vendor.get('/:id', async (c) => {
  const id = c.req.param('id')!;
  try {
    const v = await service.getVendor(id);
    return success(c, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    throw err;
  }
});

vendor.patch('/:id', authMiddleware, zValidator('json', VendorUpdateSchema), async (c) => {
  const id = c.req.param('id')!;
  const userId = c.get('userId') as string;
  const user = c.get('user') as { isAdmin: boolean } | null;
  const isAdmin = user?.isAdmin ?? false;
  const body = c.req.valid('json');
  try {
    const v = await service.updateVendor(userId, id, body, isAdmin);
    return success(c, v);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    if (message === 'FORBIDDEN') return error(c, 'FORBIDDEN', 'Not your vendor', 403);
    throw err;
  }
});

vendor.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = c.req.param('id')!;
  try {
    await service.deleteVendor(id);
    return success(c, { message: 'Vendor deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'VENDOR_NOT_FOUND') return error(c, 'NOT_FOUND', 'Vendor not found', 404);
    throw err;
  }
});

export default vendor;
