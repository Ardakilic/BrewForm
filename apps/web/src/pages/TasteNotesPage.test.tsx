import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TasteNotesPage } from './TasteNotesPage';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock('../components/seo/SEOHead', () => ({
  SEOHead: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="seo-head" data-title={title} data-description={description} />
  ),
}));

vi.mock('../contexts/I18nContext', () => ({
  useTranslation: vi.fn(),
}));

const mockApiGet = vi.fn();
vi.mock('../api/index.ts', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

import { useTranslation } from '../contexts/I18nContext';

const mockUseTranslation = vi.mocked(useTranslation);

const mockHierarchy = [
  {
    id: '1',
    name: 'Fruity',
    color: '#DA1D23',
    definition: 'A sweet, floral, aromatic blend of a variety of ripe fruits.',
    depth: 0,
    parentId: null,
    children: [
      {
        id: '2',
        name: 'Berry',
        color: '#DD4C51',
        definition: 'The sweet, sour, floral, sometimes heavy aromatic associated with berries.',
        depth: 1,
        parentId: '1',
        children: [
          { id: '3', name: 'Raspberry', color: '#E52968', definition: 'Sharp, tart, and floral berry note.', depth: 2, parentId: '2', children: [] },
          { id: '4', name: 'Blueberry', color: '#6469B0', definition: 'Mild, sweet berry with jammy character.', depth: 2, parentId: '2', children: [] },
        ],
      },
      {
        id: '5',
        name: 'Citrus Fruit',
        color: '#F7A129',
        definition: 'Bright, acidic, and zesty fruit notes.',
        depth: 1,
        parentId: '1',
        children: [
          { id: '6', name: 'Lemon', color: '#FDE402', definition: 'Sharp, clean citrus acidity.', depth: 2, parentId: '5', children: [] },
        ],
      },
    ],
  },
  {
    id: '7',
    name: 'Roasted',
    color: '#C94930',
    definition: 'Dark, smoky, and toasted notes from the roast process.',
    depth: 0,
    parentId: null,
    children: [],
  },
];

const enT = (key: string) => {
  const map: Record<string, string> = {
    'page.tasteNotes': 'Taste Notes',
    'page.tasteNotes.description': 'Explore the SCAA flavor wheel taste notes.',
    'taste.reference': 'Reference: notbadcoffee.com/flavor-wheel-en/',
    'common.loading': 'Loading...',
    'taste.showDefinition': 'Show definition',
    'taste.hideDefinition': 'Hide definition',
    'taste.searchPlaceholder': 'Search taste notes...',
    'taste.noResults': 'No taste notes match your search.',
    'taste.leafCount': '{{count}} recipes',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'page.tasteNotes': 'Tadım Notları',
    'page.tasteNotes.description': 'SCAA lezzet çarkı tadım notlarını keşfedin.',
    'taste.reference': 'Referans: notbadcoffee.com/flavor-wheel-en/',
    'common.loading': 'Yükleniyor...',
    'taste.showDefinition': 'Tanımı göster',
    'taste.hideDefinition': 'Tanımı gizle',
    'taste.searchPlaceholder': 'Tadım notlarında ara...',
    'taste.noResults': 'Aramanızla eşleşen tadım notu bulunamadı.',
    'taste.leafCount': '{{count}} tarif',
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
  mockApiGet.mockResolvedValue(mockHierarchy);
});

describe('TasteNotesPage — loading state', () => {
  it('renders loading text when data has not loaded yet', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));

    render(<TasteNotesPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('TasteNotesPage — rendered hierarchy', () => {
  it('renders root categories with their names after data loads', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
      expect(screen.getByText('Roasted')).toBeInTheDocument();
    });
  });

  it('renders child categories nested under their parents', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Berry')).toBeInTheDocument();
      expect(screen.getByText('Citrus Fruit')).toBeInTheDocument();
    });
  });

  it('renders leaf notes like Raspberry, Blueberry, Lemon', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
      expect(screen.getByText('Blueberry')).toBeInTheDocument();
      expect(screen.getByText('Lemon')).toBeInTheDocument();
    });
  });
});

