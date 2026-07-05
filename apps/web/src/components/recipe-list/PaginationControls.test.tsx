import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationControls } from './PaginationControls.tsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaginationControls', () => {
  it('should hide the Previous button on page 1', () => {
    render(
      <PaginationControls
        page={1}
        totalPages={5}
        onPageChange={vi.fn()}
        previousLabel='Previous'
        nextLabel='Next'
        pageLabel='Page {page} of {total}'
      />,
    );
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
  });

  it('should hide the Next button on the last page', () => {
    render(
      <PaginationControls
        page={5}
        totalPages={5}
        onPageChange={vi.fn()}
        previousLabel='Previous'
        nextLabel='Next'
        pageLabel='Page {page} of {total}'
      />,
    );
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('should call onPageChange(page - 1) when Previous is clicked', async () => {
    const onPageChange = vi.fn();
    render(
      <PaginationControls
        page={3}
        totalPages={5}
        onPageChange={onPageChange}
        previousLabel='Previous'
        nextLabel='Next'
        pageLabel='Page {page} of {total}'
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Previous'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('should call onPageChange(page + 1) when Next is clicked', async () => {
    const onPageChange = vi.fn();
    render(
      <PaginationControls
        page={3}
        totalPages={5}
        onPageChange={onPageChange}
        previousLabel='Previous'
        nextLabel='Next'
        pageLabel='Page {page} of {total}'
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Next'));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it('should substitute {page} and {total} placeholders in the page label', () => {
    render(
      <PaginationControls
        page={2}
        totalPages={5}
        onPageChange={vi.fn()}
        previousLabel='Previous'
        nextLabel='Next'
        pageLabel='Page {page} of {total}'
      />,
    );
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('should render the previous and next labels verbatim', () => {
    render(
      <PaginationControls
        page={3}
        totalPages={5}
        onPageChange={vi.fn()}
        previousLabel='Önceki'
        nextLabel='Sonraki'
        pageLabel='Sayfa {page}/{total}'
      />,
    );
    expect(screen.getByText('Önceki')).toBeInTheDocument();
    expect(screen.getByText('Sonraki')).toBeInTheDocument();
  });
});
