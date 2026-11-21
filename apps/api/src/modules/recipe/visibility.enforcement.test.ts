/**
 * Static enforcement test for capability `recipe-visibility`, "An enforcement test keeps every
 * recipe listing on the shared condition". No database: it reads the source files and fails at
 * the exact `file:line` / unit when a recipe query bypasses the shared visibility helpers
 * (`listableRecipeCondition` / `viewableRecipeCondition` in `recipe/model.ts`).
 *
 * Scope: every non-test `src/modules/<module>/model.ts` (except the exempt admin module) and
 * every non-test `src/routes/*.ts`.
 *
 * - Rule A, no inline comparisons: a code line matching
 *   `(eq|ne|inArray|notInArray)(recipes.visibility` is allowed only inside the two helpers, or
 *   on a line ending in a `// visibility-exempt: <reason>` comment.
 * - Rule B, listings use a helper: each file is split into top-level units at every column-0
 *   `function` / `async function` / `export function` / `export async function` /
 *   `export const` declaration. A unit whose code contains `.query.recipes.findMany(`,
 *   `.from(recipes)`, `.innerJoin(recipes` or `.leftJoin(recipes` must reference a helper,
 *   unless it is a key of {@link EXEMPT_UNITS}.
 * - Rule C, required references: {@link REQUIRED_UNITS} must exist and reference a helper.
 * - Stale exemptions: every {@link EXEMPT_UNITS} key must name an existing unit that still
 *   matches a Rule B pattern and does not reference a helper, so the map stays minimal.
 *
 * Comment lines (starting with `*`, `/*` or `//`) are ignored by every rule, so docblocks, which
 * sit above their declaration and therefore inside the previous unit, never count.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** `apps/api/src`, resolved from this file's directory. */
const SRC_DIR = join(import.meta.dirname, '..', '..');

/** Modules whose model files are out of scope (admin surfaces are exempt from the rule). */
const EXCLUDED_MODULES = new Set(['admin']);

/** The two shared helpers: the only units allowed to compare `recipes.visibility` inline. */
const HELPER_UNITS = new Set([
  'recipe/model.ts#listableRecipeCondition',
  'recipe/model.ts#viewableRecipeCondition',
]);

/**
 * Units that touch the `recipe` table without a helper, each with the reason it is safe.
 * Keys are `<module>/model.ts#<unit>` or `routes/<file>.ts#<unit>`.
 */
const EXEMPT_UNITS: Record<string, string> = {
  // Point lookups whose callers apply canViewRecipe.
  'comment/model.ts#getRecipeAuthorId': 'point lookup; the comment service applies canViewRecipe',
  'comment/model.ts#getRecipeForNotification':
    'point lookup; the comment service applies canViewRecipe',
  'comment/model.ts#getRecipeForAccessCheck':
    'point lookup; the comment service applies canViewRecipe',
  'qrcode/model.ts#findBySlug':
    'point lookup; the QR service applies canViewRecipe for an anonymous viewer',
  'recipe-note/model.ts#findRecipeForNotes':
    'point lookup; the notes service applies canViewRecipe',
  'recipe/model.ts#updateRecipeWithVersion':
    "point lookup; the author's write locks its own recipe row",
  // Executors and fragments: they run or build part of a WHERE composed by a helper-using unit.
  'recipe/model.ts#buildListPageQuery': 'executor',
  'recipe/model.ts#buildListCountQuery': 'executor',
  'recipe/model.ts#findCursor': 'executor',
  'recipe/model.ts#buildRecipeFilters':
    'filter fragment: a recipe-id sub-select that callers AND with a helper condition',
  // The state lookup that must see deleted rows.
  'collection/model.ts#getRecipeVisibilityStates':
    'state lookup that must see deleted rows; the collection service applies canListRecipe',
  // Viewer-only records and aggregates.
  'brew-log/model.ts#list': "viewer-only record: the caller's own brew journal",
  'brew-log/model.ts#findById': "viewer-only record: one of the caller's own brew logs",
  'brew-log/model.ts#getRecipeBrewStats': 'aggregate describing only the requested recipe',
  'brew-log/model.ts#getUserBrewStats': "aggregate of the caller's own brew logs",
  // Counts without recipe identifiers.
  'badge/model.ts#evaluateBadges': "counts over the user's own recipes, no recipe identifiers",
};

/** Units that must reference a helper (Rule C). */
const REQUIRED_UNITS = [
  'recipe/model.ts#buildListRecipesWhere',
  'recipe/model.ts#getFeed',
  'recipe/model.ts#findStarred',
];

/** A column-0 unit declaration; group 1 or 2 is the unit name. */
const UNIT_START =
  /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^export\s+const\s+([A-Za-z_$][\w$]*)/;

