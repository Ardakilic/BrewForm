/**
 * @module
 * Workspace-integrity test: asserts the pnpm workspace wiring is coherent —
 * `pnpm-workspace.yaml` declares the member globs and shared `catalog:` pins,
 * the root `package.json` pins the package manager and runtimes, `.nvmrc`
 * tracks Node 26, and no Deno-era files remain. It additionally asserts
 * dependency currency: the adopted react-router (major 8) and zod-openapi
 * (major 6) floors are reflected in their member manifests.
 * The runtime and package-manager pins must agree across every surface that
 * carries one (node-runtime, pnpm-workspace and dependency-management specs):
 * catalogued dependencies are referenced as `"catalog:"` by every member,
 * `engines.node`/`devEngines.runtime.version` share the `.nvmrc` major, both
 * Dockerfiles build from an exact `node:<major>.<minor>.<patch>-trixie-slim`
 * tag, every `actions/setup-node` step reads `.nvmrc`, and `packageManager`,
 * `devEngines.packageManager.version`, the Dockerfiles' global pnpm install and
 * every `pnpm/action-setup` `version:` name the same pnpm version.
 * Pure parsing helpers are unit-tested below with inline fixtures.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
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

/** The two Dockerfiles at the workspace root that build the API and web images. */
const DOCKERFILES = ['Dockerfile', 'Dockerfile.web'];
/** Workflow directory, relative to the workspace root. */
const WORKFLOW_DIR = '.github/workflows';
/** Dependency groups of a member manifest that may name a catalogued package. */
const DEPENDENCY_GROUPS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/**
 * Parses the top-level `catalog:` block of `pnpm-workspace.yaml` (text-based, no YAML parser):
 * every indented `name: version` line after `catalog:` up to the next top-level key. Quoted
 * names (`'@scope/pkg': 1.0.0`) are unquoted; comment and blank lines are skipped.
 * @param workspaceYaml The raw text of `pnpm-workspace.yaml`.
 * @returns A map of catalogued package name → pinned version (empty when there is no catalog).
 */
