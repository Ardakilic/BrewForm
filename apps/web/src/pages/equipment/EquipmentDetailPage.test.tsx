import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { EquipmentDetailPage } from './EquipmentDetailPage.tsx';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/utils/logger.ts', () => ({ createLogger: () => mockLogger }));

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
  useParams: vi.fn(),
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

vi.mock('../../components/seo/SEOHead.tsx', () => ({
  SEOHead: vi.fn(() => null),
}));

import { useParams } from 'react-router';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { api } from '../../api/client.ts';
import { SEOHead } from '../../components/seo/SEOHead.tsx';

const mockUseParams = vi.mocked(useParams);
const mockUseTranslation = vi.mocked(useTranslation);
const mockApiGet = vi.mocked(api.get);
const mockSEOHead = vi.mocked(SEOHead);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'equipment.error.notFound': 'Equipment not found',
    'equipment.backToList': 'Back to equipment list',
    'equipment.recipesUsing': 'Recipes using this equipment',
    'equipment.noRecipes': 'No recipes use this equipment yet.',
    'equipment.catalog.title': 'Coffee Equipment',
    'recipe.focusMode.by': 'by',
    'recipe.card.by': 'by',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'equipment.error.notFound': 'Ekipman bulunamadı',
    'equipment.backToList': 'Ekipman listesine dön',
    'equipment.recipesUsing': 'Bu ekipmanı kullanan tarifler',
    'equipment.noRecipes': 'Bu ekipmanı kullanan tarif henüz yok.',
    'equipment.catalog.title': 'Kahve Ekipmanları',
    'recipe.focusMode.by': 'tarafından',
    'recipe.card.by': 'tarafından',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const mockEquipment = {
  id: 'eq-1',
  name: 'Stagg EKG',
  brand: 'Fellow',
  model: 'Stagg EKG',
  type: 'kettle',
  description: 'Electric pour-over kettle with temperature control',
};

const mockRecipes = {
  data: [
    {
      id: 'r1',
      slug: 'my-espresso',
      title: 'My Espresso',
      authorId: 'u1',
      visibility: 'public',
      currentVersionId: 'v1',
      author: { username: 'coffeelover', displayName: 'Coffee Lover', avatarUrl: null },
      likeCount: 5,
      commentCount: 2,
      forkCount: 0,
      forkedFromId: null,
      featured: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockUseParams.mockReturnValue({ id: 'eq-1' });
  mockUseTranslation.mockReturnValue(defaultTranslation);
  (mockApiGet as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(mockEquipment)
    .mockResolvedValueOnce(mockRecipes);
});

/** Tests for EquipmentDetailPage — loading, error, brand/model, description, recipes, breadcrumb, SEO props, and i18n. */
describe('EquipmentDetailPage', () => {
  it('logs mount and unmount', async () => {
    const { unmount } = render(<EquipmentDetailPage />);
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentDetailPage mounted')
    );
    unmount();
    await waitFor(() =>
      expect(mockLogger.debug).toHaveBeenCalledWith({}, 'EquipmentDetailPage unmounted')
    );
  });

  it('shows loading skeleton while fetching', () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<EquipmentDetailPage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders equipment details when data loads — English', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    expect(screen.getAllByText('Fellow').length).toBe(1);
    expect(screen.getByText('Electric pour-over kettle with temperature control'))
      .toBeInTheDocument();
    expect(screen.getByText('kettle')).toBeInTheDocument();
  });

  it('renders brand and model as title', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    expect(screen.getAllByText('Fellow').length).toBeGreaterThan(0);
  });

  it('uses name when brand is null', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockEquipment, brand: null, model: null })
      .mockResolvedValueOnce(mockRecipes);
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );
  });

  it('renders type badge', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() => expect(screen.getByText('kettle')).toBeInTheDocument());
  });

  it('converts underscores in type badge to spaces', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockEquipment, type: 'pour_over_brewer' })
      .mockResolvedValueOnce(mockRecipes);
    render(<EquipmentDetailPage />);

    await waitFor(() => expect(screen.getByText('pour over brewer')).toBeInTheDocument());
  });

  it('shows error state when API fails', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<EquipmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Equipment not found')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Back to equipment list' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'EquipmentDetailPage loadData failed',
    );
  });

  it('shows error state in Turkish', async () => {
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    render(<EquipmentDetailPage />);

    await waitFor(() => expect(screen.getByText('Ekipman bulunamadı')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ekipman listesine dön' })).toBeInTheDocument();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'EquipmentDetailPage loadData failed',
    );
  });

  it('renders recipes section', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('Recipes using this equipment')).toBeInTheDocument()
    );
    expect(screen.getByText('My Espresso')).toBeInTheDocument();
  });

  it('renders each recipe via the shared RecipeCard with a clickable author button', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() => expect(screen.getByText('My Espresso')).toBeInTheDocument());

    // RecipeCard wraps the title in a link to /recipes/:slug
    const link = screen.getByText('My Espresso').closest('a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/recipes/my-espresso');

    // The author is now a clickable button (canonical stopPropagation AuthorButton)
    expect(screen.getByRole('button', { name: 'Coffee Lover' })).toBeInTheDocument();
  });

  it('shows empty recipes message when no recipes', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockEquipment)
      .mockResolvedValueOnce({ data: [] });
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('No recipes use this equipment yet.')).toBeInTheDocument()
    );
  });

  it('passes title to SEOHead', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as {
      title?: string;
      description?: string;
      canonical?: string;
    };
    expect(lastProps.title).toBe('Fellow Stagg EKG');
  });

  it('passes description to SEOHead from equipment.description', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { description?: string };
    expect(lastProps.description).toBe('Electric pour-over kettle with temperature control');
  });

  it('passes canonical URL to SEOHead', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { canonical?: string };
    expect(lastProps.canonical).toContain('/equipment/eq-1');
  });

  it('falls back to brand+type description when no description', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockEquipment, description: null })
      .mockResolvedValueOnce(mockRecipes);
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    const calls = mockSEOHead.mock.calls;
    const lastProps = calls[calls.length - 1][0] as { description?: string };
    expect(lastProps.description).toBe('Fellow kettle');
  });

  it('renders breadcrumb with link to catalog', async () => {
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    expect(screen.getByRole('link', { name: 'Coffee Equipment' })).toHaveAttribute(
      'href',
      '/equipments',
    );
  });

  it('hides description section when no description', async () => {
    (mockApiGet as ReturnType<typeof vi.fn>).mockReset();
    (mockApiGet as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ...mockEquipment, description: null })
      .mockResolvedValueOnce(mockRecipes);
    render(<EquipmentDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Stagg EKG' })).toBeInTheDocument()
    );

    expect(screen.queryByText('Electric pour-over kettle with temperature control')).not
      .toBeInTheDocument();
  });
});
