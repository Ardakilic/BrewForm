import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { upload: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { ApiError } from '../../api/errors.ts';
import { installNodeFormDataGlobals } from '../../test-utils/node-form-data.ts';
import { PHOTO_UPLOAD_PATH, uploadErrorKey, uploadPhotoAction } from './photos.ts';

const mockUpload = vi.mocked(api.upload);

/** Builds a multipart upload request like `PhotoUpload` submits. */
function uploadRequest(): Request {
  const form = new FormData();
  form.append('file', new File(['x'], 'photo.jpg', { type: 'image/jpeg' }));
  form.append('recipeId', 'r1');
  return new Request(`http://localhost${PHOTO_UPLOAD_PATH}`, { method: 'POST', body: form });
}

beforeEach(async () => {
  // The action parses the multipart body with `request.formData()` (see the helper).
  await installNodeFormDataGlobals();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadErrorKey', () => {
  it.each([
    ['FILE_TOO_LARGE', 'photo.error.tooLarge'],
    ['PAYLOAD_TOO_LARGE', 'photo.error.tooLarge'],
    ['UNSUPPORTED_MEDIA_TYPE', 'photo.error.unsupportedType'],
    ['INVALID_IMAGE', 'photo.error.unsupportedType'],
    ['INTERNAL_ERROR', 'photo.error.uploadFailed'],
    [undefined, 'photo.error.uploadFailed'],
  ])('maps %s to %s', (code, key) => {
    expect(uploadErrorKey(code)).toBe(key);
  });
});

describe('resources/photos action', () => {
  it('forwards the multipart body to POST /photos with request.signal', async () => {
    mockUpload.mockResolvedValue({ id: 'p1' });
    const request = uploadRequest();

    await expect(
      uploadPhotoAction({ request, params: {}, context: undefined } as never),
    ).resolves.toEqual({ ok: true, photo: { id: 'p1' } });
    const [endpoint, body, opts] = mockUpload.mock.calls[0];
    expect(endpoint).toBe('/photos');
    expect((body as FormData).get('recipeId')).toBe('r1');
    expect(((body as FormData).get('file') as File).name).toBe('photo.jpg');
    expect(opts).toEqual({ signal: request.signal });
  });

  it('returns the failure with its error code and i18n key', async () => {
    mockUpload.mockRejectedValue(new ApiError('FILE_TOO_LARGE', 'too big', undefined, 413));

    await expect(
      uploadPhotoAction({ request: uploadRequest(), params: {}, context: undefined } as never),
    ).resolves.toEqual({
      ok: false,
      error: 'too big',
      code: 'FILE_TOO_LARGE',
      errorKey: 'photo.error.tooLarge',
    });
  });

  it('maps a network failure to the generic upload message', async () => {
    mockUpload.mockRejectedValue(new Error('network'));

    await expect(
      uploadPhotoAction({ request: uploadRequest(), params: {}, context: undefined } as never),
    ).resolves.toEqual({ ok: false, error: 'network', errorKey: 'photo.error.uploadFailed' });
  });
});
