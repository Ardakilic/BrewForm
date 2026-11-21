/**
 * Recipe data-access layer.
 *
 * Pure Drizzle ORM operations — no business logic, no authorization, no side effects.
 * Called exclusively by `recipe/service.ts`.
 *
 * Soft-delete convention: all queries filter `isNull(recipes.deletedAt)`.
 */

import { db } from '@brewform/db';
import {
  beans,
  brewMethodEquipmentRules,
  coffeeVarieties,
  equipment,
  recipeAdditionalPreparations,
  recipeEquipment,
  recipes,
  recipeTasteNotes,
  recipeVersionPhotos,
  recipeVersions,
  setups,
  tasteNotes,
  userRecipeFavourites,
  userRecipeLikes,
  userRecipeRatings,
  users,
  vendors,
} from '@brewform/db/schema';
import type {
  AdditionalPreparationCategory,
  BrewMethod,
  DrinkType,
  Visibility,
} from '@brewform/shared/types';
import { encodeCursor } from '@brewform/shared/utils';
import {
  and,
  asc,
  avg,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  max,
  not,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { union } from 'drizzle-orm/pg-core';
import { toLoggableError } from '../../utils/errors.ts';
import { createLogger } from '../../utils/logger/index.ts';
import { normalizeSearchTerm, toContainsPattern } from '../../utils/search.ts';

const modelLog = createLogger('recipe-model');

/**
 * Shared SQL condition for recipes a viewer may see in a LIST (capability
 * `recipe-visibility`, "One shared listing condition and predicate pair decides
 * visibility"): non-deleted recipes that are `public`, plus the viewer's own
 * recipes of any visibility. The SQL twin of `canListRecipe` in `service.ts`
 * (a DB-backed parity test keeps them in agreement).
 *
 * Discovery surfaces pass `null`: they are viewer-independent, so authors do not
 * see their own `unlisted`, `draft` or `private` recipes there and any cached
 * result stays safe to share. Collection item counts pass the owner's id for the
 * owner's own list. Other models import this instead of comparing
 * `recipes.visibility` inline.
 *
 * @param viewerId - The viewer's user id, or `null` for an anonymous/discovery audience.
 * @returns A Drizzle condition that always includes `isNull(recipes.deletedAt)`.
 */
export function listableRecipeCondition(viewerId: string | null): SQL {
  const visibility =
    viewerId === null
      ? eq(recipes.visibility, 'public')
      : or(eq(recipes.visibility, 'public'), eq(recipes.authorId, viewerId));
  // `and()` is typed `SQL | undefined` but is never undefined with defined arguments.
  return and(isNull(recipes.deletedAt), visibility) as SQL;
}

/**
 * Shared SQL condition for recipes a viewer may OPEN (capability
 * `recipe-visibility`): non-deleted recipes that are `public` or `unlisted`,
 * plus the viewer's own `draft`/`private` recipes. The SQL twin of
 * `canViewRecipe` (without the admin bypass) for viewer-only records such as
 * the caller's Starred list.
 *
 * Discovery surfaces pass `null` (and should use {@link listableRecipeCondition}
 * instead, because `unlisted` recipes are never listed).
 *
 * @param viewerId - The viewer's user id, or `null` when anonymous.
 * @returns A Drizzle condition that always includes `isNull(recipes.deletedAt)`.
 */
export function viewableRecipeCondition(viewerId: string | null): SQL {
  const openable = inArray(recipes.visibility, ['public', 'unlisted']);
  const visibility = viewerId === null ? openable : or(openable, eq(recipes.authorId, viewerId));
  // `and()` is typed `SQL | undefined` but is never undefined with defined arguments.
  return and(isNull(recipes.deletedAt), visibility) as SQL;
}

/**
 * Mask fork sources that are not listable (capability `recipe-visibility`, "Fork attribution
 * never reveals a recipe the viewer could not list"). An `unlisted` recipe's id works as its
 * link, so a list row must not carry the id of a source an anonymous viewer could not list.
 *
 * Viewer-independent, like every discovery list: collects the distinct non-null
 * `forkedFromId`s and returns `rows` unchanged (no query) when there are none; otherwise runs
 * ONE primary-key query for the sources that {@link listableRecipeCondition}`(null)` selects
 * (non-deleted `public`) and sets `forkedFromId` to `null` on every row whose source is
 * missing from that result (`unlisted`, `private`, `draft`, soft-deleted or gone). Every other
 * field, the row order and the stored column are unchanged.
 *
 * Applied to the rows of {@link findListPage}, {@link findCursor} and the equipment and
 * coffee-variety recipe lists.
 *
 * @param rows - List rows carrying a nullable `forkedFromId`.
 * @returns The rows, with unlistable fork sources replaced by `null` (new objects only for masked rows).
 */
export async function maskUnlistableForkSources<T extends { forkedFromId: string | null }>(
  rows: T[],
): Promise<T[]> {
  const ids = [
    ...new Set(
      rows.map((row) => row.forkedFromId).filter((id): id is string => typeof id === 'string'),
    ),
  ];
  if (ids.length === 0) return rows;

  const listable = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(inArray(recipes.id, ids), listableRecipeCondition(null)));
  const listableIds = new Set(listable.map((row) => row.id));

  let maskedCount = 0;
  const masked = rows.map((row) => {
    const sourceId = row.forkedFromId;
    if (typeof sourceId !== 'string' || listableIds.has(sourceId)) return row;
    maskedCount++;
    return { ...row, forkedFromId: null };
  });
  modelLog.debug({ rowCount: rows.length, maskedCount }, 'maskUnlistableForkSources completed');
  return masked;
}

/** Return a Drizzle condition that matches recipes whose versions reference the given coffee variety. */
export function recipeCoffeeVarietyCondition(coffeeVarietyId: string) {
  return inArray(
    recipes.id,
    db
      .select({ id: recipeVersions.recipeId })
      .from(recipeVersions)
      .where(eq(recipeVersions.coffeeVarietyId, coffeeVarietyId)),
  );
}

/**
 * Filter criteria shared between recipe-listing endpoints.
 *
 * Passed to {@link buildRecipeFilters} to produce the shared Drizzle
 * `WHERE` fragments for the public `/api/v1/recipes` endpoint and the
 * `/api/v1/recipes/starred` endpoint. Visibility, favourites-scope, and
 * `authorId` conditions are caller-specific and are not part of this
 * surface.
 */
export interface RecipeFilterCriteria {
  brewMethod?: BrewMethod;
  drinkType?: DrinkType;
  search?: string;
  equipmentId?: string;
  tasteNoteIds?: string;
  /** @deprecated Use `tasteNoteIds` (comma-separated). Kept for backward compatibility. */
  tasteNoteId?: string;
  mainBrewer?: string;
  coffeeVarietyId?: string;
  /** NEW F11: author username/displayName substring filter. */
  author?: string;
  /** NEW F11: recipes created on or after this UTC day (`YYYY-MM-DD`, inclusive). */
  dateFrom?: string;
  /** NEW F11: recipes created on or before this UTC day (`YYYY-MM-DD`, inclusive). */
  dateTo?: string;
  /** NEW F11: minimum average rating (1-10). */
  minRating?: number;
  /** NEW F11: maximum average rating (1-10). */
  maxRating?: number;
}

/**
 * Build an array of Drizzle SQL conditions from shared recipe filter criteria.
 * Returns a `SQL[]` array; the caller combines these with its own base conditions via `and()`.
 *
 * Free-text values (`search`, `mainBrewer`, `author`) go through
 * {@link normalizeSearchTerm} and {@link toContainsPattern}: a value that is empty after
 * trimming adds no condition, and `%`, `_` and `\` match literally. `search` becomes a
 * single `inArray(recipes.id, union(titleIds, versionRecipeIds))` condition.
 * `dateFrom`/`dateTo` are inclusive UTC days: `gte(createdAt, <dateFrom 00:00:00.000Z>)` and
 * `lt(createdAt, <the day after dateTo 00:00:00.000Z>)`.
 *
 * @param filters - The shared filter criteria (see {@link RecipeFilterCriteria}).
 * @returns The filter conditions only (no visibility or other caller base conditions).
 */
