import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeForkPage } from './RecipeForkPage.tsx';

const mockNavigateFn = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigateFn,
  useParams: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  recipeApi: { get: vi.fn(), fork: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { useParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { recipeApi } from '../../api/index.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockRecipeApi = vi.mocked(recipeApi);
const mockSEOHead = vi.mocked(SEOHead);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.fork': 'Fork Recipe',
    'recipe.forkDescription':
      'Forking creates your own personal copy of this recipe that you can freely modify and build upon.',
    'recipe.forkAriaLabel': 'Fork recipe',
    'common.loading': 'Loading...',
    'common.cancel': 'Cancel',
    'recipe.fork.title': 'Fork Title',
    'recipe.fork.ofTitle': 'Fork of {title}',
    'recipe.fork.forking': 'Forking:',
    'recipe.fork.create': 'Create Fork',
    'recipe.fork.creating': 'Creating Fork...',
    'recipe.fork.seoTitle': 'Fork: {title}',
    'recipe.fork.loadError': 'Failed to load recipe',
    'recipe.fork.forkError': 'Failed to fork recipe',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const sampleRecipe = {
  id: 'recipe-99',
  title: 'Classic Espresso',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({ id: 'recipe-99' });
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockNavigateFn.mockReset();
  mockRecipeApi.get.mockResolvedValue(sampleRecipe as unknown as Record<string, unknown>);
  mockRecipeApi.fork.mockResolvedValue({ id: 'forked-42' } as unknown as Record<string, unknown>);
});

describe('RecipeForkPage — loading state', () => {
  it('shows loading text while fetching source recipe', () => {
    mockRecipeApi.get.mockReturnValue(new Promise(() => {}));

    render(<RecipeForkPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('RecipeForkPage — error state', () => {
  it('shows error message when recipeApi.get fails', async () => {
    mockRecipeApi.get.mockRejectedValue(new Error('Not found'));

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load recipe')).toBeInTheDocument();
    });
  });
});

describe('RecipeForkPage — loaded state', () => {
  it('renders the fork heading via t()', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Fork Recipe' })).toBeInTheDocument();
    });
  });

  it('displays the source recipe title in the preview text', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByText('Forking:', { exact: false })).toBeInTheDocument();
    });
    expect(screen.getByText('Classic Espresso')).toBeInTheDocument();
  });

  it('pre-fills the fork title input with "Fork of <source title>"', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Fork of Classic Espresso');
    });
  });

  it('renders the Fork Title label', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Fork Title')).toBeInTheDocument();
    });
  });

  it('input has maxLength of 200', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('maxLength', '200');
    });
  });

  it('renders Cancel button', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });
});

describe('RecipeForkPage — fork submission', () => {
  it('calls recipeApi.fork with recipe id and trimmed title', async () => {
    const user = userEvent.setup({ delay: null });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(mockRecipeApi.fork).toHaveBeenCalledWith(
        'recipe-99',
        'Fork of Classic Espresso',
      );
    });
  });

  it('calls recipeApi.fork with custom title when user changes input', async () => {
    const user = userEvent.setup({ delay: null });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'My Custom Fork');

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(mockRecipeApi.fork).toHaveBeenCalledWith('recipe-99', 'My Custom Fork');
    });
  });

  it('passes undefined as title when input is empty or only whitespace', async () => {
    const user = userEvent.setup({ delay: null });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '   ');

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(mockRecipeApi.fork).toHaveBeenCalledWith('recipe-99', undefined);
    });
  });

  it('navigates to edit page on successful fork', async () => {
    const user = userEvent.setup({ delay: null });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(mockNavigateFn).toHaveBeenCalledWith('/recipes/forked-42/edit');
    });
  });
});

describe('RecipeForkPage — fork failure', () => {
  it('shows error message when recipeApi.fork fails', async () => {
    const user = userEvent.setup({ delay: null });
    mockRecipeApi.fork.mockRejectedValue(new Error('RECIPE_NOT_FOUND'));

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(screen.getByText('RECIPE_NOT_FOUND')).toBeInTheDocument();
    });
  });

  it('shows fallback error message for non-Error rejection', async () => {
    const user = userEvent.setup({ delay: null });
    mockRecipeApi.fork.mockRejectedValue('unknown error');

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to fork recipe')).toBeInTheDocument();
    });
  });
});

describe('RecipeForkPage — button states during fork', () => {
  it('disables the submit button while forking', async () => {
    const user = userEvent.setup({ delay: null });
    mockRecipeApi.fork.mockReturnValue(new Promise(() => {}));

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    expect(screen.getByRole('button', { name: 'Creating Fork...' })).toBeDisabled();
  });

  it('shows "Creating Fork..." text while forking', async () => {
    const user = userEvent.setup({ delay: null });
    mockRecipeApi.fork.mockReturnValue(new Promise(() => {}));

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Fork' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create Fork' }));

    expect(screen.getByRole('button', { name: 'Creating Fork...' })).toBeInTheDocument();
  });
});

describe('RecipeForkPage — Cancel button', () => {
  it('navigates back when Cancel is clicked', async () => {
    const user = userEvent.setup({ delay: null });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigateFn).toHaveBeenCalledWith(-1);
  });
});

describe('RecipeForkPage — SEO', () => {
  it('passes noIndex to SEOHead', async () => {
    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByText('Classic Espresso')).toBeInTheDocument();
    });

    const calls = mockSEOHead.mock.calls;
    // SEOHead is rendered in the JSX on every render but mock is cleared each test
    // We just verify at least one call includes noIndex
    const callsWithNoIndex = calls.filter(
      (call) => call[0] && (call[0] as { noIndex?: boolean }).noIndex === true,
    );
    expect(callsWithNoIndex.length).toBeGreaterThan(0);
  });
});

describe('RecipeForkPage — i18n', () => {
  it('renders heading in Turkish when locale is tr', async () => {
    const trT = (key: string) => {
      const map: Record<string, string> = {
        'recipe.fork': 'Tarifi Çatalla',
      };
      return map[key] ?? key;
    };

    mockUseTranslation.mockReturnValue({
      ...defaultTranslation,
      locale: 'tr',
      t: trT,
    });

    render(<RecipeForkPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Tarifi Çatalla' })).toBeInTheDocument();
    });
  });
});

describe('RecipeForkPage — missing id param', () => {
  it('shows loading when id param is missing (never loads)', () => {
    mockUseParams.mockReturnValue({ id: undefined });

    render(<RecipeForkPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(mockRecipeApi.get).not.toHaveBeenCalled();
  });
});

describe('RecipeForkPage — title error container', () => {
  it('error div uses error background color', async () => {
    mockRecipeApi.get.mockRejectedValue(new Error('Not found'));

    render(<RecipeForkPage />);

    await waitFor(() => {
      const errorDiv = screen.getByText('Failed to load recipe').closest('div');
      expect(errorDiv).toBeInTheDocument();
      expect(errorDiv!.style.backgroundColor).toBe('var(--error)');
    });
  });
});
