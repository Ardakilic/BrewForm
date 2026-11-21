import { describe, expect, it } from 'vitest';
import { UPLOAD_ERROR_MESSAGES, UploadValidationError } from './errors.ts';

describe('UploadValidationError', () => {
  it.each([
    ['FILE_TOO_LARGE', 400],
    ['INVALID_IMAGE', 400],
    ['UNSUPPORTED_MEDIA_TYPE', 415],
  ] as const)('maps %s to HTTP %i with its fixed message', (code, status) => {
    const err = new UploadValidationError(code, 'file');

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UploadValidationError);
    expect(err.name).toBe('UploadValidationError');
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.field).toBe('file');
    expect(err.message).toBe(UPLOAD_ERROR_MESSAGES[code]);
  });

  it('records the thumbnail part as the field', () => {
    expect(new UploadValidationError('INVALID_IMAGE', 'thumbnail').field).toBe('thumbnail');
  });

  it('lists the allowed formats in the unsupported-type message', () => {
    expect(new UploadValidationError('UNSUPPORTED_MEDIA_TYPE', 'file').message).toMatch(
      /JPEG, PNG, WebP/,
    );
  });

  it('uses only fixed messages, so nothing client-supplied can appear in them', () => {
    const messages = Object.values(UPLOAD_ERROR_MESSAGES);
    for (const message of messages) {
      expect(message).not.toMatch(/[<>]/);
    }
    expect(new Set(messages).size).toBe(messages.length);
  });
});
