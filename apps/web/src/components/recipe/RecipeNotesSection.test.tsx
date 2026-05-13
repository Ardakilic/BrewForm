import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeNotesSection } from './RecipeNotesSection';

vi.mock('../../api/index.ts', () => ({
  recipeApi: {
    saveNotes: vi.fn(),
  },
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

import { recipeApi } from '../../api/index.ts';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockRecipeApi = vi.mocked(recipeApi);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'recipe.personalNotes': 'Personal Notes',
    'recipe.notes.placeholder': 'Add your personal notes about this recipe...',
    'recipe.notes.saved': 'Notes saved!',
    'common.save': 'Save',
    'common.loading': 'Loading...',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

describe('RecipeNotesSection', () => {
  it('renders textarea with initial notes', () => {
    render(<RecipeNotesSection recipeId='recipe-1' initialNotes='Test notes' />);

    expect(screen.getByRole('textbox')).toHaveValue('Test notes');
    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
  });

  it('updates textarea value on change', async () => {
    render(<RecipeNotesSection recipeId='recipe-1' initialNotes='' />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'New notes');

    expect(textarea).toHaveValue('New notes');
  });

  it('calls saveNotes API when save button is clicked', async () => {
    mockRecipeApi.saveNotes.mockResolvedValue({});

    render(<RecipeNotesSection recipeId='recipe-1' initialNotes='Notes to save' />);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockRecipeApi.saveNotes).toHaveBeenCalledWith('recipe-1', 'Notes to save');
    });
  });

  it('shows saved message after successful save', async () => {
    mockRecipeApi.saveNotes.mockResolvedValue({});

    render(<RecipeNotesSection recipeId='recipe-1' initialNotes='' />);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Notes saved!')).toBeInTheDocument();
    });
  });

  it('disables save button while saving', async () => {
    mockRecipeApi.saveNotes.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

    render(<RecipeNotesSection recipeId='recipe-1' initialNotes='' />);

    const saveButton = screen.getByRole('button', { name: 'Save' });
    await userEvent.click(saveButton);

    expect(saveButton).toBeDisabled();
  });
});
