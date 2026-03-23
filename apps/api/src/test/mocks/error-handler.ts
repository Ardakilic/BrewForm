/**
 * Mock for src/middleware/errorHandler.ts
 * Redirected via import_map.json during deno test runs.
 */

export class NotFoundError extends Error {
  statusCode = 404;
  code = "NOT_FOUND";
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = "UNAUTHORIZED";
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  code = "FORBIDDEN";
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  code = "BAD_REQUEST";
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = "CONFLICT";
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  statusCode = 422;
  code = "VALIDATION_ERROR";
  constructor(_errors: Array<{ field: string; message: string }>) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

// deno-lint-ignore no-explicit-any
export function errorHandler(_err: unknown, _c: any): void {}
