import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import type { RecipeFormFailure } from './recipe-common.data.ts';

/**
 * The message a recipe form shows for a failed create/update/fork/merge action: one
 * `field: message` line per API validation detail (prefixed with `• ` when `bulleted`), else
 * the localised rate-limit text or the API message, else `t(fallbackKey)`.
 */
export function recipeFormErrorMessage(
  failure: Pick<RecipeFormFailure, 'error' | 'code' | 'retryAfterSeconds' | 'details'>,
  t: (key: string) => string,
  fallbackKey: string,
  bulleted = false,
): string {
  if (failure.details && failure.details.length > 0) {
    const lines = failure.details.map((d) => `${d.field}: ${d.message}`);
    return (bulleted ? lines.map((line) => `• ${line}`) : lines).join('\n');
  }
  return getApiErrorMessage(failureToError(failure), t, fallbackKey);
}
