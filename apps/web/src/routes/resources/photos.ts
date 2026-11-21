import type { PhotoOutput } from '@brewform/shared/schemas';
import type { ActionFunctionArgs } from 'react-router';
import { createLogger } from '@/utils/logger.ts';
import { api } from '../../api/client.ts';
import { type ActionFailure, formString, toActionFailure } from '../action-result.ts';
import { requireAuth } from '../auth-guards.ts';
import { withDataLog } from '../data-logging.ts';

const log = createLogger('resources/photos');

/** The resource-route path of {@link uploadPhotoAction}. */
export const PHOTO_UPLOAD_PATH = '/resources/photos';

/** Server error codes for a part or body over its size limit. */
const TOO_LARGE_CODES = new Set(['FILE_TOO_LARGE', 'PAYLOAD_TOO_LARGE']);

/** Server error codes for content that is not an accepted, well-formed image. */
const UNSUPPORTED_CODES = new Set(['UNSUPPORTED_MEDIA_TYPE', 'INVALID_IMAGE']);

/**
 * The i18n key describing a failed upload by its server error `code` (task 5.31): a size
 * limit → `photo.error.tooLarge`, an unsupported or invalid image →
 * `photo.error.unsupportedType`, anything else (no code, network failure, server error) →
 * `photo.error.uploadFailed`. Each message takes a `{name}` placeholder.
 */
export function uploadErrorKey(code: string | undefined): string {
  if (code && TOO_LARGE_CODES.has(code)) return 'photo.error.tooLarge';
  if (code && UNSUPPORTED_CODES.has(code)) return 'photo.error.unsupportedType';
  return 'photo.error.uploadFailed';
}

/** Result of {@link uploadPhotoAction}: the stored photo, or the failure plus its i18n key. */
export type UploadPhotoResult =
  | { ok: true; photo: PhotoOutput }
  | (ActionFailure & { errorKey: string });

/**
 * `resources/photos` action: uploads one recipe photo, submitted by `PhotoUpload` with
 * `encType: 'multipart/form-data'` (parts `file`, optional `thumbnail`, `recipeId`). The
 * multipart body is forwarded unchanged to `POST /photos` with `request.signal`. Returns
 * `{ ok: true, photo }`, or `{ ok: false, error, code, errorKey }` where `errorKey` is the
 * error-code → i18n mapping; a final 401 redirects through `requireAuth`. Logs carry the
 * recipe id only.
 */
export const uploadPhotoAction = requireAuth(
  async ({ request }: ActionFunctionArgs): Promise<UploadPhotoResult> => {
    const form = await request.formData();
    const recipeId = formString(form, 'recipeId');
    try {
      const photo = await withDataLog(log, 'uploadPhoto', { recipeId }, () =>
        api.upload<PhotoOutput>('/photos', form, { signal: request.signal }),
      );
      return { ok: true, photo };
    } catch (err) {
      const failure = toActionFailure(err);
      return { ...failure, errorKey: uploadErrorKey(failure.code) };
    }
  },
);
