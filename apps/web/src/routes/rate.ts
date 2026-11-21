import { RecipeRateSchema } from '@brewform/shared/schemas';
import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { recipeApi } from '../api/index.ts';
import type { RateResponse } from '../api/types.ts';
import { type ActionFailure, formString, toActionFailure } from './action-result.ts';
import { withDataLog } from './data-logging.ts';

const logger = createLogger('rate');

/** Result of {@link rateAction}: the saved rating and the new community figures, or the failure. */
export type RateResult = ({ ok: true } & RateResponse) | ActionFailure;

/**
 * Action submitting a 1–10 rating for recipe `:id` (validated with `RecipeRateSchema`). Returns
 * `{ ok: true, rating, avgRating, ratingCount }`, or `{ ok: false, error, code? }` for an invalid
 * id or rating (`VALIDATION_ERROR`, no request), an API error (a final 401 gives
 * `code: 'UNAUTHORIZED'`: a resource route never redirects) or a network failure. It never throws,
 * except for an aborted request. The call passes `request.signal` and logs through `withDataLog`.
 */
export const rateAction = async ({ params, request }: ActionFunctionArgs): Promise<RateResult> => {
  const id = params.id ?? '';
  const form = await request.formData();
  const raw = formString(form, 'rating');
  const parsed = RecipeRateSchema.safeParse({ rating: raw === '' ? Number.NaN : Number(raw) });
  if (!id || !parsed.success) {
    logger.debug({ id }, 'rateAction invalid input');
    return { ok: false, error: 'Invalid rating', code: 'VALIDATION_ERROR' };
  }
  const { rating } = parsed.data;
  try {
    const result = await withDataLog(logger, 'rateAction', { id, rating }, () =>
      recipeApi.rate(id, rating, { signal: request.signal }),
    );
    return { ok: true, ...result };
  } catch (err) {
    return toActionFailure(err, []);
  }
};
