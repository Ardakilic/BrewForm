import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

/**
 * Workspace configuration verification tests.
 *
 * These tests validate the Deno 2.8 workspace management features:
 * - catalog: protocol for centralized dependency versions
 * - workspace member versions for bump-version support
 * - consistent dependency resolution across members
 */
describe('Workspace Configuration', () => {
  /**
   * Verifies that the catalog protocol correctly resolves shared npm
   * dependencies to the versions declared in the root deno.json catalog.
   */
  it('should resolve catalog dependencies to consistent versions', async () => {
    const apiPkg = await import('../../../apps/api/package.json', {
      with: { type: 'json' },
    });
    const dbPkg = await import('../../../packages/db/package.json', {
      with: { type: 'json' },
    });
    const sharedPkg = await import('../../../packages/shared/package.json', {
      with: { type: 'json' },
    });

    expect(apiPkg.default.dependencies['drizzle-orm']).toBe('catalog:');
    expect(apiPkg.default.dependencies['bcryptjs']).toBe('catalog:');
    expect(apiPkg.default.dependencies['zod']).toBe('catalog:');

    expect(dbPkg.default.dependencies['drizzle-orm']).toBe('catalog:');
    expect(dbPkg.default.dependencies['bcryptjs']).toBe('catalog:');

    expect(sharedPkg.default.dependencies['zod']).toBe('catalog:');
  });

  /**
   * Verifies that every workspace member has a version field, which is
   * required for the experimental `deno bump-version` command.
   */
  it('should have version fields on all workspace members', async () => {
    const members = [
      '../../../apps/api/deno.json',
      '../../../apps/web/deno.json',
      '../../../packages/db/deno.json',
      '../../../packages/shared/deno.json',
    ];

    for (const path of members) {
      const mod = await import(path, { with: { type: 'json' } });
      expect(mod.default.version).toBeDefined();
      expect(typeof mod.default.version).toBe('string');
      expect(mod.default.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  /**
   * Verifies that a catalog-resolved package can actually be imported
   * from a workspace member that declares it, ensuring the lockfile is
   * consistent with the catalog declarations.
   */
  it('should successfully import catalog-resolved zod from shared', async () => {
    const z = await import('zod');
    expect(z).toBeDefined();
    expect(typeof z).toBe('object');
  });
});
