import { describe, expect, it } from 'vitest';
import { ApiError } from './client.ts';

function formatApiError(err: unknown): string {
  if (err instanceof ApiError && err.details) {
    const messages = err.details.map((d) => `${d.field}: ${d.message}`);
    return messages.join('\n');
  }
  const message = err instanceof Error ? err.message : 'Request failed';
  return message;
}

describe('error display pattern (RecipeCreatePage / RecipeEditPage)', () => {
  it('should format structured validation errors with field: message', () => {
    const err = new ApiError('VALIDATION_ERROR', 'Validation failed', [
      { field: 'title', message: 'Required' },
      { field: 'brewMethod', message: 'Invalid method' },
    ], 400);

    const result = formatApiError(err);
    expect(result).toBe('title: Required\nbrewMethod: Invalid method');
  });

  it('should fall back to message when no details', () => {
    const err = new ApiError('NOT_FOUND', 'Recipe not found', undefined, 404);
    const result = formatApiError(err);
    expect(result).toBe('Recipe not found');
  });

  it('should handle generic Error', () => {
    const err = new Error('Network error');
    const result = formatApiError(err);
    expect(result).toBe('Network error');
  });

  it('should handle unknown error', () => {
    const result = formatApiError('some string');
    expect(result).toBe('Request failed');
  });
});
