import type { BrewLogListItemOutput, RecipeBrewStatsOutput } from '@brewform/shared/schemas';
import type { LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { brewLogApi } from '../../api/index.ts';
import { type ActionFailure, toActionFailure } from '../action-result.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/brew-logs');

/** Brew logs shown in a recipe's brew history (the five most recent). */
export const BREW_HISTORY_PER_PAGE = 5;

/** The resource-route path of {@link recipeBrewLogsLoader} for a recipe. */
export function recipeBrewLogsPath(recipeId: string): string {
  return `/resources/brew-logs/recipe/${encodeURIComponent(recipeId)}`;
}

/** The resource-route path of {@link recipeBrewStatsLoader} for a recipe. */
export function recipeBrewStatsPath(recipeId: string): string {
  return `/resources/brew-logs/stats/${encodeURIComponent(recipeId)}`;
}

/** Result of {@link recipeBrewLogsLoader}. */
export type RecipeBrewLogsResult = { ok: true; logs: BrewLogListItemOutput[] } | ActionFailure;

/** Result of {@link recipeBrewStatsLoader}. */
export type RecipeBrewStatsResult = { ok: true; stats: RecipeBrewStatsOutput } | ActionFailure;

/**
 * `resources/brew-logs/recipe/:recipeId` loader: the viewer's five most recent brew logs for
 * a recipe (read by `BrewHistorySection` through a fetcher), with `request.signal`. Returns
 * `{ ok: true, logs }` or `{ ok: false, error }`: the history is supplementary, so a failure
 * (including a 401) never reaches an error boundary. An abort is rethrown for the router.
 */
export async function recipeBrewLogsLoader({
  params,
  request,
}: LoaderFunctionArgs): Promise<RecipeBrewLogsResult> {
  const recipeId = params.recipeId ?? '';
  try {
    const res = await withDataLog(log, 'recipeBrewLogs', { recipeId }, () =>
      brewLogApi.listForRecipe(
        recipeId,
        { page: 1, perPage: BREW_HISTORY_PER_PAGE },
        { signal: request.signal },
      ),
    );
    return { ok: true, logs: res.data };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * `resources/brew-logs/stats/:recipeId` loader: the viewer's brew count and average rating
 * for a recipe (read by `RecipeBrewStats` through a fetcher), with `request.signal`. Returns
 * `{ ok: true, stats }` or `{ ok: false, error }`: the stats are decorative, so a failure
 * (including a guest's 401) never reaches an error boundary. An abort is rethrown.
 */
export async function recipeBrewStatsLoader({
  params,
  request,
}: LoaderFunctionArgs): Promise<RecipeBrewStatsResult> {
  const recipeId = params.recipeId ?? '';
  try {
    const stats = await withDataLog(log, 'recipeBrewStats', { recipeId }, () =>
      brewLogApi.getRecipeStats(recipeId, { signal: request.signal }),
    );
    return { ok: true, stats };
  } catch (err) {
    return toActionFailure(err, []);
  }
}

/**
 * Revalidation policy of the brew-log resource routes: their fetchers re-run only after a
 * brew-log mutation (an action under `/brew-logs`). Unrelated actions on the recipe page
 * (like, favourite, follow, comment, rate) never refetch the history or the stats.
 */
export function shouldRevalidateBrewLogs({
  formAction,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  return formAction?.startsWith('/brew-logs') ? defaultShouldRevalidate : false;
}
