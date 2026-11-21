import { failureToError } from '../../routes/action-result.ts';
import { getApiErrorMessage } from '../../utils/apiErrorMessage.ts';
import type { FieldErrorDetail, RecipeFormFailure } from './recipe-common.data.ts';

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

/**
 * Maps API validation details to one message per top-level form field, for showing each error
 * under its input. A nested path (`tasteNoteIds.0`) is keyed by its first segment, and the first
 * message for a field wins. Returns an empty map without details.
 */
export function fieldErrorMap(details: FieldErrorDetail[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { field, message } of details ?? []) {
    const key = field.split('.')[0];
    if (key && !(key in map)) map[key] = message;
  }
  return map;
}
