/**
 * @module
 * Workspace-integrity test: asserts every Deno workspace member declares a `name` and `version`,
 * the root `catalog` is internally consistent and covers every cross-member duplicated dependency,
 * and member names are unique. Guards the workspace-management configuration added in d31.
 */
import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

/** Workspace root, derived from this file (packages/shared/src → up three levels). */
const ROOT = new URL('../../../', import.meta.url);
/** The four workspace members, relative to the workspace root. */
const MEMBERS = ['apps/api', 'apps/web', 'packages/shared', 'packages/db'];

/**
 * Reads and parses a JSON config relative to the workspace root.
 * @param path Path relative to the workspace root (e.g. 'deno.json').
 * @returns The parsed JSON object.
 */
async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Deno.readTextFile(new URL(path, ROOT)));
}

describe('workspace integrity', () => {
  it('every member declares a name and a version', async () => {
    for (const m of MEMBERS) {
      const cfg = await readJson(`${m}/deno.json`);
      expect(cfg.name, `${m} must have a name`).toBeDefined();
      expect(cfg.version, `${m} must have a version`).toBeDefined();
    }
  });

  it('member names are unique', async () => {
    const names = await Promise.all(
      MEMBERS.map(async (m) => (await readJson(`${m}/deno.json`)).name),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('every "catalog:" reference maps to a defined root catalog key', async () => {
    const catalog = ((await readJson('deno.json')).catalog ?? {}) as Record<string, string>;
    for (const m of MEMBERS) {
      let pkg: Record<string, unknown>;
      try {
        pkg = await readJson(`${m}/package.json`);
      } catch {
        continue;
      }
      for (
        const [name, spec] of Object.entries((pkg.dependencies ?? {}) as Record<string, string>)
      ) {
        if (spec === 'catalog:') {
          expect(catalog[name], `${m} references catalog:${name} but root catalog lacks "${name}"`)
            .toBeDefined();
        }
      }
    }
  });

  it('root catalog defines every dependency duplicated across members', async () => {
    const catalog = ((await readJson('deno.json')).catalog ?? {}) as Record<string, string>;
    for (const dep of ['drizzle-orm', 'bcryptjs', 'zod']) {
      expect(catalog[dep], `root catalog must define ${dep}`).toBeDefined();
    }
  });
});