export function buildRecipeFilters(filters: RecipeFilterCriteria): SQL[] {
  const conditions: SQL[] = [];

  if (filters.brewMethod) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.brewMethod, filters.brewMethod)),
      ),
    );
  }

  if (filters.drinkType) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(eq(recipeVersions.drinkType, filters.drinkType)),
      ),
    );
  }

  // Wave 6: search is ONE condition on recipes.id — the union of recipe ids whose title
  // matches and recipe ids with any version whose productName or personalNotes matches
  // (F11 added personalNotes, weight 1). Each branch can bitmap-scan its own trigram index,
  // and the union de-duplicates recipes that match through several versions.
  const searchTerm = normalizeSearchTerm(filters.search);
  if (searchTerm) {
    const pattern = toContainsPattern(searchTerm);
    const titleIds = db
      .select({ id: recipes.id })
      .from(recipes)
      .where(ilike(recipes.title, pattern));
    const versionRecipeIds = db
      .select({ id: recipeVersions.recipeId })
      .from(recipeVersions)
      .where(
        or(
          ilike(recipeVersions.productName, pattern),
          ilike(recipeVersions.personalNotes, pattern),
        ),
      );
    const searchCondition = inArray(recipes.id, union(titleIds, versionRecipeIds));
    if (searchCondition) conditions.push(searchCondition);
  }

  // Literal (escaped) substring match on any version's brewer details.
  const mainBrewerTerm = normalizeSearchTerm(filters.mainBrewer);
  if (mainBrewerTerm) {
    conditions.push(
      inArray(
        recipes.id,
        db
          .select({ id: recipeVersions.recipeId })
          .from(recipeVersions)
          .where(ilike(recipeVersions.brewerDetails, toContainsPattern(mainBrewerTerm))),
      ),
    );
  }

  // F11: author username/displayName substring filter (literal, escaped pattern)
  const authorTerm = normalizeSearchTerm(filters.author);
  if (authorTerm) {
    const pattern = toContainsPattern(authorTerm);
    conditions.push(
      inArray(
        recipes.authorId,
        db
          .select({ id: users.id })
          .from(users)
          .where(or(ilike(users.username, pattern), ilike(users.displayName, pattern))),
      ),
    );
  }

  // F11: date range filter on recipes.createdAt. Both ends are whole UTC days (user decision 3):
  // from 00:00:00.000Z of dateFrom up to, but excluding, 00:00:00.000Z of the day after dateTo.
  if (filters.dateFrom) {
    conditions.push(gte(recipes.createdAt, new Date(`${filters.dateFrom}T00:00:00.000Z`)));
  }
  if (filters.dateTo) {
    const end = new Date(`${filters.dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    conditions.push(lt(recipes.createdAt, end));
  }

  // F11: rating range filter via avg(userRecipeRatings.rating) subquery
  if (filters.minRating || filters.maxRating) {
    const minCondition = filters.minRating
      ? gte(avg(userRecipeRatings.rating), filters.minRating)
      : undefined;
    const maxCondition = filters.maxRating
      ? lte(avg(userRecipeRatings.rating), filters.maxRating)
      : undefined;
    const havingClause = and(minCondition, maxCondition);
    if (havingClause) {
      conditions.push(
        inArray(
          recipes.id,
          db
            .select({ recipeId: userRecipeRatings.recipeId })
            .from(userRecipeRatings)
            .groupBy(userRecipeRatings.recipeId)
            .having(havingClause),
        ),
      );
    }
  }

  if (filters.coffeeVarietyId) {
    conditions.push(recipeCoffeeVarietyCondition(filters.coffeeVarietyId));
  }

  if (filters.equipmentId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db
          .select({ id: recipeEquipment.recipeVersionId })
          .from(recipeEquipment)
          .where(eq(recipeEquipment.equipmentId, filters.equipmentId)),
      ),
    );
  }

  if (filters.tasteNoteIds) {
    const ids = filters.tasteNoteIds.split(',').map((id) => id.trim());
    for (const noteId of ids) {
      conditions.push(
        inArray(
          recipes.currentVersionId,
          db
            .select({ id: recipeTasteNotes.recipeVersionId })
            .from(recipeTasteNotes)
            .where(eq(recipeTasteNotes.tasteNoteId, noteId)),
        ),
      );
    }
  } else if (filters.tasteNoteId) {
    conditions.push(
      inArray(
        recipes.currentVersionId,
        db
          .select({ id: recipeTasteNotes.recipeVersionId })
          .from(recipeTasteNotes)
          .where(eq(recipeTasteNotes.tasteNoteId, filters.tasteNoteId)),
      ),
    );
  }

  return conditions;
}

/**
 * Filter criteria for the public recipe-listing endpoint.
 *
 * Extends {@link RecipeFilterCriteria} with caller-specific keys
 * (`visibility`, `authorId`) that the list WHERE composer needs but
 * {@link buildRecipeFilters} is intentionally unaware of.
 */
export interface RecipeListFilters extends RecipeFilterCriteria {
  visibility?: Visibility;
  authorId?: string;
}

/**
 * Build the Drizzle `WHERE` clause for the public recipe-listing endpoint.
 *
 * Composes the visibility condition, the shared filter branches from
 * {@link buildRecipeFilters}, and an optional `authorId` scope. `GET /recipes` is a
 * discovery surface (capability `recipe-visibility`), so non-admins, and admins
 * without a `visibility` filter, get {@link listableRecipeCondition}`(null)`: non-deleted
 * `public` recipes only, for every viewer including the author. An admin who passes
 * `visibility` filters on exactly that value (the admin exemption).
 *
 * @param filters - Filter criteria (see {@link RecipeListFilters})
 * @param isAdmin - Whether the requester is an admin (allows a `visibility` filter)
 * @returns A single Drizzle `SQL` expression, or `undefined` when no conditions apply
 */
export function buildListRecipesWhere(
  filters: RecipeListFilters,
  isAdmin: boolean,
): SQL | undefined {
  const { visibility } = filters;
  const visibilityCondition =
    isAdmin && visibility
      ? eq(recipes.visibility, visibility) // visibility-exempt: admin filter (recipe-visibility)
      : listableRecipeCondition(null);
  const filterConditions = buildRecipeFilters(filters);
  const conditions: SQL[] = [visibilityCondition, ...filterConditions];
  if (filters.authorId) conditions.push(eq(recipes.authorId, filters.authorId));
  return conditions.length > 1 ? and(...conditions) : conditions[0];
}

/** Insert a new recipe row and return it with all database-generated fields. */
export async function create(data: typeof recipes.$inferInsert) {
  const [recipe] = await db.insert(recipes).values(data).returning();
  return recipe;
}

/**
 * Fetch a recipe by its UUID primary key, excluding soft-deleted rows.
 *
 * Loads all relations: author, versions (with taste notes, equipment, preparations,
 * photos, bean), photos, and forked-from recipe. The fork source is loaded unfiltered with
 * its `visibility`, `authorId` and `deletedAt`, so the service can decide whether the viewer
 * may see it (`resolveForkAttribution`); never return that relation to a client as is.
 */
export function findById(id: string) {
  return db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), isNull(recipes.deletedAt)),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: desc(recipeVersions.versionNumber),
        with: {
          tasteNotes: { with: { tasteNote: true } },
          equipment: { with: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { with: { photo: true } },
          bean: { columns: { origin: true, roaster: true, roastLevel: true } },
        },
      },
      photos: true,
      forkedFrom: {
        columns: {
          id: true,
          slug: true,
          title: true,
          visibility: true,
          authorId: true,
          deletedAt: true,
        },
      },
    },
  });
}

/**
 * Fetch a recipe by its unique slug, excluding soft-deleted rows.
 *
 * Loads the same relation tree as {@link findById}: author, versions (with taste notes,
 * equipment, preparations, photos, bean), photos, and forked-from recipe (with the source's
 * visibility state, for `resolveForkAttribution`).
 */
export function findBySlug(slug: string) {
  return db.query.recipes.findFirst({
    where: and(eq(recipes.slug, slug), isNull(recipes.deletedAt)),
    with: {
      author: { columns: { id: true, username: true, displayName: true, avatarUrl: true } },
      versions: {
        orderBy: desc(recipeVersions.versionNumber),
        with: {
          tasteNotes: { with: { tasteNote: true } },
          equipment: { with: { equipment: true } },
          additionalPreparations: true,
          versionPhotos: { with: { photo: true } },
          bean: { columns: { origin: true, roaster: true, roastLevel: true } },
        },
      },
      photos: true,
      forkedFrom: {
        columns: {
          id: true,
          slug: true,
          title: true,
          visibility: true,
          authorId: true,
          deletedAt: true,
        },
      },
    },
  });
}

/** A Drizzle database handle that list queries run on: the shared `db`, or a test instance. */
export type ListQueryExecutor = typeof db;

/** Options for {@link buildListPageQuery} and {@link findListPage}. */
export interface ListPageOptions {
  /** The caller's WHERE (visibility, filters, scope); soft-deleted recipes are always excluded. */
  where: SQL | undefined;
  /** One-based page number. */
  page: number;
  /** Rows per page (`RecipeFilterSchema` caps it at 100). */
  perPage: number;
  /** `'createdAt'` (default), `'likeCount'` or `'rating'`; any other value sorts by `createdAt`. */
  sortBy?: string;
  /** `'desc'` (default) or `'asc'`; applies to the sort key and the `id` tie-break. */
  sortOrder?: string;
  /**
   * The search term (raw or already normalized). When it is non-empty after
   * {@link normalizeSearchTerm}, rows are ordered by relevance first. The caller's
   * `where` must carry the matching search filter (from {@link buildRecipeFilters}).
   */
  search?: string;
}

/** The WHERE of every list page and count query: the caller's condition plus `deletedAt IS NULL`. */
function listPageWhere(where: SQL | undefined): SQL {
  // `and()` is typed `SQL | undefined` but is never undefined with defined arguments.
  return where ? (and(isNull(recipes.deletedAt), where) as SQL) : isNull(recipes.deletedAt);
}

/** Columns of one list item: the recipe row plus the `{ id, username, displayName }` author. */
const listItemSelection = {
  ...getTableColumns(recipes),
  author: { id: users.id, username: users.username, displayName: users.displayName },
};

/**
 * Build the bounded page query shared by every offset-paginated recipe listing
 * (`/recipes`, `/recipes/starred`, the offset feed): one core `select` over `recipe`
 * with the author mini-projection (`innerJoin(users)`), ordered, limited and offset
 * in SQL. It never loads `recipe_version` rows into the API process.
 *
 * - **Relevance (only when `search` is non-empty after trimming):** a grouped
 *   subquery scores each matching version as `2 × productName match + 1 ×
 *   personalNotes match` and keeps the BEST single version (`max`, never a sum across
 *   versions); the recipe score is `3 × title match + coalesce(best, 0)`. Every match
 *   uses the same {@link toContainsPattern} `ilike` predicate as the search filter,
 *   over the same version set (any version), so every returned row scores at least 1.
 *   The score is only an ORDER BY key and is not selected.
 * - **Order:** `score desc` (search only), then the sort key in `sortOrder`
 *   (`createdAt`, `likeCount`, or for `rating` the `avg(user_recipe_rating.rating)`
 *   aggregate with `NULLS LAST` in both directions), then `recipes.id` in `sortOrder`
 *   as the unique tie-break, so OFFSET pages never repeat or skip rows.
 * - **Bound:** `LIMIT perPage OFFSET (page - 1) × perPage`, so a request reads at most
 *   `perPage` recipe rows whatever the number of matches.
 *
 * The `CASE` score and `NULLS LAST` fragments are the two `sql` exceptions approved by
 * ADR-017; they interpolate Drizzle columns and bound parameters only.
 *
 * @param opts - Paging, sorting, search and the caller's WHERE (see {@link ListPageOptions}).
 * @param executor - The database handle to build on (defaults to the shared `db`).
 * @returns The un-awaited Drizzle query (call `.toSQL()` to inspect it, or await it for rows).
 */
export function buildListPageQuery(opts: ListPageOptions, executor: ListQueryExecutor = db) {
  const direction = opts.sortOrder === 'asc' ? asc : desc;
  const term = normalizeSearchTerm(opts.search);
  const orderBy: SQL[] = [];

  let query = executor
    .select(listItemSelection)
    .from(recipes)
    .innerJoin(users, eq(recipes.authorId, users.id))
    .$dynamic();

  if (term) {
    const pattern = toContainsPattern(term);
    const versionScore = executor
      .select({
        recipeId: recipeVersions.recipeId,
        // D03 raw-SQL exception: Drizzle 0.45 has no CASE builder; the per-version score
        // (productName 2 + personalNotes 1) interpolates only columns and the bound pattern.
        best: max(
          sql<number>`(case when ${ilike(recipeVersions.productName, pattern)} then 2 else 0 end) + (case when ${ilike(recipeVersions.personalNotes, pattern)} then 1 else 0 end)`,
        ).as('best'),
      })
      .from(recipeVersions)
      .where(
        or(
          ilike(recipeVersions.productName, pattern),
          ilike(recipeVersions.personalNotes, pattern),
        ),
      )
      .groupBy(recipeVersions.recipeId)
      .as('version_score');
    query = query.leftJoin(versionScore, eq(versionScore.recipeId, recipes.id));
    // D03 raw-SQL exception: Drizzle 0.45 has no CASE or COALESCE builder; the recipe score
    // (title 3 + best version) interpolates only columns and the bound pattern.
    const score = sql<number>`(case when ${ilike(recipes.title, pattern)} then 3 else 0 end) + coalesce(${versionScore.best}, 0)`;
    orderBy.push(desc(score));
  }

  if (opts.sortBy === 'rating') {
    const ratingAverage = executor
      .select({
        recipeId: userRecipeRatings.recipeId,
        average: avg(userRecipeRatings.rating).as('average_rating'),
      })
      .from(userRecipeRatings)
      .groupBy(userRecipeRatings.recipeId)
      .as('rating_average');
    query = query.leftJoin(ratingAverage, eq(ratingAverage.recipeId, recipes.id));
    // D03 raw-SQL exception: Drizzle 0.45's asc()/desc() have no NULLS LAST option; unrated
    // recipes (no ratings, NULL average) sort after every rated recipe in both directions.
    orderBy.push(
      opts.sortOrder === 'asc'
        ? sql`${ratingAverage.average} asc nulls last`
        : sql`${ratingAverage.average} desc nulls last`,
    );
  } else {
    orderBy.push(direction(opts.sortBy === 'likeCount' ? recipes.likeCount : recipes.createdAt));
  }
  orderBy.push(direction(recipes.id));

  return query
    .where(listPageWhere(opts.where))
    .orderBy(...orderBy)
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage);
}

/**
 * Build the `COUNT(*)` query paired with {@link buildListPageQuery}: same `recipe`
 * table and the same WHERE (the caller's condition plus `deletedAt IS NULL`), so the
 * total always matches the rows the page query can return.
 *
 * @param where - The caller's WHERE, exactly as passed to the page query.
 * @param executor - The database handle to build on (defaults to the shared `db`).
 * @returns The un-awaited Drizzle query, resolving to `[{ count }]`.
 */
export function buildListCountQuery(where: SQL | undefined, executor: ListQueryExecutor = db) {
  return executor.select({ count: count() }).from(recipes).where(listPageWhere(where));
}

/**
 * Fetch one page of recipes and the total match count: runs {@link buildListPageQuery}
 * and {@link buildListCountQuery} in parallel (exactly two statements). Search requests
 * are relevance-ranked in SQL; nothing is ranked or sorted in the API process.
 *
 * The page rows then pass through {@link maskUnlistableForkSources} (capability
 * `recipe-visibility`), so a fork of a non-public source carries `forkedFromId: null`. That
 * mask adds one primary-key statement on the shared `db`, and only when a returned row has
 * a fork source.
 *
 * @param opts - Paging, sorting, search and the caller's WHERE (see {@link ListPageOptions}).
 * @param executor - The database handle to run on (defaults to the shared `db`).
 * @returns `{ recipes, total }`: at most `perPage` list items (no `versions`, no score) and
 *          the number of recipes matching `where`.
 */
export async function findListPage(opts: ListPageOptions, executor: ListQueryExecutor = db) {
  const term = normalizeSearchTerm(opts.search);
  const logContext = {
    page: opts.page,
    perPage: opts.perPage,
    sortBy: opts.sortBy ?? 'createdAt',
    hasSearch: term !== '',
    searchLength: term.length,
  };
  modelLog.debug(logContext, 'findListPage started');

  const [pageRows, totalResult] = await Promise.all([
    buildListPageQuery(opts, executor),
    buildListCountQuery(opts.where, executor),
  ]);
  const rows = await maskUnlistableForkSources(pageRows);

  modelLog.debug({ ...logContext, resultCount: rows.length }, 'findListPage completed');
  return { recipes: rows, total: totalResult[0].count };
}

/** One list item as returned by {@link findListPage}. */
export type RecipeListPageRow = Awaited<ReturnType<typeof findListPage>>['recipes'][number];

/**
 * Fetch a paginated, sorted list of recipes (no search ranking): delegates to
 * {@link findListPage}. Used by the offset feed and the cursor fallback paths.
 *
 * @param where     - Optional Drizzle SQL WHERE clause for additional filtering
 * @param page      - One-based page number
 * @param perPage   - Number of recipes per page
 * @param sortBy    - `'createdAt'` (default), `'likeCount'` or `'rating'`
 * @param sortOrder - Sort direction: `'desc'` (default) or `'asc'`
 * @returns Paginated result with `recipes` array and `total` count
 */
export function findMany(
  where: SQL | undefined,
  page: number,
  perPage: number,
  sortBy: string = 'createdAt',
  sortOrder: string = 'desc',
) {
  return findListPage({ where, page, perPage, sortBy, sortOrder });
}

/** Patch a recipe row with partial data, identified by UUID. Returns the updated row or null. */
export async function update(id: string, data: Partial<typeof recipes.$inferInsert>) {
  const [result] = await db.update(recipes).set(data).where(eq(recipes.id, id)).returning();
  return result ?? null;
}

/** Soft-delete a recipe by setting its `deletedAt` timestamp. Returns the updated row or null. */
export async function softDelete(id: string) {
  const [result] = await db
    .update(recipes)
    .set({ deletedAt: new Date() })
    .where(and(eq(recipes.id, id), isNull(recipes.deletedAt)))
    .returning();
  return result ?? null;
}

/** A Drizzle transaction handle, as passed to the `db.transaction` callback. */
type RecipeTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `recipe_version` columns that the write paths set themselves (identity and ordering). */
type RecipeVersionKeyColumn = 'id' | 'recipeId' | 'versionNumber' | 'createdAt';

/**
 * Every value a recipe write path sets on a `recipe_version` row: all columns except `id`,
 * `recipeId`, `versionNumber` and `createdAt`, each one required (a nullable column takes
 * `null` for "empty"). Derived from the table, so a new column is a type error in
 * {@link versionColumnsFrom} until the mapping handles it.
 */
export type RecipeVersionColumns = Required<
  Omit<typeof recipeVersions.$inferInsert, RecipeVersionKeyColumn>
>;

/**
 * The single `recipe_version` column mapping shared by create, amend, bump and fork.
 *
 * Copies exactly the {@link RecipeVersionColumns} keys out of `resolved` (extra keys such as
 * relations or `id` are dropped), so every write path sets the same columns and none can
 * silently skip one (`tds` and the coffee variety used to be missing from three paths). The
 * drift guard in `model.test.ts` compares these keys with `getTableColumns(recipeVersions)`.
 *
 * Pure function, no I/O.
 *
 * @param resolved - Pre-resolved values for every version column (the service has already
 *   merged, sanitized and derived them).
 * @returns A fresh object holding only the version columns, ready for `insert`/`update`.
 */
export function versionColumnsFrom(resolved: RecipeVersionColumns): RecipeVersionColumns {
  return {
    productName: resolved.productName,
    coffeeBrand: resolved.coffeeBrand,
    coffeeProcessing: resolved.coffeeProcessing,
    vendorId: resolved.vendorId,
    roastDate: resolved.roastDate,
    packageOpenDate: resolved.packageOpenDate,
    grindDate: resolved.grindDate,
    brewDate: resolved.brewDate,
    brewMethod: resolved.brewMethod,
    drinkType: resolved.drinkType,
    brewerDetails: resolved.brewerDetails,
    grinder: resolved.grinder,
    grindSize: resolved.grindSize,
    groundWeightGrams: resolved.groundWeightGrams,
    extractionTimeSeconds: resolved.extractionTimeSeconds,
    extractionVolumeMl: resolved.extractionVolumeMl,
    temperatureCelsius: resolved.temperatureCelsius,
    tds: resolved.tds,
    brewRatio: resolved.brewRatio,
    flowRate: resolved.flowRate,
    preInfusionTimeSeconds: resolved.preInfusionTimeSeconds,
    beanId: resolved.beanId,
    coffeeVarietyId: resolved.coffeeVarietyId,
    coffeeVarietyName: resolved.coffeeVarietyName,
    personalNotes: resolved.personalNotes,
    preparationNotes: resolved.preparationNotes,
    isFavourite: resolved.isFavourite,
    rating: resolved.rating,
    emojiTag: resolved.emojiTag,
  };
}

/**
 * Copy every version column of a stored version (for a bump or a fork), through the same
 * mapping as {@link versionColumnsFrom}. Callers override what must change (for example the
 * fork resets `rating` and `isFavourite`).
 *
 * Pure function, no I/O.
 *
 * @param source - A stored `recipe_version` row (relation keys are ignored).
 * @returns A fresh object holding only the version columns.
 */
export function copyVersionColumns(source: RecipeVersionColumns): RecipeVersionColumns {
  return versionColumnsFrom(source);
}

/** One additional preparation as written by the recipe write paths (`sortOrder` = array index). */
export interface AdditionalPreparationInput {
  name: string;
  type: AdditionalPreparationCategory;
  inputAmount: string;
  preparationType: string;
}

/** A taste-note link with its resolved intensity (1-3). */
interface TasteNoteLink {
  tasteNoteId: string;
  intensity: number;
}

/**
 * Relation rows to write for one version. An absent key writes nothing for that relation;
 * arrays keep their order (`sortOrder` of preparations and photos is the array index).
 */
interface VersionRelations {
  tasteNotes?: TasteNoteLink[];
  equipmentIds?: string[];
  additionalPreparations?: AdditionalPreparationInput[];
  photoIds?: string[];
}

/**
 * Insert the relation rows of one version inside an open transaction. Empty and absent
 * arrays insert nothing.
 *
 * @param tx - The open write transaction.
 * @param versionId - The version the rows belong to.
 * @param relations - The rows to insert.
 */
async function insertVersionRelations(
  tx: RecipeTx,
  versionId: string,
  relations: VersionRelations,
): Promise<void> {
  if (relations.tasteNotes?.length) {
    await tx.insert(recipeTasteNotes).values(
      relations.tasteNotes.map((link) => ({
        recipeVersionId: versionId,
        tasteNoteId: link.tasteNoteId,
        intensity: link.intensity,
      })),
    );
  }
  if (relations.equipmentIds?.length) {
    await tx
      .insert(recipeEquipment)
      .values(
        relations.equipmentIds.map((equipmentId) => ({ recipeVersionId: versionId, equipmentId })),
      );
  }
  if (relations.additionalPreparations?.length) {
    await tx.insert(recipeAdditionalPreparations).values(
      relations.additionalPreparations.map((p, i) => ({
        recipeVersionId: versionId,
        name: p.name,
        type: p.type,
        inputAmount: p.inputAmount,
        preparationType: p.preparationType,
        sortOrder: i,
      })),
    );
  }
  if (relations.photoIds?.length) {
    await tx.insert(recipeVersionPhotos).values(
      relations.photoIds.map((photoId, i) => ({
        recipeVersionId: versionId,
        photoId,
        sortOrder: i,
      })),
    );
  }
}

/**
 * Replace the provided relations of one version inside an open transaction: for each key
 * present in `relations`, delete the version's rows of that relation and insert the new ones
 * (`[]` leaves none). Absent keys are left untouched.
 *
 * @param tx - The open write transaction.
 * @param versionId - The version whose relations to replace.
 * @param relations - The replacement rows, per relation.
 */
async function replaceVersionRelations(
  tx: RecipeTx,
  versionId: string,
  relations: VersionRelations,
): Promise<void> {
  if (relations.tasteNotes) {
    await tx.delete(recipeTasteNotes).where(eq(recipeTasteNotes.recipeVersionId, versionId));
  }
  if (relations.equipmentIds) {
    await tx.delete(recipeEquipment).where(eq(recipeEquipment.recipeVersionId, versionId));
  }
  if (relations.additionalPreparations) {
    await tx
      .delete(recipeAdditionalPreparations)
      .where(eq(recipeAdditionalPreparations.recipeVersionId, versionId));
  }
  if (relations.photoIds) {
    await tx.delete(recipeVersionPhotos).where(eq(recipeVersionPhotos.recipeVersionId, versionId));
  }
  await insertVersionRelations(tx, versionId, relations);
}

/**
 * Read every relation of one version inside an open transaction, in write order
 * (preparations and photos by `sortOrder`).
 *
 * @param tx - The open write transaction.
 * @param versionId - The version to read.
 * @returns The version's taste notes (with intensities), equipment ids, preparations and photo ids.
 */
async function readVersionRelations(
  tx: RecipeTx,
  versionId: string,
): Promise<Required<VersionRelations>> {
  // Sequential on purpose: one transaction is one connection.
  const tasteNoteRows = await tx
    .select({ tasteNoteId: recipeTasteNotes.tasteNoteId, intensity: recipeTasteNotes.intensity })
    .from(recipeTasteNotes)
    .where(eq(recipeTasteNotes.recipeVersionId, versionId));
  const equipmentRows = await tx
    .select({ equipmentId: recipeEquipment.equipmentId })
    .from(recipeEquipment)
    .where(eq(recipeEquipment.recipeVersionId, versionId));
  const preparationRows = await tx
    .select({
      name: recipeAdditionalPreparations.name,
      type: recipeAdditionalPreparations.type,
      inputAmount: recipeAdditionalPreparations.inputAmount,
      preparationType: recipeAdditionalPreparations.preparationType,
    })
    .from(recipeAdditionalPreparations)
    .where(eq(recipeAdditionalPreparations.recipeVersionId, versionId))
    .orderBy(asc(recipeAdditionalPreparations.sortOrder));
  const photoRows = await tx
    .select({ photoId: recipeVersionPhotos.photoId })
    .from(recipeVersionPhotos)
    .where(eq(recipeVersionPhotos.recipeVersionId, versionId))
    .orderBy(asc(recipeVersionPhotos.sortOrder));
  return {
    tasteNotes: tasteNoteRows,
    equipmentIds: equipmentRows.map((row) => row.equipmentId),
    additionalPreparations: preparationRows,
    photoIds: photoRows.map((row) => row.photoId),
  };
}

/** Columns of a new `recipe` row other than the slug, as written by {@link claimRecipeSlug}. */
type RecipeRowWithoutSlug = Omit<typeof recipes.$inferInsert, 'slug'>;

/**
 * Claim the first free slug candidate by inserting the recipe row with
 * `INSERT … ON CONFLICT ("slug") DO NOTHING RETURNING *`, one candidate at a time.
 *
 * This must be the FIRST write of the surrounding transaction. A unique violation (`23505`)
 * inside a Postgres transaction aborts it (every later statement fails with `25P02`), so the
 * claim never lets the insert raise: `ON CONFLICT DO NOTHING` returns an empty array for a taken
 * slug (soft-deleted holders included, because `recipe_slug_unique` is global) and the loop moves
 * on. Under READ COMMITTED, a concurrent uncommitted holder of the same slug makes the insert
 * wait, then skip (holder committed) or insert (holder rolled back), so concurrent creates always
 * end with distinct slugs. Only the `slug` conflict target is absorbed; any other unique
 * violation still raises.
 *
 * @param tx - The open creation/fork transaction.
 * @param row - The recipe row to insert, without its slug.
 * @param slugCandidates - Slugs to try, in order (from `slugCandidates()` in `@brewform/shared/utils`).
 * @returns The inserted recipe row, or `null` when every candidate is taken.
 */
async function claimRecipeSlug(
  tx: RecipeTx,
  row: RecipeRowWithoutSlug,
  slugCandidates: readonly string[],
): Promise<typeof recipes.$inferSelect | null> {
  for (const [attempt, slug] of slugCandidates.entries()) {
    const [inserted] = await tx
      .insert(recipes)
      .values({ ...row, slug })
      .onConflictDoNothing({ target: recipes.slug })
      .returning();
    if (inserted) return inserted;
    modelLog.debug({ authorId: row.authorId, attempt }, 'recipe slug candidate taken');
  }
  return null;
}

/**
 * Deep-copy a recipe for a new author inside a single database transaction.
 *
 * The first write claims the fork's slug through {@link claimRecipeSlug}
 * (`ON CONFLICT ("slug") DO NOTHING`, trying each candidate in order), so the
 * transaction never aborts on a taken slug and holds no other lock while it
 * waits on a concurrent holder. There is deliberately no savepoint and no
 * `23505` catch: the claim cannot raise on the slug. Only after a slug is
 * claimed does it copy the latest version (taste notes, equipment, additional
 * preparations, version photos) and increment the source recipe's `forkCount`.
 *
 * The fork's first version copies every version column through
 * {@link copyVersionColumns} (including `tds`, `coffeeVarietyId` and
 * `coffeeVarietyName`), with `brewDate` set to now and the source author's
 * personal assessments reset (`rating: null`, `isFavourite: false`). No user's
 * private notes (`user_recipe_note`) are copied.
 *
 * @param sourceId       - UUID of the recipe to fork
 * @param authorId       - UUID of the user creating the fork
 * @param title          - Title for the forked recipe (already sanitized)
 * @param slugCandidates - Slugs to try, in order
 * @returns The new recipe row with its first version and all copied relations,
 *          or `null` when every slug candidate is taken (nothing is written and
 *          `forkCount` is unchanged)
 * @throws {Error} `RECIPE_NOT_FOUND` if sourceId does not exist or is soft-deleted
 * @throws {Error} `RECIPE_NO_VERSIONS` if the source recipe has no published versions
 */
export async function forkRecipe(
  sourceId: string,
  authorId: string,
  title: string,
  slugCandidates: readonly string[],
) {
  const source = await findById(sourceId);
  if (!source) throw new Error('RECIPE_NOT_FOUND');

  const latestVersion = source.versions?.[0];
  if (!latestVersion) throw new Error('RECIPE_NO_VERSIONS');

  return db.transaction(async (tx) => {
    const newRecipe = await claimRecipeSlug(
      tx,
      { title, authorId, visibility: 'draft', forkedFromId: sourceId },
      slugCandidates,
    );
    if (!newRecipe) return null;

    // Every version column is copied through the shared mapping (tds and the coffee variety
    // included); the source author's personal assessments are reset.
    const [newVersion] = await tx
      .insert(recipeVersions)
      .values({
        recipeId: newRecipe.id,
        versionNumber: 1,
        ...copyVersionColumns(latestVersion),
        brewDate: new Date(),
        rating: null,
        isFavourite: false,
      })
      .returning();

    const sourceTasteNotes = await tx
      .select()
      .from(recipeTasteNotes)
      .where(eq(recipeTasteNotes.recipeVersionId, latestVersion.id));
    const insertedTasteNotes = sourceTasteNotes.length
      ? await tx
          .insert(recipeTasteNotes)
          .values(
            sourceTasteNotes.map((tn) => ({
              recipeVersionId: newVersion.id,
              tasteNoteId: tn.tasteNoteId,
              intensity: tn.intensity,
            })),
          )
          .returning()
      : [];

    const sourceEquipment = await tx
      .select()
      .from(recipeEquipment)
      .where(eq(recipeEquipment.recipeVersionId, latestVersion.id));
    const insertedEquipment = sourceEquipment.length
      ? await tx
          .insert(recipeEquipment)
          .values(
            sourceEquipment.map((eq) => ({
              recipeVersionId: newVersion.id,
              equipmentId: eq.equipmentId,
            })),
          )
          .returning()
      : [];

    const sourcePreparations = await tx
      .select()
      .from(recipeAdditionalPreparations)
      .where(eq(recipeAdditionalPreparations.recipeVersionId, latestVersion.id));
    const insertedPreparations = sourcePreparations.length
      ? await tx
          .insert(recipeAdditionalPreparations)
          .values(
            sourcePreparations.map((p) => ({
              recipeVersionId: newVersion.id,
              name: p.name,
              type: p.type,
              inputAmount: p.inputAmount,
              preparationType: p.preparationType,
              sortOrder: p.sortOrder,
            })),
          )
          .returning()
      : [];

    const sourceVersionPhotos = await tx
      .select()
      .from(recipeVersionPhotos)
      .where(eq(recipeVersionPhotos.recipeVersionId, latestVersion.id));
    const insertedVersionPhotos = sourceVersionPhotos.length
      ? await tx
          .insert(recipeVersionPhotos)
          .values(
            sourceVersionPhotos.map((vp) => ({
              recipeVersionId: newVersion.id,
              photoId: vp.photoId,
              sortOrder: vp.sortOrder,
            })),
          )
          .returning()
      : [];

    await tx
      .update(recipes)
      .set({ currentVersionId: newVersion.id })
      .where(eq(recipes.id, newRecipe.id));
    await tx
      .update(recipes)
      .set({ forkCount: sql`${recipes.forkCount} + 1` })
      .where(eq(recipes.id, sourceId));

    return {
      ...newRecipe,
      versions: [
        {
          ...newVersion,
          tasteNotes: insertedTasteNotes.map((tn) => ({
            ...tn,
            tasteNote: latestVersion.tasteNotes?.find((ltn) => ltn.tasteNoteId === tn.tasteNoteId)
              ?.tasteNote,
          })),
          equipment: insertedEquipment.map((eq) => ({
            ...eq,
            equipment: latestVersion.equipment?.find((leq) => leq.equipmentId === eq.equipmentId)
              ?.equipment,
          })),
          additionalPreparations: insertedPreparations,
          versionPhotos: insertedVersionPhotos,
        },
      ],
    };
  });
}

/**
 * Input for {@link createRecipeWithRelations}. Carries the recipe-level fields, every
 * first-version column ({@link RecipeVersionColumns}: all `recipe_version` columns except
 * `id`, `recipeId`, `versionNumber` and `createdAt`, pre-resolved by the service, including
 * `Date`-cast dates, computed `brewRatio`/`flowRate`, setup-inherited `grinder`/`brewerDetails`,
 * sanitized notes, `tds` as a decimal string or `null`, and `coffeeVarietyId` with its
 * server-resolved `coffeeVarietyName`) and the child-relation arrays. The helper re-derives
 * nothing.
 */
export interface CreateRecipeWithRelationsInput extends RecipeVersionColumns {
  // recipe-level
  authorId: string;
  /** Slugs to claim, in order; the first free one wins (see {@link claimRecipeSlug}). */
  slugCandidates: readonly string[];
  title: string;
  visibility: Visibility;
  // child relations
  tasteNoteIds?: string[];
  /** Intensity per taste-note id; ids without an entry get intensity `1`. */
  tasteNoteIntensities?: Record<string, number>;
  equipmentIds?: string[];
  additionalPreparations?: AdditionalPreparationInput[];
  photoIds?: string[];
}

/**
 * Create a recipe with its first version and all child relations in a
 * single transaction, then return the full relational row.
 *
 * The first write claims the slug through {@link claimRecipeSlug}: it inserts
 * the recipe row (with `currentVersionId = null`) with
 * `ON CONFLICT ("slug") DO NOTHING`, trying each candidate in order, so a taken
 * slug (soft-deleted holders included) never aborts the transaction and a
 * concurrent create with the same title simply gets the next candidate. There
 * is deliberately no savepoint and no `23505` catch. Then it inserts the first
 * version row (versionNumber 1) with every column from {@link versionColumnsFrom}
 * (so `tds`, `coffeeVarietyId` and `coffeeVarietyName` are written), and
 * optionally taste notes (intensity from `tasteNoteIntensities`, default `1`),
 * equipment, additional preparations, and version photos (`sortOrder` = array
 * index). Finally it updates `recipes.currentVersionId` and reloads via
 * {@link findById} so the returned shape matches every other read path.
 *
 * @param input - Pre-resolved recipe + version + relation fields.
 * @returns The inserted recipe with author, versions (with nested
 *          relations), photos, and forkedFrom — identical to
 *          {@link findById}'s shape — or `null` when every slug candidate is
 *          taken (nothing is written and no reload runs).
 */
export async function createRecipeWithRelations(input: CreateRecipeWithRelationsInput) {
  modelLog.debug({ authorId: input.authorId }, 'createRecipeWithRelations started');

  const created = await db.transaction(async (tx) => {
    const r = await claimRecipeSlug(
      tx,
      {
        title: input.title,
        authorId: input.authorId,
        visibility: input.visibility,
        currentVersionId: null,
      },
      input.slugCandidates,
    );
    if (!r) return null;

    const [version] = await tx
      .insert(recipeVersions)
      .values({ recipeId: r.id, versionNumber: 1, ...versionColumnsFrom(input) })
      .returning();

    await insertVersionRelations(tx, version.id, {
      tasteNotes: input.tasteNoteIds?.map((id) => ({
        tasteNoteId: id,
        intensity: input.tasteNoteIntensities?.[id] ?? 1,
      })),
      equipmentIds: input.equipmentIds,
      additionalPreparations: input.additionalPreparations,
      photoIds: input.photoIds,
    });

    await tx.update(recipes).set({ currentVersionId: version.id }).where(eq(recipes.id, r.id));

    return r;
  });

  if (!created) {
    modelLog.debug(
      { authorId: input.authorId, attempts: input.slugCandidates.length },
      'createRecipeWithRelations completed: no free slug candidate',
    );
    return null;
  }

  modelLog.debug(
    { authorId: input.authorId, recipeId: created.id },
    'createRecipeWithRelations completed',
  );
  return findById(created.id);
}

/** Write mode of {@link updateRecipeWithVersion}. */
export type RecipeWriteMode = 'amend' | 'bump';

/**
 * Input for {@link updateRecipeWithVersion}. Everything is pre-resolved by the service: the
 * merged values of every version column, the sanitized title and the visibility. A relation
 * key that is absent keeps (amend) or copies (bump) the current version's rows; a present
 * array replaces them (`[]` removes them all).
 */
export interface UpdateRecipeWithVersionInput {
  recipeId: string;
  /** The author performing the write (logged only). */
  authorId: string;
  /** `amend` updates the current version in place; `bump` creates version `max + 1`. */
  mode: RecipeWriteMode;
  /** Sanitized recipe title. */
  title: string;
  visibility: Visibility;
  /** Merged values for every version column. */
  version: RecipeVersionColumns;
  tasteNoteIds?: string[];
  /**
   * Intensity per taste-note id, used with `tasteNoteIds`. Ids without an entry keep their
   * intensity on the current version when they were already linked, else `1`.
   */
  tasteNoteIntensities?: Record<string, number>;
  equipmentIds?: string[];
  additionalPreparations?: AdditionalPreparationInput[];
  photoIds?: string[];
}

/**
 * Read the version a write applies to: the recipe's `currentVersionId`, or the highest
 * version number when the pointer is unset.
 *
 * @param tx - The open write transaction.
 * @param recipeId - The (locked) recipe.
 * @param currentVersionId - The recipe's current-version pointer.
 * @returns The current version row, or `undefined` when the recipe has no version.
 */
async function findCurrentVersionRow(
  tx: RecipeTx,
  recipeId: string,
  currentVersionId: string | null,
) {
  const [row] = await tx
    .select()
    .from(recipeVersions)
    .where(
      currentVersionId
        ? and(eq(recipeVersions.id, currentVersionId), eq(recipeVersions.recipeId, recipeId))
        : eq(recipeVersions.recipeId, recipeId),
    )
    .orderBy(desc(recipeVersions.versionNumber))
    .limit(1);
  return row;
}

/**
 * Amend the current version of a recipe or bump it to a new version, in ONE transaction.
 *
 * 1. Lock the recipe row (`SELECT … FOR UPDATE` via Drizzle's `.for('update')`), so
 *    concurrent writes to the same recipe run one after the other.
 * 2. Read the current version and its relations.
 * 3. `amend`: update the current version's columns and replace each provided relation.
 *    `bump`: insert version `max(versionNumber) + 1`, then write each relation from the
 *    payload when provided, otherwise copy it from the current version (taste notes with
 *    their intensities, equipment, additional preparations and photos with their `sortOrder`).
 * 4. Update the recipe's `title`, `visibility`, `updatedAt` and, on a bump, `currentVersionId`.
 *
 * Any error rolls everything back: no partial version, no orphan version. Earlier versions
 * are never touched. After commit the full recipe is reloaded through {@link findById}.
 *
 * @param input - The pre-resolved write (see {@link UpdateRecipeWithVersionInput}).
 * @returns The recipe in the {@link findById} shape.
 * @throws {Error} `RECIPE_NOT_FOUND` when the recipe is missing or soft-deleted.
 * @throws {Error} `RECIPE_NO_VERSIONS` when the recipe has no version.
 */
export async function updateRecipeWithVersion(input: UpdateRecipeWithVersionInput) {
  const { recipeId, authorId, mode } = input;
  modelLog.debug({ recipeId, authorId, mode }, 'updateRecipeWithVersion started');

  let written: { versionId: string; versionNumber: number };
  try {
    written = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: recipes.id, currentVersionId: recipes.currentVersionId })
        .from(recipes)
        .where(and(eq(recipes.id, recipeId), isNull(recipes.deletedAt)))
        .for('update');
      if (!locked) throw new Error('RECIPE_NOT_FOUND');

      const current = await findCurrentVersionRow(tx, recipeId, locked.currentVersionId);
      if (!current) throw new Error('RECIPE_NO_VERSIONS');
      const previous = await readVersionRelations(tx, current.id);

      const previousIntensity = new Map(
        previous.tasteNotes.map((link) => [link.tasteNoteId, link.intensity]),
      );
      const provided: VersionRelations = {
        tasteNotes: input.tasteNoteIds?.map((id) => ({
          tasteNoteId: id,
          intensity: input.tasteNoteIntensities?.[id] ?? previousIntensity.get(id) ?? 1,
        })),
        equipmentIds: input.equipmentIds,
        additionalPreparations: input.additionalPreparations,
        photoIds: input.photoIds,
      };
      const values = versionColumnsFrom(input.version);

      let target: { versionId: string; versionNumber: number };
      if (mode === 'amend') {
        await tx.update(recipeVersions).set(values).where(eq(recipeVersions.id, current.id));
        await replaceVersionRelations(tx, current.id, provided);
        target = { versionId: current.id, versionNumber: current.versionNumber };
      } else {
        const [{ highest }] = await tx
          .select({ highest: max(recipeVersions.versionNumber) })
          .from(recipeVersions)
          .where(eq(recipeVersions.recipeId, recipeId));
        const versionNumber = (highest ?? 0) + 1;
        const [created] = await tx
          .insert(recipeVersions)
          .values({ recipeId, versionNumber, ...values })
          .returning({ id: recipeVersions.id });
        await insertVersionRelations(tx, created.id, {
          tasteNotes: provided.tasteNotes ?? previous.tasteNotes,
          equipmentIds: provided.equipmentIds ?? previous.equipmentIds,
          additionalPreparations:
            provided.additionalPreparations ?? previous.additionalPreparations,
          photoIds: provided.photoIds ?? previous.photoIds,
        });
        target = { versionId: created.id, versionNumber };
      }

      await tx
        .update(recipes)
        .set({
          title: input.title,
          visibility: input.visibility,
          updatedAt: new Date(),
          ...(mode === 'bump' ? { currentVersionId: target.versionId } : {}),
        })
        .where(eq(recipes.id, recipeId));

      return target;
    });
  } catch (err) {
    modelLog.error(
      { err: toLoggableError(err), recipeId, authorId, mode },
      'updateRecipeWithVersion failed',
    );
    throw err;
  }

  modelLog.debug({ recipeId, authorId, mode, ...written }, 'updateRecipeWithVersion completed');
  return findById(recipeId);
}

/**
 * Of the given taste-note ids, return those that exist and are not soft-deleted.
 *
 * @param ids - Candidate taste-note ids.
 * @returns The existing ids (any order).
 */
export async function findExistingTasteNoteIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: tasteNotes.id })
    .from(tasteNotes)
    .where(and(inArray(tasteNotes.id, ids), isNull(tasteNotes.deletedAt)));
  return rows.map((row) => row.id);
}

/**
 * Of the given equipment ids, return those that exist and are not soft-deleted.
 *
 * @param ids - Candidate equipment ids.
 * @returns The existing ids (any order).
 */
export async function findExistingEquipmentIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(and(inArray(equipment.id, ids), isNull(equipment.deletedAt)));
  return rows.map((row) => row.id);
}

/**
 * Find a non-deleted vendor by id.
 *
 * @param id - Vendor id.
 * @returns `{ id }`, or `null` when missing or soft-deleted.
 */
export async function findVendor(id: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Find a non-deleted bean owned by the given user.
 *
 * @param beanId - Bean id.
 * @param userId - Expected owner.
 * @returns `{ id }`, or `null` when missing, soft-deleted or owned by someone else.
 */
export async function findOwnedBean(
  beanId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: beans.id })
    .from(beans)
    .where(and(eq(beans.id, beanId), eq(beans.userId, userId), isNull(beans.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Find a non-deleted coffee variety by id.
 *
 * @param id - Coffee variety id.
 * @returns `{ id, name }` (the name is copied into `recipe_version.coffee_variety_name`), or
 *   `null` when missing or soft-deleted.
 */
export async function findCoffeeVariety(id: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: coffeeVarieties.id, name: coffeeVarieties.name })
    .from(coffeeVarieties)
    .where(and(eq(coffeeVarieties.id, id), isNull(coffeeVarieties.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Atomically increment a recipe's `likeCount` by 1. Returns the updated row or null. */
export async function incrementLikes(id: string) {
  const [result] = await db
    .update(recipes)
    .set({ likeCount: sql`${recipes.likeCount} + 1` })
    .where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

/** Atomically decrement a recipe's `likeCount` by 1. Returns the updated row or null. */
export async function decrementLikes(id: string) {
  const [result] = await db
    .update(recipes)
    .set({ likeCount: sql`${recipes.likeCount} - 1` })
    .where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

/** Atomically increment a recipe's `commentCount` by 1. Returns the updated row or null. */
export async function incrementComments(id: string) {
  const [result] = await db
    .update(recipes)
    .set({ commentCount: sql`${recipes.commentCount} + 1` })
    .where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

/**
 * Atomically decrement a recipe's `commentCount` by the number of comments removed.
 *
 * @param id - The recipe
 * @param by - How many comments one delete removed (1, or 1 + the replies a thread delete removed)
 * @returns The updated row, or null when the recipe does not exist
 */
export async function decrementComments(id: string, by = 1) {
  const [result] = await db
    .update(recipes)
    // D03 raw-SQL exception: Drizzle has no arithmetic SET builder; an in-place decrement by a
    // bound value avoids a read-then-write race between concurrent deletes.
    .set({ commentCount: sql`${recipes.commentCount} - ${by}` })
    .where(eq(recipes.id, id))
    .returning();
  return result ?? null;
}

/**
 * Insert or update a user's rating for a recipe in one statement.
 *
 * Runs `insert … on conflict (user_id, recipe_id) do update set rating, updated_at`
 * against `user_recipe_rating_user_id_recipe_id_unique`, so two concurrent
 * first ratings by the same user both succeed and leave exactly one row
 * holding the last-written value.
 *
 * @param userId   - UUID of the user submitting the rating
 * @param recipeId - UUID of the recipe being rated
 * @param rating   - Numeric rating value
 * @returns An object containing the persisted rating value
 */
export async function upsertUserRating(userId: string, recipeId: string, rating: number) {
  await db
    .insert(userRecipeRatings)
    .values({ userId, recipeId, rating })
    .onConflictDoUpdate({
      target: [userRecipeRatings.userId, userRecipeRatings.recipeId],
      set: { rating, updatedAt: new Date() },
    });
  return { rating };
}

/**
 * Compute the average rating and total rating count for a recipe.
 *
 * @returns Object with `avgRating` (rounded to 1 decimal, or null if no ratings)
 *          and `ratingCount` (0 if no ratings exist)
 */
export async function getRecipeRatingStats(recipeId: string) {
  const [result] = await db
    .select({
      avgRating: avg(userRecipeRatings.rating),
      ratingCount: count(userRecipeRatings.id),
    })
    .from(userRecipeRatings)
    .where(eq(userRecipeRatings.recipeId, recipeId));
  return {
    avgRating: result?.avgRating ? Math.round(Number(result.avgRating) * 10) / 10 : null,
    ratingCount: result?.ratingCount ?? 0,
  };
}

/** Fetch a specific user's rating for a recipe, or null if they haven't rated it. */
export async function getUserRating(userId: string, recipeId: string): Promise<number | null> {
  const [result] = await db
    .select({ rating: userRecipeRatings.rating })
    .from(userRecipeRatings)
    .where(and(eq(userRecipeRatings.userId, userId), eq(userRecipeRatings.recipeId, recipeId)))
    .limit(1);
  return result?.rating ?? null;
}

/** Count the total number of users who have favourited a recipe. */
export async function getFavouriteCount(recipeId: string): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(userRecipeFavourites)
    .where(eq(userRecipeFavourites.recipeId, recipeId));
  return result?.count ?? 0;
}

/**
 * Fetch the current user's like and favourite status for a recipe.
 *
 * @returns Object with `userLiked` (boolean) and `userFavourited` (boolean) flags
 */
export async function getUserLikeStatus(userId: string, recipeId: string) {
  const [[like], [fav]] = await Promise.all([
    db
      .select({ id: userRecipeLikes.userId })
      .from(userRecipeLikes)
      .where(and(eq(userRecipeLikes.userId, userId), eq(userRecipeLikes.recipeId, recipeId)))
      .limit(1),
    db
      .select({ id: userRecipeFavourites.userId })
      .from(userRecipeFavourites)
      .where(
        and(eq(userRecipeFavourites.userId, userId), eq(userRecipeFavourites.recipeId, recipeId)),
      )
      .limit(1),
  ]);
  return { userLiked: !!like, userFavourited: !!fav };
}

/**
 * Toggle a user's like on a recipe inside a single database transaction.
 *
 * Attempts an INSERT with `onConflictDoNothing`. If a row already exists,
 * deletes it instead. Atomically increments or decrements the recipe's
 * `likeCount` to match.
 *
 * @returns `{ liked: true }` if the like was added, `{ liked: false }` if removed
 */
export function toggleLike(userId: string, recipeId: string) {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(userRecipeLikes)
      .values({ userId, recipeId })
      .onConflictDoNothing({ target: [userRecipeLikes.userId, userRecipeLikes.recipeId] })
      .returning();

    if (inserted.length > 0) {
      await tx
        .update(recipes)
        .set({ likeCount: sql`${recipes.likeCount} + 1` })
        .where(eq(recipes.id, recipeId));
      return { liked: true };
    }

    const deleted = await tx
      .delete(userRecipeLikes)
      .where(and(eq(userRecipeLikes.userId, userId), eq(userRecipeLikes.recipeId, recipeId)))
      .returning();

    if (deleted.length > 0) {
      await tx
        .update(recipes)
        .set({ likeCount: sql`${recipes.likeCount} - 1` })
        .where(eq(recipes.id, recipeId));
    }
    return { liked: false };
  });
}

/**
 * Toggle a user's favourite bookmark on a recipe.
 *
 * Attempts an INSERT with `onConflictDoNothing`. If a row already exists,
 * deletes it instead.
 *
 * @returns `{ favourited: true }` if the favourite was added, `{ favourited: false }` if removed
 */
export async function toggleFavourite(userId: string, recipeId: string) {
  const inserted = await db
    .insert(userRecipeFavourites)
    .values({ userId, recipeId })
    .onConflictDoNothing({ target: [userRecipeFavourites.userId, userRecipeFavourites.recipeId] })
    .returning();

  if (inserted.length === 0) {
    await db
      .delete(userRecipeFavourites)
      .where(
        and(eq(userRecipeFavourites.userId, userId), eq(userRecipeFavourites.recipeId, recipeId)),
      );
    return { favourited: false };
  }

  return { favourited: true };
}

/**
 * Toggle a recipe's `featured` flag via an atomic NOT expression.
 *
 * Authorization is enforced at the service layer; this model assumes
 * the caller has already verified admin privileges.
 *
 * @throws {Error} `RECIPE_NOT_FOUND` if the recipe does not exist
 * @returns `{ featured: boolean }` — the new featured state
 */
export async function toggleFeature(id: string) {
  const [recipe] = await db
    .update(recipes)
    .set({ featured: not(recipes.featured) })
    .where(eq(recipes.id, id))
    .returning();

  if (!recipe) throw new Error('RECIPE_NOT_FOUND');

  return { featured: recipe.featured };
}

/** Fetch all versions for a recipe (summary fields only), ordered newest-first. */
export function getVersionsByRecipeId(recipeId: string) {
  return db
    .select({
      id: recipeVersions.id,
      versionNumber: recipeVersions.versionNumber,
      brewDate: recipeVersions.brewDate,
      brewMethod: recipeVersions.brewMethod,
      groundWeightGrams: recipeVersions.groundWeightGrams,
      extractionVolumeMl: recipeVersions.extractionVolumeMl,
      extractionTimeSeconds: recipeVersions.extractionTimeSeconds,
      temperatureCelsius: recipeVersions.temperatureCelsius,
      brewRatio: recipeVersions.brewRatio,
    })
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, recipeId))
    .orderBy(desc(recipeVersions.versionNumber));
}

/** Result shape returned by cursor-based pagination queries. */
export interface CursorResult<T> {
  /** Recipes on the current page. */
  recipes: T[];
  /** True when at least one more page of results exists. */
  hasMore: boolean;
  /** Base64-encoded cursor for the next page, or null when no more results. */
  nextCursor: string | null;
  /** Total matching recipes, only populated when explicitly requested. */
  total?: number;
}

/**
 * Build the composite ROW-VALUE WHERE clause used by cursor-based queries.
 *
 * Generates `(createdAt, id) < cursor` for DESC and `(createdAt, id) > cursor`
 * for ASC. The soft-delete filter is applied separately by the caller.
 *
 * @returns A Drizzle SQL expression or `undefined` when no cursor is supplied.
 */
function buildCursorWhere(cursor: { createdAt: string; id: string }, sortOrder: string): SQL {
  const { createdAt, id } = cursor;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(createdAt)) {
    throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
  }
  const createdAtValue = new Date(createdAt);
  if (isNaN(createdAtValue.getTime())) {
    throw new Error('VALIDATION_ERROR: INVALID_CURSOR');
  }
  // D03 raw-SQL exception: row-value comparison for composite index sargability.
  // Drizzle has no first-class row-value operator; sql template is the idiomatic escape hatch.
  // ponytail: upgrade path — if Drizzle adds row-value support, replace with the native operator.
  const iso = createdAtValue.toISOString();
  if (sortOrder === 'asc') {
    return sql`(${recipes.createdAt}, ${recipes.id}) > (${iso}, ${id})`;
  }
  return sql`(${recipes.createdAt}, ${recipes.id}) < (${iso}, ${id})`;
}

/**
 * Execute a cursor-based query against the recipes table.
 *
 * Fetches `perPage + 1` rows so we can detect whether more pages exist without
 * an additional round-trip. The cursor filter is combined with the caller's
 * existing `where` conditions via `and()`. The page rows pass through
 * {@link maskUnlistableForkSources}, so a fork of a non-public source carries
 * `forkedFromId: null` (capability `recipe-visibility`).
 *
 * @param where       - Existing list WHERE conditions (visibility, filters, etc.)
 * @param cursor      - Decoded `{ createdAt, id }` cursor.
 * @param perPage     - Number of recipes per page.
 * @param sortOrder   - Sort direction: `'desc'` (default) or `'asc'`.
 * @param includeTotal - Whether to run an additional `SELECT count(*)` query.
 * @returns Cursor result with `recipes`, `hasMore`, `nextCursor`, and optional
 *          `total`.
 */
export async function findCursor(
  where: SQL | undefined,
  cursor: { createdAt: string; id: string },
  perPage: number,
  sortOrder: string = 'desc',
  includeTotal: boolean = false,
): Promise<CursorResult<Record<string, unknown>>> {
  modelLog.debug({ recipeId: cursor.id }, 'findCursor started');

  const finalWhere = where
    ? and(where, isNull(recipes.deletedAt), buildCursorWhere(cursor, sortOrder))
    : and(isNull(recipes.deletedAt), buildCursorWhere(cursor, sortOrder));

  const orderBy =
    sortOrder === 'asc'
      ? [asc(recipes.createdAt), asc(recipes.id)]
      : [desc(recipes.createdAt), desc(recipes.id)];

  const [rows, totalResult] = await Promise.all([
    db.query.recipes.findMany({
      where: finalWhere,
      orderBy,
      limit: perPage + 1,
      with: {
        author: { columns: { id: true, username: true, displayName: true } },
      },
    }),
    includeTotal
      ? db
          .select({ count: count() })
          .from(recipes)
          .where(where ? and(where, isNull(recipes.deletedAt)) : isNull(recipes.deletedAt))
      : Promise.resolve([{ count: 0 }]),
  ]);

  const hasMore = rows.length > perPage;
  const recipesPage = await maskUnlistableForkSources(rows.slice(0, perPage));
  const nextCursor = hasMore
    ? encodeCursor({
        createdAt: (recipesPage[recipesPage.length - 1].createdAt as Date).toISOString(),
        id: recipesPage[recipesPage.length - 1].id as string,
      })
    : null;

  const result: CursorResult<Record<string, unknown>> = {
    recipes: recipesPage,
    hasMore,
    nextCursor,
  };
  if (includeTotal) result.total = totalResult[0].count;

  modelLog.debug({}, 'findCursor completed');
  return result;
}

/**
 * Fetch a paginated feed of public recipes from a set of followed author IDs.
 *
 * The feed is a discovery surface (capability `recipe-visibility`): it lists only what
 * {@link listableRecipeCondition}`(null)` selects, so `unlisted`, `draft` and `private`
 * recipes never appear. When `cursor` is provided, delegates to {@link findCursor} for
 * cursor-based pagination (DESC by `createdAt`); otherwise falls back to {@link findMany}
 * offset-based pagination.
 *
 * @param authorIds - UUIDs of followed authors whose public recipes to include.
 * @param page      - 1-based page number (offset mode only).
 * @param perPage   - Number of recipes per page.
 * @param cursor    - Optional decoded `{ createdAt, id }` bookmark for cursor mode.
 * @returns Either `{ recipes, total }` for offset mode or
 *          `{ recipes, hasMore, nextCursor, total? }` for cursor mode.
 */
export function getFeed(
  authorIds: string[],
  page: number,
  perPage: number,
  cursor?: { createdAt: string; id: string },
): Promise<
  { recipes: Record<string, unknown>[]; total: number } | CursorResult<Record<string, unknown>>
> {
  const where = and(inArray(recipes.authorId, authorIds), listableRecipeCondition(null));
  if (cursor) {
    return findCursor(where, cursor, perPage, 'desc');
  }
  return findMany(where, page, perPage, 'createdAt', 'desc');
}

/**
 * Fetch a paginated, filtered list of recipes the given user has favourited.
 *
 * Starred is a viewer-only record (capability `recipe-visibility`): only the caller ever
 * sees it, so it lists the favourites the caller can OPEN, through
 * {@link viewableRecipeCondition}`(userId)`: non-deleted `public` and `unlisted` recipes,
 * plus the caller's own `draft`/`private` recipes. Another author's recipe that became
 * `private` or `draft`, or was soft-deleted, drops out.
 *
 * The shared filter branches (`brewMethod`, `drinkType`, `search`, `mainBrewer`,
 * `author`, dates, ratings, `equipmentId`, `tasteNoteIds` / `tasteNoteId`,
 * `coffeeVarietyId`) are built by {@link buildRecipeFilters}; this function prepends
 * the viewer-only visibility condition and the favourites-scope subquery
 * (`userRecipeFavourites`), then delegates to {@link findListPage}, so a starred search
 * is relevance-ranked by the same bounded query as `/recipes`.
 *
 * @param userId  - UUID of the user whose favourites to query
 * @param filters - Optional filter criteria (see {@link RecipeFilterCriteria}) plus sorting
 * @param page    - One-based page number
 * @param perPage - Number of recipes per page
 * @returns Paginated result with `recipes` array and `total` count
 */
export function findStarred(
  userId: string,
  filters: RecipeFilterCriteria & {
    sortBy?: string;
    sortOrder?: string;
  },
  page: number,
  perPage: number,
) {
  const starredSubquery = db
    .select({ recipeId: userRecipeFavourites.recipeId })
    .from(userRecipeFavourites)
    .where(eq(userRecipeFavourites.userId, userId));

  const finalWhere = and(
    viewableRecipeCondition(userId),
    inArray(recipes.id, starredSubquery),
    ...buildRecipeFilters(filters),
  );

  return findListPage({
    where: finalWhere,
    page,
    perPage,
    sortBy: filters.sortBy || 'createdAt',
    sortOrder: filters.sortOrder || 'desc',
    search: filters.search,
  });
}

/** Fetch equipment by IDs, returning id + type for compatibility checks. */
export function getEquipmentByIds(ids: string[]) {
  return db
    .select({ id: equipment.id, type: equipment.type })
    .from(equipment)
    .where(inArray(equipment.id, ids));
}

/** Fetch brew method equipment rules for a given brew method. */
export function getBrewMethodEquipmentRules(brewMethod: BrewMethod) {
  return db
    .select()
    .from(brewMethodEquipmentRules)
    .where(eq(brewMethodEquipmentRules.brewMethod, brewMethod));
}

/** Fetch a user's setup by ID, checking ownership and non-deleted status. */
export async function getUserSetup(setupId: string, userId: string) {
  const result = await db
    .select()
    .from(setups)
    .where(and(eq(setups.id, setupId), eq(setups.userId, userId), isNull(setups.deletedAt)))
    .limit(1);
  return result[0] ?? null;
}

/** Fetch a user by ID. */
export async function getUserById(userId: string) {
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0] ?? null;
}

/**
 * Fetch a single recipe version by ID with its taste notes, equipment, and
 * additional preparations relations populated.
 * @param versionId - The recipe version UUID.
 * @returns The version row with nested relations, or undefined if not found.
 */
export function fetchRecipeVersionWithRelations(versionId: string) {
  return db.query.recipeVersions.findFirst({
    where: eq(recipeVersions.id, versionId),
    with: {
      recipe: true,
      tasteNotes: { with: { tasteNote: true } },
      equipment: { with: { equipment: true } },
      additionalPreparations: true,
    },
  });
}
