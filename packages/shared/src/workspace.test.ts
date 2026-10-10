/**
 * @module
 * Workspace-integrity test: asserts the pnpm workspace wiring is coherent —
 * `pnpm-workspace.yaml` declares the member globs and shared `catalog:` pins,
 * the root `package.json` pins the package manager and runtimes, `.nvmrc`
 * tracks Node 24, and no Deno-era files remain. It additionally asserts
 * dependency currency: the adopted react-router (major 8) and zod-openapi
 * (major 6) floors are reflected in their member manifests.
 * Pure semver helpers are unit-tested below with inline fixtures.
 */
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/** Workspace root, derived from this file (packages/shared/src → up three levels). */
const ROOT = new URL('../../../', import.meta.url);
/** The four workspace members, relative to the workspace root. */
const MEMBERS = ['apps/api', 'apps/web', 'packages/shared', 'packages/db'];
/** Deno-era files that must not exist anymore (§2.2b). */
const REMOVED_DENO_FILES = [
  'deno.json',
  'deno.lock',
  '.deno-version',
  'apps/api/deno.json',
  'apps/web/deno.json',
  'packages/db/deno.json',
  'packages/shared/deno.json',
];

/**
 * Reads a text file relative to the workspace root.
 * @param path Path relative to the workspace root (e.g. 'pnpm-workspace.yaml').
 * @returns The raw file text.
 */
async function readText(path: string): Promise<string> {
  return await readFile(new URL(path, ROOT), 'utf8');
}

/**
 * Reads and parses a JSON file relative to the workspace root.
 * @param path Path relative to the workspace root (e.g. 'package.json').
 * @returns The parsed JSON object.
 */
async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readText(path)) as Record<string, unknown>;
}

/**
 * Reports whether a path relative to the workspace root exists.
 * @param path Path relative to the workspace root.
 * @returns True when the path exists, false otherwise.
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(new URL(path, ROOT));
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts the integer major version from a semver range or plain version string by
 * stripping any leading range operator (`^`, `~`, `>=`, `>`, `<=`, `<`, `=`, `v`) and
 * parsing the leading number (e.g. `'^8.0.1'` → 8, `'0.31.10'` → 0).
 * @param range A caret/tilde range or plain version string.
 * @returns The integer major version (NaN if no leading number can be parsed).
 */
function majorOf(range: string): number {
  return parseInt(String(range).replace(/^[\^~>=<v\s]+/, ''), 10);
}

/**
 * Compares two dotted numeric version strings (e.g. `'8.0.1'` vs `'8.1.0'`) segment by
 * segment, treating missing trailing segments as 0. Used to retain the highest
 * lock-resolved version when one package is locked under several ranges.
 * @param a First version string.
 * @param b Second version string.
 * @returns A positive number if `a > b`, negative if `a < b`, 0 if they are equal.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Resolves an npm specifier map (e.g. parsed from a lockfile's `packages` or
 * `specifiers` section) into package name → highest resolved version. Keys are
 * `'<name>@<range>'` (an `@scope/pkg` prefix is preserved by splitting on the
 * final `@`); the version is the text before the first `_` (peer-deps suffix).
 * When a package is locked under multiple ranges the highest version is kept.
 * Malformed entries are skipped so the parser stays tolerant of variation.
 * @param specifiers Specifier → resolved-version entries (inline fixture data).
 * @returns A map of npm package name → highest resolved semver string.
 */
function lockResolvedVersions(specifiers: Record<string, string>): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const [key, value] of Object.entries(specifiers)) {
    const at = key.lastIndexOf('@');
    if (at <= 0) continue;
    const name = key.slice(0, at);
    const version = String(value).split('_')[0];
    if (!name || !/^\d+(\.\d+)*$/.test(version)) continue;
    const current = resolved.get(name);
    if (current === undefined || compareVersions(version, current) > 0) {
      resolved.set(name, version);
    }
  }
  return resolved;
}

