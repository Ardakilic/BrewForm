import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TasteNotesPage } from './TasteNotesPage.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('@base-ui/react/popover', () => {
  const PopoverRoot = ({ children }: { children: React.ReactNode }) => {
    const [open, setOpen] = React.useState(false);
    return (
      <span
        data-popover-root
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {React.Children.map(children, (child) => {
          if (
            React.isValidElement(child) && (child.type as any)?.displayName === 'PopoverTrigger'
          ) {
            return React.cloneElement(child as React.ReactElement<any>, {
              onClick: () => setOpen((prev: boolean) => !prev),
              'data-open': open,
            });
          }
          if (React.isValidElement(child) && (child.type as any)?.displayName === 'PopoverPortal') {
            return open ? child : null;
          }
          return child;
        })}
      </span>
    );
  };

  const PopoverTrigger = (
    { children, openOnHover: _openOnHover, delay: _delay, ...props }: any,
  ) => {
    const Comp = 'span' as any;
    return <Comp data-popover-trigger {...props}>{children}</Comp>;
  };
  PopoverTrigger.displayName = 'PopoverTrigger';

  const PopoverPortal = ({ children }: any) => <>{children}</>;
  PopoverPortal.displayName = 'PopoverPortal';

  const PopoverPositioner = ({ children }: any) => <div data-popover-positioner>{children}</div>;
  const PopoverPopup = ({ children, className, ...props }: any) => (
    <div className={className} data-popover-popup {...props}>{children}</div>
  );
  const PopoverArrow = ({ className }: any) => <div className={className} data-popover-arrow />;
  const PopoverDescription = ({ children, className, ...props }: any) => (
    <div className={className} data-popover-description {...props}>{children}</div>
  );

  return {
    Popover: {
      Root: PopoverRoot,
      Trigger: PopoverTrigger,
      Portal: PopoverPortal,
      Positioner: PopoverPositioner,
      Popup: PopoverPopup,
      Arrow: PopoverArrow,
      Description: PopoverDescription,
    },
  };
});

vi.mock('../components/seo/SEOHead', () => ({
  SEOHead: ({ title, description }: { title: string; description: string }) => (
    <div data-testid='seo-head' data-title={title} data-description={description} />
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

import { useTranslation } from '../contexts/I18nContext.tsx';

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
          {
            id: '3',
            name: 'Raspberry',
            color: '#E52968',
            definition: 'Sharp, tart, and floral berry note.',
            depth: 2,
            parentId: '2',
            children: [],
          },
          {
            id: '4',
            name: 'Blueberry',
            color: '#6469B0',
            definition: 'Mild, sweet berry with jammy character.',
            depth: 2,
            parentId: '2',
            children: [],
          },
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
          {
            id: '6',
            name: 'Lemon',
            color: '#FDE402',
            definition: 'Sharp, clean citrus acidity.',
            depth: 2,
            parentId: '5',
            children: [],
          },
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
    'taste.searchPlaceholder': 'Search taste notes...',
    'taste.noResults': 'No taste notes match your search.',
    'taste.leafCount': '{count} recipes',
    'taste.infoIconHint': 'Click the info icons next to taste names to see their description.',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'page.tasteNotes': 'Tadım Notları',
    'page.tasteNotes.description': 'SCAA lezzet çarkı tadım notlarını keşfedin.',
    'taste.reference': 'Referans: notbadcoffee.com/flavor-wheel-en/',
    'common.loading': 'Yükleniyor...',
    'taste.searchPlaceholder': 'Tadım notlarında ara...',
    'taste.noResults': 'Aramanızla eşleşen tadım notu bulunamadı.',
    'taste.leafCount': '{count} tarif',
    'taste.infoIconHint':
      'Tat isimlerinin yanındaki bilgi simgelerine tıklayarak açıklamalarını görebilirsiniz.',
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
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUseTranslation.mockReturnValue(defaultTranslation);
  mockApiGet.mockResolvedValue(mockHierarchy);
});

describe('TasteNotesPage — logging', () => {
  it('logs mount and unmount', async () => {
    mockApiGet.mockResolvedValue(mockHierarchy);
    const { unmount } = render(<TasteNotesPage />);
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'TasteNotesPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'TasteNotesPage unmounted')
    );
  });
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

  it('renders info icon hint in English', async () => {
    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Taste Notes')).toBeInTheDocument();
    });

    expect(screen.getByText(/Click the info icons/)).toBeInTheDocument();
  });

  it('renders info icon hint in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<TasteNotesPage />);

    await waitFor(() => {
      expect(screen.getByText('Tadım Notları')).toBeInTheDocument();
    });

    expect(screen.getByText(/bilgi simgelerine/)).toBeInTheDocument();
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
    expect(seoHead).toHaveAttribute(
      'data-description',
      'Explore the SCAA flavor wheel taste notes on BrewForm.',
    );
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
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'TasteNotesPage loadData failed',
    );
  });
});

