import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => mockLogger,
}));

vi.mock('react-router', () => ({
  useNavigate: vi.fn(),
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(() => ({ t: (k: string) => k })),
}));

vi.mock('../../api/client.ts', () => ({
  ApiError: class ApiError extends Error {
    details: { field: string; message: string }[];
    constructor(details: { field: string; message: string }[]) {
      super('Api Error');
      this.details = details;
    }
  },
}));

vi.mock('../../api/index.ts', () => ({
  beanApi: { get: vi.fn() },
  equipmentApi: { list: vi.fn().mockResolvedValue([]) },
  recipeApi: { create: vi.fn() },
  setupApi: { list: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

vi.mock('../../components/taste/TasteAutocomplete.tsx', () => ({
  TasteAutocomplete: vi.fn(() => null),
}));

import { RecipeCreatePage } from './RecipeCreatePage.tsx';

describe('RecipeCreatePage — mount/unmount logging', () => {
  beforeEach(() => {
    mockLogger.debug.mockClear();
  });

  it('logs mount message on render', () => {
    render(<RecipeCreatePage />);
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeCreatePage mounted');
  });

  it('logs unmount message on cleanup', () => {
    const { unmount } = render(<RecipeCreatePage />);
    mockLogger.debug.mockClear();
    unmount();
    expect(mockLogger.debug).toHaveBeenCalledWith({}, 'RecipeCreatePage unmounted');
  });
});
