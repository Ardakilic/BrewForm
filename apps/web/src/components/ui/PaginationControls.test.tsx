import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationControls } from './PaginationControls.tsx';
import { I18nProvider } from '../../contexts/I18nContext.tsx';

function renderControls(props: Parameters<typeof PaginationControls>[0]) {
  return render(
    <I18nProvider>
      <PaginationControls {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaginationControls', () => {
  it('should hide the Previous button on page 1', () => {
    renderControls({ page: 1, totalPages: 5, onPageChange: vi.fn() });
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
  });

  it('should hide the Next button on the last page', () => {
    renderControls({ page: 5, totalPages: 5, onPageChange: vi.fn() });
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('should call onPageChange(page - 1) when Previous is clicked', async () => {
    const onPageChange = vi.fn();
    renderControls({ page: 3, totalPages: 5, onPageChange });
    const user = userEvent.setup();
    await user.click(screen.getByText('Previous'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('should call onPageChange(page + 1) when Next is clicked', async () => {
    const onPageChange = vi.fn();
    renderControls({ page: 3, totalPages: 5, onPageChange });
    const user = userEvent.setup();
    await user.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('should substitute {page} and {total} placeholders in the default page label', () => {
    renderControls({ page: 2, totalPages: 5, onPageChange: vi.fn() });
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('should honour explicit label overrides', () => {
    renderControls({
      page: 3,
      totalPages: 5,
      onPageChange: vi.fn(),
      previousLabel: 'Önceki',
      nextLabel: 'Sonraki',
      pageLabel: 'Sayfa {page}/{total}',
    });
    expect(screen.getByText('Önceki')).toBeInTheDocument();
    expect(screen.getByText('Sonraki')).toBeInTheDocument();
    expect(screen.getByText('Sayfa 3/5')).toBeInTheDocument();
  });

  it('disable variant keeps both buttons rendered but disabled at the boundaries', () => {
    renderControls({ page: 1, totalPages: 5, onPageChange: vi.fn(), variant: 'disable' });
    const prev = screen.getByText('Previous') as HTMLButtonElement;
    const next = screen.getByText('Next') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('disable variant disables Next on the last page', () => {
    renderControls({ page: 5, totalPages: 5, onPageChange: vi.fn(), variant: 'disable' });
    const prev = screen.getByText('Previous') as HTMLButtonElement;
    const next = screen.getByText('Next') as HTMLButtonElement;
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('hides the page label when showPageLabel is false', () => {
    renderControls({ page: 2, totalPages: 5, onPageChange: vi.fn(), showPageLabel: false });
    expect(screen.queryByText('Page 2 of 5')).not.toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });
});