describe('TasteNotesPage — info icons for definitions', () => {
  it('renders info icon next to leaf notes that have definitions', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    expect(triggers.length).toBeGreaterThan(0);

    const raspberryTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Raspberry'),
    );
    expect(raspberryTrigger).toBeTruthy();
  });

  it('renders info icon next to subcategories that have definitions', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Berry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    const berryTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Berry'),
    );
    expect(berryTrigger).toBeTruthy();

    const citrusTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Citrus Fruit'),
    );
    expect(citrusTrigger).toBeTruthy();
  });

  it('renders the correct number of info icons (one per root, subcategory, and leaf with definition)', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    // 2 root categories (Fruity, Roasted) + 2 subcategories (Berry, Citrus Fruit) + 3 leaves (Raspberry, Blueberry, Lemon) = 7
    expect(triggers.length).toBe(7);
  });

  it('root categories now have info icons instead of toggle buttons', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Fruity')).toBeInTheDocument();
    });
    const triggers = document.querySelectorAll('[data-popover-trigger]');
    const fruityTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Fruity'),
    );
    expect(fruityTrigger).toBeTruthy();
  });
});

describe('TasteNotesPage — definition popover interaction', () => {
  it('shows definition text when hovering the info icon', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    const raspberryTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Raspberry'),
    )!;
    expect(raspberryTrigger).toBeTruthy();

    fireEvent.mouseEnter(raspberryTrigger.closest('[data-popover-root]')!);

    await waitFor(() => {
      expect(screen.getByText('Sharp, tart, and floral berry note.')).toBeInTheDocument();
    });
  });

  it('shows definition text on click (mobile tap simulation)', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    const raspberryTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Raspberry'),
    )!;

    fireEvent.click(raspberryTrigger);

    await waitFor(() => {
      expect(screen.getByText('Sharp, tart, and floral berry note.')).toBeInTheDocument();
    });
  });

  it('link still navigates — clicking chip name does not trigger popover', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Raspberry')).toBeInTheDocument();
    });

    const raspberryLink = screen.getByRole('link', { name: 'Raspberry' });
    expect(raspberryLink).toHaveAttribute('href', '/recipes?tasteNoteIds=3');

    expect(screen.queryByText('Sharp, tart, and floral berry note.')).not.toBeInTheDocument();
  });

  it('subcategory popover shows correct definition text', async () => {
    render(<TasteNotesPage />);
    await waitFor(() => {
      expect(screen.getByText('Berry')).toBeInTheDocument();
    });

    const triggers = document.querySelectorAll('[data-popover-trigger]');
    const berryTrigger = Array.from(triggers).find(
      (t) => t.getAttribute('aria-label')?.includes('Berry'),
    )!;

    fireEvent.mouseEnter(berryTrigger.closest('[data-popover-root]')!);

    await waitFor(() => {
      expect(
        screen.getByText(
          'The sweet, sour, floral, sometimes heavy aromatic associated with berries.',
        ),
      ).toBeInTheDocument();
    });
  });
});