describe('pnpm workspace wiring', () => {
  it('pnpm-workspace.yaml declares the member globs', async () => {
    const workspace = await readText('pnpm-workspace.yaml');
    expect(workspace).toContain('apps/*');
    expect(workspace).toContain('packages/*');
  });

  it('pnpm-workspace.yaml defines shared catalog pins', async () => {
    const workspace = await readText('pnpm-workspace.yaml');
    expect(workspace).toContain('catalog:');
    for (const dep of ['drizzle-orm', 'bcryptjs', 'zod', 'vitest', 'typescript']) {
      expect(workspace, `shared catalog must pin ${dep}`).toContain(dep);
    }
  });

  it('every workspace member exists with a package.json', async () => {
    for (const m of MEMBERS) {
      expect(await exists(`${m}/package.json`), `${m} must have a package.json`).toBe(true);
    }
  });

  it('member names are unique', async () => {
    const names = await Promise.all(
      MEMBERS.map(async (m) => (await readJson(`${m}/package.json`)).name),
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('every "catalog:" reference maps to a defined root catalog key', async () => {
    const workspace = await readText('pnpm-workspace.yaml');
    const catalogSection = workspace.slice(workspace.indexOf('catalog:'));
    for (const m of MEMBERS) {
      const pkg = await readJson(`${m}/package.json`);
      for (const group of ['dependencies', 'devDependencies'] as const) {
        for (const [name, spec] of Object.entries((pkg[group] ?? {}) as Record<string, string>)) {
          if (spec === 'catalog:') {
            expect(
              catalogSection,
              `${m} references catalog:${name} but root catalog lacks it`,
            ).toContain(name);
          }
        }
      }
    }
  });

  it('root package.json pins the package manager exactly and declares runtimes', async () => {
    const pkg = await readJson('package.json');
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    const devEngines = pkg.devEngines as Record<string, Record<string, string>>;
    expect(devEngines?.runtime?.version, 'devEngines.runtime must pin Node 24').toMatch(/^24/);
    expect(devEngines?.packageManager?.name).toBe('pnpm');
  });

  it('.nvmrc pins Node 24', async () => {
    expect((await readText('.nvmrc')).trim()).toBe('24');
  });

  it('no Deno-era files remain', async () => {
    for (const path of REMOVED_DENO_FILES) {
      expect(await exists(path), `${path} must have been deleted`).toBe(false);
    }
  });
});

describe('dependency currency', () => {
  it('reflects the adopted react-router and zod-openapi majors', async () => {
    const web = await readJson('apps/web/package.json');
    const rr = (web.dependencies as Record<string, string>)['react-router'];
    expect(majorOf(rr), `apps/web react-router floor "${rr}" must be major 8`).toBe(8);

    const shared = await readJson('packages/shared/package.json');
    const zo = (shared.dependencies as Record<string, string>)['zod-openapi'];
    expect(majorOf(zo), `packages/shared zod-openapi floor "${zo}" must be major 6`).toBe(6);
  });
});

describe('semver helpers (inline fixtures)', () => {
  it('majorOf strips range operators', () => {
    expect(majorOf('^8.0.1')).toBe(8);
    expect(majorOf('~0.31.10')).toBe(0);
    expect(majorOf('>=24.1.0')).toBe(24);
    expect(majorOf('2.9.3')).toBe(2);
  });

  it('compareVersions orders dotted versions', () => {
    expect(compareVersions('8.1.0', '8.0.1')).toBeGreaterThan(0);
    expect(compareVersions('8.0.1', '8.1.0')).toBeLessThan(0);
    expect(compareVersions('8.0', '8.0.0')).toBe(0);
  });

  it('lockResolvedVersions keeps the highest version per package', () => {
    const resolved = lockResolvedVersions({
      'react-router@^8.0.1': '8.0.1_react@19.2.7',
      'react-router@^8.1.0': '8.1.5',
      '@scope/pkg@^1.0.0': '1.2.3',
      'not-a-specifier': 'bogus',
    });
    expect(resolved.get('react-router')).toBe('8.1.5');
    expect(resolved.get('@scope/pkg')).toBe('1.2.3');
    expect(resolved.has('not-a-specifier')).toBe(false);
  });
});