/** Rule A: an inline comparison on `recipes.visibility`. */
const INLINE_VISIBILITY = /\b(?:eq|ne|inArray|notInArray)\(\s*recipes\.visibility\b/;

/** Rule A exemption marker at the end of a line. */
const EXEMPT_MARKER = /\/\/ visibility-exempt: \S.*$/;

/** Rule B: a query that reads the `recipe` table. */
const RECIPE_QUERY_PATTERNS = [
  /\.query\.recipes\.findMany\(/,
  /\.from\(\s*recipes\s*\)/,
  /\.innerJoin\(\s*recipes\b/,
  /\.leftJoin\(\s*recipes\b/,
];

/** A reference to one of the shared helpers. */
const HELPER_REFERENCE = /\b(?:listableRecipeCondition|viewableRecipeCondition)\(/;

/** One source file to scan, with its display path (`recipe/model.ts`, `routes/sitemap.ts`). */
interface SourceFile {
  path: string;
  source: string;
}

/** A code line of a unit (comment lines are dropped). */
interface CodeLine {
  no: number;
  text: string;
}

/** A top-level unit of a file. */
interface Unit {
  /** `<path>#<name>`; the code before the first declaration is `<path>#<module scope>`. */
  key: string;
  /** One-based line of the declaration. */
  line: number;
  /** The unit's non-comment lines. */
  code: CodeLine[];
}

/** True for a full-line comment (`*`, `/*`, `/**`, `//`). */
function isCommentLine(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//');
}

/**
 * Split a file into its top-level units (see the file docblock).
 *
 * @param file - The file to split.
 * @returns The units in source order, starting with the module-scope preamble.
 */
function splitUnits(file: SourceFile): Unit[] {
  const units: Unit[] = [{ key: `${file.path}#<module scope>`, line: 1, code: [] }];
  file.source.split('\n').forEach((text, index) => {
    const no = index + 1;
    const start = UNIT_START.exec(text);
    if (start) units.push({ key: `${file.path}#${start[1] ?? start[2]}`, line: no, code: [] });
    if (!isCommentLine(text)) units[units.length - 1].code.push({ no, text });
  });
  return units;
}

/** True when a unit's code reads the `recipe` table (a Rule B pattern). */
function touchesRecipes(unit: Unit): boolean {
  return unit.code.some(({ text }) => RECIPE_QUERY_PATTERNS.some((p) => p.test(text)));
}

/** True when a unit's code references a shared helper. */
function referencesHelper(unit: Unit): boolean {
  return unit.code.some(({ text }) => HELPER_REFERENCE.test(text));
}

/**
 * Run Rules A, B and C and the stale-exemption check over a set of files.
 *
 * @param files - The files to scan.
 * @param exemptUnits - The Rule B exemption map.
 * @param requiredUnits - The Rule C unit keys.
 * @returns One message per violation, each naming the file, the line and the unit.
 */
function scan(
  files: SourceFile[],
  exemptUnits: Record<string, string>,
  requiredUnits: string[],
): string[] {
  const violations: string[] = [];
  const units = new Map<string, Unit>();

  for (const file of files) {
    for (const unit of splitUnits(file)) {
      units.set(unit.key, unit);
      if (!HELPER_UNITS.has(unit.key)) {
        for (const { no, text } of unit.code) {
          if (INLINE_VISIBILITY.test(text) && !EXEMPT_MARKER.test(text.trimEnd())) {
            violations.push(
              `Rule A: ${file.path}:${no} (${unit.key}) compares recipes.visibility inline; use listableRecipeCondition/viewableRecipeCondition or end the line with "// visibility-exempt: <reason>"`,
            );
          }
        }
      }
      if (touchesRecipes(unit) && !referencesHelper(unit) && !(unit.key in exemptUnits)) {
        violations.push(
          `Rule B: ${unit.key} (${file.path}:${unit.line}) queries recipes without listableRecipeCondition/viewableRecipeCondition`,
        );
      }
    }
  }

  for (const key of requiredUnits) {
    const unit = units.get(key);
    if (!unit) violations.push(`Rule C: ${key} does not exist`);
    else if (!referencesHelper(unit)) {
      violations.push(`Rule C: ${key} (line ${unit.line}) must reference a shared helper`);
    }
  }

  for (const key of Object.keys(exemptUnits)) {
    const unit = units.get(key);
    if (!unit) violations.push(`Stale exemption: ${key} names no unit`);
    else if (!touchesRecipes(unit)) {
      violations.push(`Stale exemption: ${key} (line ${unit.line}) no longer queries recipes`);
    } else if (referencesHelper(unit)) {
      violations.push(`Stale exemption: ${key} (line ${unit.line}) already uses a helper`);
    }
  }

  return violations;
}

/** Read every in-scope file: non-test module `model.ts` files (admin excluded) and routes. */
function readScopedFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  const modulesDir = join(SRC_DIR, 'modules');
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EXCLUDED_MODULES.has(entry.name)) continue;
    const modelPath = join(modulesDir, entry.name, 'model.ts');
    if (existsSync(modelPath)) {
      files.push({ path: `${entry.name}/model.ts`, source: readFileSync(modelPath, 'utf8') });
    }
  }
  const routesDir = join(SRC_DIR, 'routes');
  for (const name of readdirSync(routesDir)) {
    if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
    files.push({ path: `routes/${name}`, source: readFileSync(join(routesDir, name), 'utf8') });
  }
  return files;
}

describe('recipe visibility enforcement (recipe-visibility)', () => {
  const files = readScopedFiles();

  it('scans the recipe model, the other model files and the routes', () => {
    const paths = files.map((f) => f.path);
    for (const expected of [
      'recipe/model.ts',
      'equipment/model.ts',
      'coffee-variety/model.ts',
      'user/model.ts',
      'collection/model.ts',
      'brew-log/model.ts',
      'routes/sitemap.ts',
    ]) {
      expect(paths).toContain(expected);
    }
    expect(paths).not.toContain('admin/model.ts');
  });

  it('finds no inline comparison, unguarded listing, missing required reference or stale exemption', () => {
    expect(scan(files, EXEMPT_UNITS, REQUIRED_UNITS)).toEqual([]);
  });

  it('gives every exemption a reason', () => {
    for (const [key, reason] of Object.entries(EXEMPT_UNITS)) {
      expect(reason.trim(), key).not.toBe('');
    }
  });
});

describe('recipe visibility enforcement — scanner self-test', () => {
  const FIXTURE: SourceFile = {
    path: 'fixture/model.ts',
    source: [
      "import { db } from '@brewform/db';",
      '',
      "/** Lists public recipes: `eq(recipes.visibility, 'public')` in a comment never counts. */",
      'export async function listPublic() {',
      "  return db.query.recipes.findMany({ where: eq(recipes.visibility, 'public') });",
      '}',
      '',
      'async function list(where) {',
      '  return db.select().from(recipes).where(listableRecipeCondition(null));',
      '}',
      '',
      'export function adminList(visibility) {',
      '  return db.select().from(recipes).where(eq(recipes.visibility, visibility)); // visibility-exempt: admin',
      '}',
      '',
      'export const deps = {',
      '  lookup: () => db.select().from(recipes),',
      '};',
    ].join('\n'),
  };

  it('splits a non-exported async function into its own unit', () => {
    expect(splitUnits(FIXTURE).map((u) => u.key)).toEqual([
      'fixture/model.ts#<module scope>',
      'fixture/model.ts#listPublic',
      'fixture/model.ts#list',
      'fixture/model.ts#adminList',
      'fixture/model.ts#deps',
    ]);
  });

  it('reports a hand-written public list under Rule A (file:line) and Rule B (unit)', () => {
    const violations = scan(
      [FIXTURE],
      { 'fixture/model.ts#adminList': 'admin', 'fixture/model.ts#deps': 'executor' },
      [],
    );
    expect(violations).toHaveLength(2);
    expect(violations[0]).toMatch(
      /^Rule A: fixture\/model\.ts:5 \(fixture\/model\.ts#listPublic\)/,
    );
    expect(violations[1]).toMatch(
      /^Rule B: fixture\/model\.ts#listPublic \(fixture\/model\.ts:4\)/,
    );
  });

  it('reports an unexempted unguarded unit and a missing required reference', () => {
    const violations = scan([FIXTURE], {}, ['fixture/model.ts#adminList', 'fixture/model.ts#gone']);
    expect(violations).toContain(
      'Rule B: fixture/model.ts#deps (fixture/model.ts:16) queries recipes without listableRecipeCondition/viewableRecipeCondition',
    );
    expect(violations).toContain(
      'Rule C: fixture/model.ts#adminList (line 12) must reference a shared helper',
    );
    expect(violations).toContain('Rule C: fixture/model.ts#gone does not exist');
  });

  it('reports stale exemptions', () => {
    const violations = scan(
      [FIXTURE],
      {
        'fixture/model.ts#adminList': 'admin',
        'fixture/model.ts#deps': 'executor',
        'fixture/model.ts#list': 'uses the helper already',
        'fixture/model.ts#missing': 'no such unit',
        'fixture/model.ts#<module scope>': 'no recipe query',
      },
      [],
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        'Stale exemption: fixture/model.ts#list (line 8) already uses a helper',
        'Stale exemption: fixture/model.ts#missing names no unit',
        'Stale exemption: fixture/model.ts#<module scope> (line 1) no longer queries recipes',
      ]),
    );
  });
});
