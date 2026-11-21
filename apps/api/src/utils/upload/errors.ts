/**
 * Typed upload validation failure (ADR-019).
 *
 * The photo controller maps it to the error envelope with
 * `details: [{ field, message }]`. Messages are fixed, server-authored strings:
 * they never echo the client's declared type, filename or bytes.
 */

/** Validation failure codes for an uploaded image part. */
export type UploadValidationCode = 'FILE_TOO_LARGE' | 'INVALID_IMAGE' | 'UNSUPPORTED_MEDIA_TYPE';

/** The multipart part that failed validation. */
export type UploadPartField = 'file' | 'thumbnail';

/** HTTP status for each upload validation code. */
export const UPLOAD_ERROR_STATUS: Readonly<Record<UploadValidationCode, 400 | 415>> = Object.freeze(
  {
    FILE_TOO_LARGE: 400,
    INVALID_IMAGE: 400,
    UNSUPPORTED_MEDIA_TYPE: 415,
  },
);

/** Fixed, client-safe message for each upload validation code. */
export const UPLOAD_ERROR_MESSAGES: Readonly<Record<UploadValidationCode, string>> = Object.freeze({
  FILE_TOO_LARGE: 'Image file is too large',
  INVALID_IMAGE: 'Image is malformed or its dimensions are out of range',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported image type. Allowed formats: JPEG, PNG, WebP',
});

/**
 * A rejected upload part: carries the error `code`, its HTTP `status`, the
 * offending part (`field`) and a fixed safe `message`.
 */
export class UploadValidationError extends Error {
  /** Error envelope code. */
  readonly code: UploadValidationCode;
  /** HTTP status (400 or 415). */
  readonly status: 400 | 415;
  /** The multipart part that failed (`file` or `thumbnail`). */
  readonly field: UploadPartField;

  /**
   * @param code - The validation failure code.
   * @param field - The multipart part that failed.
   */
  constructor(code: UploadValidationCode, field: UploadPartField) {
    super(UPLOAD_ERROR_MESSAGES[code]);
    this.name = 'UploadValidationError';
    this.code = code;
    this.status = UPLOAD_ERROR_STATUS[code];
    this.field = field;
  }
}
