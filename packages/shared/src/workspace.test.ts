/**
 * @module
 * Workspace-integrity test: asserts every Deno workspace member declares a `name` and `version`,
 * the root `catalog` is internally consistent and covers every cross-member duplicated dependency,
 * and member names are unique. Guards the workspace-management configuration added in d31.
 * It additionally asserts dependency currency (d33): the adopted react-router (major 8) and
 * zod-openapi (major 6) floors are reflected in their member manifests, and no member caret
 * (`^`) floor lags the resolved `deno.lock` versions by a major.
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
 * Parses the workspace `deno.lock` (lockfile format 5) into a map of npm package name →
 * highest resolved version. The lock's `specifiers` object keys npm requests as
 * `'npm:<name>@<range>'` with values `'<version>[_<peer-deps>]'`
 * (e.g. `'npm:react-router@^8.0.1': '8.0.1_react@19.2.7...'`); the name is read from the
 * key (text between `npm:` and the final `@`, preserving an `@scope/pkg` prefix) and the
 * version from the value (text before the first `_`). When a package is locked under
 * multiple ranges the highest version is kept. Malformed or non-npm entries are skipped
 * so the parser stays tolerant of lockfile variation.
 * @returns A map of npm package name → highest lock-resolved semver string.
 */
async function lockResolvedVersions(): Promise<Map<string, string>> {
  const lock = JSON.parse(await Deno.readTextFile(new URL('deno.lock', ROOT)));
  const specifiers = (lock?.specifiers ?? {}) as Record<string, string>;
  const resolved = new Map<string, string>();
  for (const [key, value] of Object.entries(specifiers)) {
    if (!key.startsWith('npm:')) continue;
    const at = key.lastIndexOf('@');
    if (at <= 'npm:'.length) continue;
    const name = key.slice('npm:'.length, at);
    const version = String(value).split('_')[0];
    if (!name || !/^\d+(\.\d+)*$/.test(version)) continue;
    const current = resolved.get(name);
    if (current === undefined || compareVersions(version, current) > 0) {
      resolved.set(name, version);
    }
  }
  return resolved;
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

describe('dependency currency', () => {
  it('reflects the adopted react-router and zod-openapi majors', async () => {
    const web = await readJson('apps/web/package.json');
    const rr = (web.dependencies as Record<string, string>)['react-router'];
    expect(majorOf(rr), `apps/web react-router floor "${rr}" must be major 8`).toBe(8);

    const shared = await readJson('packages/shared/package.json');
    const zo = (shared.dependencies as Record<string, string>)['zod-openapi'];
    expect(majorOf(zo), `packages/shared zod-openapi floor "${zo}" must be major 6`).toBe(6);
  });

  it('no member caret (^) floor lags the lockfile by a major', async () => {
    const resolved = await lockResolvedVersions();
    for (const m of MEMBERS) {
      let pkg: Record<string, unknown>;
      try {
        pkg = await readJson(`${m}/package.json`);
      } catch {
        continue;
      }
      for (const group of ['dependencies', 'devDependencies'] as const) {
        const deps = (pkg[group] ?? {}) as Record<string, string>;
        for (const [name, spec] of Object.entries(deps)) {
          // Only plain caret ranges are lock-comparable; this skips `catalog:` and
          // inline `jsr:`/`npm:` specifiers, while `resolved.get` skips any name
          // absent from the lock (e.g. catalog-managed packages).
          if (!spec.startsWith('^')) continue;
          const lockVersion = resolved.get(name);
          if (lockVersion === undefined) continue;
          const floorMajor = majorOf(spec);
          const lockMajor = majorOf(lockVersion);
          const msg = `${m} "${name}": floor ${spec} lags lock-resolved ${lockVersion} by a major`;
          expect(floorMajor, msg).toBe(lockMajor);
        }
      }
    }
  });
});