describe('TasteNotesPage — color swatches', () => {
  it('renders color swatches on category cards using the color from API data', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      const swatches = document.querySelectorAll('[data-color-swatch]');
      expect(swatches.length).toBeGreaterThan(0);
    });

    const fruityCard = screen.getByText('Fruity').closest('[data-category-card]');
    const swatch = fruityCard?.querySelector('[data-color-swatch]');
    expect(swatch).toHaveStyle({ backgroundColor: '#DA1D23' });
  });
});

describe('TasteNotesPage — definition toggle', () => {
  it('shows "Show definition" button and clicking it reveals definition text', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    const showDefButton = screen.getAllByText('Show definition')[0];
    expect(showDefButton).toBeInTheDocument();

    fireEvent.click(showDefButton);

    expect(screen.getByText('A sweet, floral, aromatic blend of a variety of ripe fruits.')).toBeInTheDocument();
  });

  it('toggles button text to "Hide definition" after clicking', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByText('Show definition')[0]);

    expect(screen.getAllByText('Hide definition')[0]).toBeInTheDocument();
  });
});

describe('TasteNotesPage — search filter', () => {
  it('filters displayed categories when typing in the search input', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    fireEvent.change(searchInput, { target: { value: 'Berry' } });

    expect(screen.getByText('Berry')).toBeInTheDocument();
    expect(screen.queryByText('Roasted')).not.toBeInTheDocument();
    expect(screen.queryByText('Citrus Fruit')).not.toBeInTheDocument();
  });
});

describe('TasteNotesPage — no results', () => {
  it('shows no-results message when search matches nothing', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search taste notes...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });

    expect(screen.getByText('No taste notes match your search.')).toBeInTheDocument();
  });
});

describe('TasteNotesPage — i18n', () => {
  it('renders page heading and description in English', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Taste Notes')).toBeInTheDocument();
    });

    expect(screen.getByText('Explore the SCAA flavor wheel taste notes.')).toBeInTheDocument();
  });

  it('renders Turkish text when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Tadım Notları')).toBeInTheDocument();
    });

    expect(screen.getByText('SCAA lezzet çarkı tadım notlarını keşfedin.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Tadım notlarında ara...')).toBeInTheDocument();
  });

  it('renders "Show definition" text in Turkish when locale is tr', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Tanımı göster')[0]).toBeInTheDocument();
  });
});

describe('TasteNotesPage — SEOHead', () => {
  it('includes SEOHead component with correct title and description', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByTestId('seo-head')).toBeInTheDocument();
    });

    const seoHead = screen.getByTestId('seo-head');
    expect(seoHead).toHaveAttribute('data-title', 'Taste Notes');
    expect(seoHead).toHaveAttribute('data-description', 'Explore the SCAA flavor wheel taste notes on BrewForm.');
  });
});

describe('TasteNotesPage — leaf note chips', () => {
  it('renders leaf notes as clickable link elements', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const raspberryLink = screen.getByRole('link', { name: 'Raspberry' });
    expect(raspberryLink).toBeInTheDocument();
    expect(raspberryLink).toHaveAttribute('href', '/recipes?tasteNoteIds=3');
  });

  it('parent categories link with comma-separated child leaf IDs', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Berry')).toBeInTheDocument();
    });

    const berryLink = screen.getByRole('link', { name: 'Berry' });
    expect(berryLink).toHaveAttribute('href', '/recipes?tasteNoteIds=3,4');
  });

  it('root category includes all descendant leaf IDs', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });

    const fruityLink = screen.getByRole('link', { name: 'Fruity' });
    expect(fruityLink).toHaveAttribute('href', '/recipes?tasteNoteIds=3,4,6');
  });
});

describe('TasteNotesPage — empty/error state', () => {
  it('renders empty state when API returns an empty array', async () => {
    mockApiGet.mockResolvedValue([]);

    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('Fruity')).not.toBeInTheDocument();
  });

  it('handles API failure gracefully without crashing', async () => {
    mockApiGet.mockRejectedValue(new Error('Network error'));

    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Taste Notes')).toBeInTheDocument();
  });
});