function parseCatalog(workspaceYaml: string): Map<string, string> {
  const catalog = new Map<string, string>();
  let inCatalog = false;
  for (const line of workspaceYaml.split('\n')) {
    if (/^\S/.test(line) && !line.startsWith('#')) {
      inCatalog = /^catalog:\s*$/.test(line);
      continue;
    }
    if (!inCatalog) continue;
    const entry = /^\s+(['"]?)([^'"\s:#][^'":#]*)\1:\s*(\S+)/.exec(line);
    if (entry) catalog.set(entry[2].trim(), entry[3]);
  }
  return catalog;
}

/**
 * Lists every catalogued dependency that a member declares with its own range instead of
 * `"catalog:"` (pnpm-workspace "Catalog drift is caught").
 * @param catalog Catalogued package names (from {@link parseCatalog}).
 * @param manifests Parsed member `package.json` objects keyed by member path (e.g. `apps/web`).
 * @returns One `<member>: <dep> is "<range>"` entry per violation (empty when consistent).
 */
function catalogDrift(
  catalog: ReadonlyMap<string, string>,
  manifests: Record<string, Record<string, unknown>>,
): string[] {
  const drift: string[] = [];
  for (const [member, pkg] of Object.entries(manifests)) {
    for (const group of DEPENDENCY_GROUPS) {
      for (const [name, spec] of Object.entries((pkg[group] ?? {}) as Record<string, string>)) {
        if (catalog.has(name) && spec !== 'catalog:') {
          drift.push(`${member}: ${name} is "${spec}" in ${group}, expected "catalog:"`);
        }
      }
    }
  }
  return drift;
}

/**
 * Returns the image references of every `FROM node:…` line of a Dockerfile (stage aliases and
 * `--platform` flags stripped), e.g. `node:26.13.0-trixie-slim`.
 * @param dockerfile The raw Dockerfile text.
 * @returns The `node:<tag>` references in file order.
 */
function nodeBaseImages(dockerfile: string): string[] {
  return [...dockerfile.matchAll(/^FROM\s+(?:--platform=\S+\s+)?(node:\S+)/gm)].map((m) => m[1]);
}

/**
 * Builds the pattern of an exact Node base image tag for one major version:
 * `node:<major>.<minor>.<patch>-trixie-slim` (never a floating `node:<major>` or `node:lts`).
 * @param major The Node major version the tag must carry (from `.nvmrc`).
 * @returns An anchored regular expression for the exact tag.
 */
function exactNodeTagPattern(major: number): RegExp {
  return new RegExp(`^node:${major}\\.\\d+\\.\\d+-trixie-slim$`);
}

/**
 * Returns the pnpm versions a Dockerfile installs globally (`npm install -g … pnpm@<version>`).
 * @param dockerfile The raw Dockerfile text.
 * @returns Every pinned pnpm version found on a global npm install line.
 */
function dockerPnpmVersions(dockerfile: string): string[] {
  const versions: string[] = [];
  for (const line of dockerfile.split('\n')) {
    if (!/npm install\s.*-g\b/.test(line)) continue;
    for (const m of line.matchAll(/\bpnpm@(\S+)/g)) versions.push(m[1]);
  }
  return versions;
}

/**
 * Splits a GitHub Actions workflow into the list items that use one action (text-based): a
 * block starts at a `- ` list-item line and runs until the next non-blank line indented at or
 * left of that dash. A block is a step of the action when its own keys (the dash line and the
 * lines indented exactly two columns past the dash) include `uses: <action>@`.
 * @param workflow The raw workflow YAML text.
 * @param action The action without its ref, e.g. `actions/setup-node`.
 * @returns The text of every step that uses the action, in file order.
 */
function actionSteps(workflow: string, action: string): string[] {
  const lines = workflow.split('\n');
  const uses = new RegExp(`^\\s*(?:- )?uses:\\s*['"]?${action.replace(/[/.]/g, '\\$&')}@`);
  const steps: string[] = [];
  lines.forEach((line, start) => {
    const item = /^(\s*)- /.exec(line);
    if (!item) return;
    const indent = item[1].length;
    let end = start + 1;
    while (end < lines.length && (lines[end].trim() === '' || lines[end].search(/\S/) > indent)) {
      end++;
    }
    const body = lines.slice(start + 1, end);
    const ownKeys = [line, ...body.filter((l) => l.search(/\S/) === indent + 2)];
    if (ownKeys.some((l) => uses.test(l))) steps.push([line, ...body].join('\n'));
  });
  return steps;
}

/**
 * Reads the `version:` input of a `pnpm/action-setup` step.
 * @param step The step text (from {@link actionSteps}).
 * @returns The version string, or `undefined` when the step omits it (the action then reads
 *   `packageManager` from the root `package.json`).
 */
function stepVersionInput(step: string): string | undefined {
  return /^\s+version:\s*['"]?([^'"\s#]+)/m.exec(step)?.[1];
}

/**
 * Reports whether an `actions/setup-node` step derives Node from `.nvmrc` and declares no
 * literal `node-version:` input (node-runtime "CI derives the Node version from .nvmrc").
 * @param step The step text (from {@link actionSteps}).
 * @returns True when the step reads `node-version-file: '.nvmrc'` and nothing else pins Node.
 */
function readsNvmrc(step: string): boolean {
  return (
    /^\s+node-version-file:\s*(['"]?)\.nvmrc\1\s*(#.*)?$/m.test(step) &&
    !/^\s+node-version:/m.test(step)
  );
}

/**
 * Lists the workflow files (`*.yml`, `*.yaml`) under `.github/workflows/`.
 * @returns Workflow paths relative to the workspace root, sorted.
 */
async function workflowFiles(): Promise<string[]> {
  const entries = await readdir(new URL(`${WORKFLOW_DIR}/`, ROOT));
  return entries
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => `${WORKFLOW_DIR}/${name}`);
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

  it('every member references catalogued dependencies as "catalog:"', async () => {
    const catalog = parseCatalog(await readText('pnpm-workspace.yaml'));
    expect(catalog.size, 'pnpm-workspace.yaml must define a catalog').toBeGreaterThan(0);
    const manifests: Record<string, Record<string, unknown>> = {};
    for (const m of MEMBERS) manifests[m] = await readJson(`${m}/package.json`);
    const drift = catalogDrift(catalog, manifests);
    expect(drift, drift.join('\n')).toEqual([]);
  });

  it('root package.json pins the package manager exactly and declares runtimes', async () => {
    const pkg = await readJson('package.json');
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    const devEngines = pkg.devEngines as Record<string, Record<string, string>>;
    expect(devEngines?.runtime?.version, 'devEngines.runtime must pin Node 26.13+').toMatch(
      /^\^?26/,
    );
    expect(devEngines?.packageManager?.name).toBe('pnpm');
  });

  it('.nvmrc pins Node 26', async () => {
    expect((await readText('.nvmrc')).trim()).toBe('26');
  });

  it('no Deno-era files remain', async () => {
    for (const path of REMOVED_DENO_FILES) {
      expect(await exists(path), `${path} must have been deleted`).toBe(false);
    }
  });
});

describe('runtime and package-manager pins agree', () => {
  it('engines.node and devEngines.runtime.version share the .nvmrc major', async () => {
    const nvmrcMajor = majorOf((await readText('.nvmrc')).trim());
    const pkg = await readJson('package.json');
    const engines = pkg.engines as Record<string, string>;
    const devEngines = pkg.devEngines as Record<string, Record<string, string>>;
    expect(majorOf(engines.node), `package.json engines.node "${engines.node}"`).toBe(nvmrcMajor);
    const runtime = devEngines.runtime.version;
    expect(majorOf(runtime), `package.json devEngines.runtime.version "${runtime}"`).toBe(
      nvmrcMajor,
    );
  });

  it('both Dockerfiles build from an exact node:<major>.<minor>.<patch>-trixie-slim tag', async () => {
    const pattern = exactNodeTagPattern(majorOf((await readText('.nvmrc')).trim()));
    for (const file of DOCKERFILES) {
      const images = nodeBaseImages(await readText(file));
      expect(images.length, `${file} must build from a node base image`).toBeGreaterThan(0);
      for (const image of images) {
        expect(image, `${file}: FROM ${image} must be an exact trixie-slim tag`).toMatch(pattern);
      }
    }
  });

  it('every actions/setup-node step reads node-version-file: .nvmrc', async () => {
    let found = 0;
    for (const file of await workflowFiles()) {
      for (const step of actionSteps(await readText(file), 'actions/setup-node')) {
        found++;
        expect(readsNvmrc(step), `${file}: setup-node step must read '.nvmrc'\n${step}`).toBe(true);
      }
    }
    expect(found, 'no actions/setup-node step found under .github/workflows').toBeGreaterThan(0);
  });

  it('packageManager, devEngines, the Dockerfiles and pnpm/action-setup name one pnpm', async () => {
    const pkg = await readJson('package.json');
    const pnpmVersion = String(pkg.packageManager).replace(/^pnpm@/, '');
    const devEngines = pkg.devEngines as Record<string, Record<string, string>>;
    expect(devEngines.packageManager.version, 'package.json devEngines.packageManager').toBe(
      pnpmVersion,
    );
    for (const file of DOCKERFILES) {
      const dockerfile = await readText(file);
      const versions = dockerPnpmVersions(dockerfile);
      expect(versions.length, `${file} must install pnpm with npm install -g`).toBeGreaterThan(0);
      for (const version of versions) {
        expect(version, `${file}: npm install -g pnpm@${version}`).toBe(pnpmVersion);
      }
      expect(dockerfile, `${file} must not rely on corepack (dropped in Node 25+)`).not.toMatch(
        /^RUN .*corepack/m,
      );
    }
    for (const file of await workflowFiles()) {
      for (const step of actionSteps(await readText(file), 'pnpm/action-setup')) {
        const version = stepVersionInput(step);
        if (version !== undefined) {
          expect(version, `${file}: pnpm/action-setup version: ${version}`).toBe(pnpmVersion);
        }
      }
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

describe('pin parsing helpers (inline fixtures)', () => {
  it('parseCatalog reads only the top-level catalog block', () => {
    const catalog = parseCatalog(
      [
        'packages:',
        "  - 'apps/*'",
        '# comment',
        'catalog:',
        '  zod: 4.6.7',
        "  '@scope/pkg': 1.2.3",
        '  # pinned below',
        '',
        'allowBuilds:',
        '  esbuild: true',
      ].join('\n'),
    );
    expect([...catalog]).toEqual([
      ['zod', '4.6.7'],
      ['@scope/pkg', '1.2.3'],
    ]);
    expect(parseCatalog('packages:\n  - apps/*\n').size).toBe(0);
  });

  it('catalogDrift names the member and the dependency', () => {
    const catalog = new Map([
      ['vitest', '5.1.0'],
      ['zod', '4.6.7'],
    ]);
    expect(
      catalogDrift(catalog, {
        'apps/web': { devDependencies: { vitest: '^5.1.0', react: '^19.0.0' } },
        'apps/api': { dependencies: { zod: 'catalog:' }, devDependencies: { vitest: 'catalog:' } },
      }),
    ).toEqual(['apps/web: vitest is "^5.1.0" in devDependencies, expected "catalog:"']);
  });

  it('nodeBaseImages and exactNodeTagPattern accept only exact trixie-slim tags', () => {
    const images = nodeBaseImages(
      [
        'FROM node:26.13.0-trixie-slim AS deps',
        'FROM deps AS builder',
        'FROM --platform=linux/amd64 node:26 AS runner',
        'FROM caddy:2.11.9-alpine',
      ].join('\n'),
    );
    expect(images).toEqual(['node:26.13.0-trixie-slim', 'node:26']);
    const pattern = exactNodeTagPattern(26);
    expect('node:26.13.0-trixie-slim').toMatch(pattern);
    for (const bad of [
      'node:26',
      'node:lts',
      'node:26.13-trixie-slim',
      'node:27.0.0-trixie-slim',
    ]) {
      expect(bad).not.toMatch(pattern);
    }
  });

  it('dockerPnpmVersions reads global npm installs only', () => {
    expect(
      dockerPnpmVersions(
        [
          'RUN npm install -g --allow-scripts=pnpm pnpm@12.18.0',
          'RUN pnpm fetch # pnpm@1.0.0 is not an install',
        ].join('\n'),
      ),
    ).toEqual(['12.18.0']);
  });

  it('actionSteps, readsNvmrc and stepVersionInput parse workflow steps', () => {
    const workflow = [
      'jobs:',
      '  a:',
      '    steps:',
      '      - uses: pnpm/action-setup@abc # v6',
      '        with:',
      '          version: 12.18.0',
      '      - name: Node',
      '        uses: actions/setup-node@v7',
      '        with:',
      "          node-version-file: '.nvmrc'",
      '      - uses: actions/setup-node@v7',
      '        with:',
      '          node-version: 26',
      '      - name: Run',
      '        run: |',
      '          echo "uses: actions/setup-node@v7"',
      '  b:',
      '    steps:',
      '      - uses: pnpm/action-setup@abc',
    ].join('\n');
    const nodeSteps = actionSteps(workflow, 'actions/setup-node');
    expect(nodeSteps).toHaveLength(2);
    expect(nodeSteps.map(readsNvmrc)).toEqual([true, false]);
    const pnpmSteps = actionSteps(workflow, 'pnpm/action-setup');
    expect(pnpmSteps.map(stepVersionInput)).toEqual(['12.18.0', undefined]);
  });
});
