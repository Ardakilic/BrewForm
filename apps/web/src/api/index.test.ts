import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    getWithMeta: vi.fn(),
    getText: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('./client.ts', () => ({
  api: apiMock,
}));

import { ApiError as ErrorsApiError } from './errors.ts';
import {
  ApiError,
  adminApi,
  authApi,
  badgeApi,
  beanApi,
  brewLogApi,
  coffeeVarietyApi,
  collectionApi,
  commentApi,
  contactApi,
  equipmentApi,
  followApi,
  isAbortError,
  isApiError,
  notificationApi,
  preferencesApi,
  qrcodeApi,
  recipeApi,
  setupApi,
  tasteApi,
  userApi,
} from './index.ts';

describe('api client wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({});
    apiMock.getWithMeta.mockResolvedValue({});
    apiMock.getText.mockResolvedValue('');
    apiMock.post.mockResolvedValue({});
    apiMock.patch.mockResolvedValue({});
    apiMock.put.mockResolvedValue({});
    apiMock.delete.mockResolvedValue({});
    apiMock.upload.mockResolvedValue({});
  });

  describe('authApi', () => {
    it('forwards each auth endpoint to the correct verb', async () => {
      await authApi.register({ email: 'e', username: 'u', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith(
        '/auth/register',
        {
          email: 'e',
          username: 'u',
          password: 'p',
        },
        undefined,
      );

      await authApi.login({ email: 'e', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'e', password: 'p' },
        undefined,
      );

      await authApi.logout();
      expect(apiMock.post).toHaveBeenCalledWith('/auth/logout', {}, undefined);

      await authApi.forgotPassword({ email: 'e' });
      expect(apiMock.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'e' }, undefined);

      await authApi.resetPassword({ token: 't', newPassword: 'n' });
      expect(apiMock.post).toHaveBeenCalledWith(
        '/auth/reset-password',
        {
          token: 't',
          newPassword: 'n',
        },
        undefined,
      );

      await authApi.registrationStatus();
      expect(apiMock.get).toHaveBeenCalledWith('/auth/registration-status', undefined);

      await authApi.sendVerification();
      expect(apiMock.post).toHaveBeenCalledWith('/auth/send-verification', {}, undefined);

      await authApi.verifyEmail('tok');
      expect(apiMock.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'tok' }, undefined);
    });
  });

  describe('userApi', () => {
    it('forwards user endpoints', async () => {
      await userApi.me();
      expect(apiMock.get).toHaveBeenCalledWith('/users/me', undefined);

      await userApi.updateProfile({ displayName: 'd' });
      expect(apiMock.patch).toHaveBeenCalledWith('/users/me', { displayName: 'd' }, undefined);

      await userApi.deleteAccount();
      expect(apiMock.delete).toHaveBeenCalledWith('/users/me', undefined);

      await userApi.getProfile('alice');
      expect(apiMock.get).toHaveBeenCalledWith('/users/alice', undefined);
    });
  });

  describe('recipeApi', () => {
    it('builds the list query string only when params are given', async () => {
      await recipeApi.list();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes', undefined);

      await recipeApi.list({ page: '2', q: 'latte' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes?page=2&q=latte', undefined);

      await recipeApi.starred();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes/starred', undefined);

      await recipeApi.starred({ page: '1' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes/starred?page=1', undefined);
    });

    it('forwards CRUD and social actions', async () => {
      await recipeApi.get('slug-1');
      expect(apiMock.get).toHaveBeenCalledWith('/recipes/slug-1', undefined);

      await recipeApi.create({ title: 't' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/recipes', { title: 't' }, undefined);

      await recipeApi.update('id-1', { title: 't2' } as never);
      expect(apiMock.patch).toHaveBeenCalledWith('/recipes/id-1', { title: 't2' }, undefined);

      await recipeApi.delete('id-1');
      expect(apiMock.delete).toHaveBeenCalledWith('/recipes/id-1', undefined);

      await recipeApi.fork('id-1', 'My Fork');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/recipes/id-1/fork',
        { title: 'My Fork' },
        undefined,
      );

      await recipeApi.like('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/like', {}, undefined);

      await recipeApi.favourite('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/favourite', {}, undefined);

      await recipeApi.feature('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/feature', {}, undefined);

      await recipeApi.rate('id-1', 9);
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/rate', { rating: 9 }, undefined);

      await recipeApi.saveNotes('id-1', 'tasty');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/recipes/id-1/notes',
        { notes: 'tasty' },
        undefined,
      );
    });
  });

  describe('tasteApi / setupApi / beanApi / equipmentApi / coffeeVarietyApi', () => {
    it('forwards taste-note endpoints', async () => {
      await tasteApi.hierarchy();
      expect(apiMock.get).toHaveBeenCalledWith('/taste-notes/hierarchy', undefined);

      await tasteApi.search('citrus & berry');
      expect(apiMock.get).toHaveBeenCalledWith(
        '/taste-notes/search?q=citrus%20%26%20berry',
        undefined,
      );

      await tasteApi.flat();
      expect(apiMock.get).toHaveBeenCalledWith('/taste-notes/flat', undefined);
    });

    it('forwards setup CRUD endpoints', async () => {
      await setupApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/setups', undefined);
      await setupApi.create({ name: 's' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/setups', { name: 's' }, undefined);
      await setupApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/setups/id', undefined);
      await setupApi.update('id', { name: 's2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/setups/id', { name: 's2' }, undefined);
      await setupApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/setups/id', undefined);
    });

    it('forwards bean CRUD endpoints', async () => {
      await beanApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/beans', undefined);
      await beanApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/beans/id', undefined);
      await beanApi.create({ name: 'b' });
      expect(apiMock.post).toHaveBeenCalledWith('/beans', { name: 'b' }, undefined);
      await beanApi.update('id', { name: 'b2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/beans/id', { name: 'b2' }, undefined);
      await beanApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/beans/id', undefined);
    });

    it('forwards equipment CRUD endpoints', async () => {
      await equipmentApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/equipment', undefined);
      await equipmentApi.create({ name: 'e' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/equipment', { name: 'e' }, undefined);
      await equipmentApi.update('id', { name: 'e2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/equipment/id', { name: 'e2' }, undefined);
      await equipmentApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/equipment/id', undefined);
    });

    it('encodes the coffee-variety search query', async () => {
      await coffeeVarietyApi.search('geisha');
      expect(apiMock.get).toHaveBeenCalledWith('/coffee-varieties/search?q=geisha', undefined);
    });
  });

  describe('adminApi', () => {
    it('forwards admin user-management endpoints', async () => {
      await adminApi.getUsers();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/admin/users', undefined);

      await adminApi.getUsers({ page: '1' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/admin/users?page=1', undefined);

      await adminApi.getUserDetail('id');
      expect(apiMock.get).toHaveBeenCalledWith('/admin/users/id', undefined);

      await adminApi.createUser({ email: 'e', username: 'u', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith(
        '/admin/users',
        {
          email: 'e',
          username: 'u',
          password: 'p',
        },
        undefined,
      );

      await adminApi.updateUser('id', { isAdmin: true });
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/users/id', { isAdmin: true }, undefined);

      await adminApi.banUser('id', 'spam');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/admin/users/id/ban',
        {
          userId: 'id',
          banned: true,
          reason: 'spam',
        },
        undefined,
      );

      await adminApi.unbanUser('id');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/admin/users/id/ban',
        {
          userId: 'id',
          banned: false,
        },
        undefined,
      );

      await adminApi.toggleAdmin('id', true);
      expect(apiMock.patch).toHaveBeenCalledWith(
        '/admin/users/id/admin',
        { isAdmin: true },
        undefined,
      );

      await adminApi.deleteUser('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/admin/users/id', undefined);
    });
  });

  describe('followApi / commentApi', () => {
    it('forwards follow endpoints', async () => {
      await followApi.follow('u');
      expect(apiMock.post).toHaveBeenCalledWith('/follow/u', {}, undefined);
      await followApi.unfollow('u');
      expect(apiMock.delete).toHaveBeenCalledWith('/follow/u', undefined);
      await followApi.followers('u');
      expect(apiMock.get).toHaveBeenCalledWith('/follow/u/followers', undefined);
      await followApi.following('u');
      expect(apiMock.get).toHaveBeenCalledWith('/follow/u/following', undefined);
    });

    it('forwards comment endpoints', async () => {
      await commentApi.list('r', 2);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/comments/recipe/r?page=2', undefined);
      await commentApi.create('r', { content: 'hi' });
      expect(apiMock.post).toHaveBeenCalledWith('/comments/recipe/r', { content: 'hi' }, undefined);
      await commentApi.delete('c');
      expect(apiMock.delete).toHaveBeenCalledWith('/comments/c', undefined);
    });
  });

  describe('notificationApi', () => {
    it('builds the list query and unwraps the envelope', async () => {
      await notificationApi.list(3);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/notifications?page=3', undefined);

      await notificationApi.list(1, true);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith(
        '/notifications?page=1&unreadOnly=true',
        undefined,
      );
    });

    it('forwards unread count, mark-read, and mark-all-read', async () => {
      await notificationApi.unreadCount();
      expect(apiMock.get).toHaveBeenCalledWith('/notifications/unread-count', undefined);

      await notificationApi.markRead('n1');
      expect(apiMock.patch).toHaveBeenCalledWith('/notifications/n1/read', {}, undefined);

      await notificationApi.markAllRead();
      expect(apiMock.patch).toHaveBeenCalledWith('/notifications/read-all', {}, undefined);
    });

    it('rethrows after logging when an endpoint rejects', async () => {
      apiMock.get.mockRejectedValue(new Error('down'));
      await expect(notificationApi.unreadCount()).rejects.toThrow('down');

      apiMock.getWithMeta.mockRejectedValue(new Error('down'));
      await expect(notificationApi.list(1)).rejects.toThrow('down');

      apiMock.patch.mockRejectedValue(new Error('down'));
      await expect(notificationApi.markRead('n1')).rejects.toThrow('down');
      await expect(notificationApi.markAllRead()).rejects.toThrow('down');
    });
  });

  describe('collectionApi', () => {
    it('forwards collection CRUD and membership endpoints', async () => {
      await collectionApi.list();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections', undefined);

      await collectionApi.list({ page: '2' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections?page=2', undefined);

      await collectionApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/collections/id', undefined);

      await collectionApi.create({ name: 'c' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/collections', { name: 'c' }, undefined);

      await collectionApi.update('id', { name: 'c2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/collections/id', { name: 'c2' }, undefined);

      await collectionApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/collections/id', undefined);

      await collectionApi.addRecipe('id', 'r');
      expect(apiMock.post).toHaveBeenCalledWith(
        '/collections/id/recipes',
        { recipeId: 'r' },
        undefined,
      );

      await collectionApi.removeRecipe('id', 'r');
      expect(apiMock.delete).toHaveBeenCalledWith('/collections/id/recipes/r', undefined);

      await collectionApi.reorder('id', ['a', 'b']);
      expect(apiMock.patch).toHaveBeenCalledWith(
        '/collections/id/reorder',
        {
          itemIds: ['a', 'b'],
        },
        undefined,
      );
    });

    it('forwards the user-, public-, and recipe-scoped lists', async () => {
      await collectionApi.listByUser('u');
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/users/u/collections', undefined);

      await collectionApi.listByUser('u', { page: '1' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/users/u/collections?page=1', undefined);

      await collectionApi.listPublic();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections/public', undefined);

      await collectionApi.listPublic({ q: 'x' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections/public?q=x', undefined);

      await collectionApi.listByRecipe('slug');
      expect(apiMock.get).toHaveBeenCalledWith('/recipes/slug/collections', undefined);
    });
  });

  describe('request options', () => {
    it('re-exports the error helpers from api/errors.ts', () => {
      expect(ApiError).toBe(ErrorsApiError);
      expect(isApiError(new ErrorsApiError('X', 'x'))).toBe(true);
      expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    });

    it('forwards a caller signal through every verb', async () => {
      const opts = { signal: new AbortController().signal };

      await recipeApi.get('slug', opts);
      expect(apiMock.get).toHaveBeenLastCalledWith('/recipes/slug', opts);

      await recipeApi.list({ page: '2' }, opts);
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/recipes?page=2', opts);

      await adminApi.banUser('u1', 'spam', opts);
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/admin/users/u1/ban',
        { userId: 'u1', banned: true, reason: 'spam' },
        opts,
      );

      await adminApi.updateUser('u1', { displayName: 'D' }, opts);
      expect(apiMock.patch).toHaveBeenLastCalledWith('/admin/users/u1', { displayName: 'D' }, opts);

      await adminApi.deleteUser('u1', opts);
      expect(apiMock.delete).toHaveBeenLastCalledWith('/admin/users/u1', opts);

      await notificationApi.list(2, true, opts);
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith(
        '/notifications?page=2&unreadOnly=true',
        opts,
      );

      await brewLogApi.list({ page: 3 }, opts);
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/brew-logs?page=3', opts);

      await commentApi.list('r1', 2, opts);
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/comments/recipe/r1?page=2', opts);
    });

    it('qrcodeApi.recipeSvg reads the SVG text through api.getText with the signal', async () => {
      const opts = { signal: new AbortController().signal };
      apiMock.getText.mockResolvedValue('<svg/>');

      await expect(qrcodeApi.recipeSvg('cold-brew', opts)).resolves.toBe('<svg/>');
      expect(apiMock.getText).toHaveBeenLastCalledWith('/qrcode/recipe/cold-brew.svg', opts);
    });

    it('does not log an error when a notification request is aborted', async () => {
      apiMock.get.mockRejectedValue(new DOMException('aborted', 'AbortError'));
      await expect(notificationApi.unreadCount()).rejects.toMatchObject({ name: 'AbortError' });
    });
  });

  describe('typed reads for migrated pages', () => {
    it('forwards the admin reads', async () => {
      await adminApi.getStats();
      expect(apiMock.get).toHaveBeenLastCalledWith('/admin/stats', undefined);

      await adminApi.getUsers({ page: '2', q: 'ali' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/admin/users?page=2&q=ali', undefined);

      await adminApi.getRecipes({ perPage: '50' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/admin/recipes?perPage=50', undefined);

      await adminApi.getEquipment();
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/admin/equipment', undefined);

      await adminApi.getVendors();
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith('/admin/vendors', undefined);

      await adminApi.getCompatibility();
      expect(apiMock.get).toHaveBeenLastCalledWith('/admin/compatibility', undefined);

      await adminApi.getAuditLog({ page: '1', entityType: 'recipe' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith(
        '/admin/audit-log?page=1&entityType=recipe',
        undefined,
      );

      await adminApi.getCoffeeVarieties({ category: 'variety' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith(
        '/admin/coffee-varieties?category=variety',
        undefined,
      );
    });

    it('forwards the admin mutations', async () => {
      await adminApi.setRecipeVisibility('r1', 'draft');
      expect(apiMock.patch).toHaveBeenLastCalledWith(
        '/admin/recipes/r1/visibility',
        { visibility: 'draft' },
        undefined,
      );

      await adminApi.deleteRecipe('r1');
      expect(apiMock.delete).toHaveBeenLastCalledWith('/admin/recipes/r1', undefined);

      await adminApi.createEquipment({ name: 'K', type: 'kettle' } as never);
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/admin/equipment',
        { name: 'K', type: 'kettle' },
        undefined,
      );

      await adminApi.updateVendor('v1', { name: 'Onyx' });
      expect(apiMock.patch).toHaveBeenLastCalledWith(
        '/admin/vendors/v1',
        { name: 'Onyx' },
        undefined,
      );

      await adminApi.createTasteNote({ name: 'Berry' });
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/admin/taste-notes',
        { name: 'Berry' },
        undefined,
      );

      await adminApi.setCompatibility('c1', false);
      expect(apiMock.patch).toHaveBeenLastCalledWith(
        '/admin/compatibility/c1',
        { isCompatible: false },
        undefined,
      );

      await adminApi.deleteCoffeeVariety('cv1');
      expect(apiMock.delete).toHaveBeenLastCalledWith('/admin/coffee-varieties/cv1', undefined);

      await adminApi.flushCache();
      expect(apiMock.post).toHaveBeenLastCalledWith('/admin/cache/flush', {}, undefined);
    });

    it('forwards preferences, contact, badges, catalogues and recipe versions', async () => {
      await preferencesApi.get();
      expect(apiMock.get).toHaveBeenLastCalledWith('/preferences', undefined);

      await preferencesApi.update({ onboardingCompleted: true });
      expect(apiMock.patch).toHaveBeenLastCalledWith(
        '/preferences',
        { onboardingCompleted: true },
        undefined,
      );

      const message = { name: 'n', email: 'e@x.test', subject: 's', message: 'm' };
      await contactApi.send(message);
      expect(apiMock.post).toHaveBeenLastCalledWith('/contact', message, undefined);

      await badgeApi.list();
      expect(apiMock.get).toHaveBeenLastCalledWith('/badges', undefined);

      await equipmentApi.catalog({ page: '2', perPage: '12', type: 'grinder' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith(
        '/equipment?page=2&perPage=12&type=grinder',
        undefined,
      );

      await equipmentApi.get('e1');
      expect(apiMock.get).toHaveBeenLastCalledWith('/equipment/e1', undefined);

      await equipmentApi.recipes('e1', { perPage: '6' });
      expect(apiMock.get).toHaveBeenLastCalledWith('/equipment/e1/recipes?perPage=6', undefined);

      await coffeeVarietyApi.list({ category: 'variety' });
      expect(apiMock.getWithMeta).toHaveBeenLastCalledWith(
        '/coffee-varieties?category=variety',
        undefined,
      );

      await coffeeVarietyApi.get('cv1');
      expect(apiMock.get).toHaveBeenLastCalledWith('/coffee-varieties/cv1', undefined);

      await coffeeVarietyApi.recipes('cv1', { perPage: '6' });
      expect(apiMock.get).toHaveBeenLastCalledWith(
        '/coffee-varieties/cv1/recipes?perPage=6',
        undefined,
      );

      await recipeApi.versions('slug');
      expect(apiMock.get).toHaveBeenLastCalledWith('/recipes/slug/versions', undefined);
    });
  });
});
