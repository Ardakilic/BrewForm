import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { StarRating } from './StarRating.tsx';

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * StarRating — five-star rating display on a 1–10 half-star scale with
 * hover preview and optional community-vote count. Clicking reports the
 * hovered value via `onRate` when `interactive` is true.
 */
describe('StarRating', () => {
  it('renders exactly 5 star SVGs', () => {
    const { container } = render(<StarRating value={6} />);
    const stars = container.querySelectorAll('svg');
    expect(stars).toHaveLength(5);
  });

  it('renders the numeric label for a whole-number value', () => {
    render(<StarRating value={6} />);
    // 6/2 = 3 stars → "3★"
    expect(screen.getByText('3★')).toBeInTheDocument();
  });

  it('renders the numeric label for a half-star value', () => {
    render(<StarRating value={7} />);
    // 7/2 = 3.5 → "3.5★"
    expect(screen.getByText('3.5★')).toBeInTheDocument();
  });

  it('renders "—" in read-only mode when value is null', () => {
    render(<StarRating value={null} interactive={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders no numeric label in interactive mode when value is null', () => {
    render(<StarRating value={null} interactive />);
    // interactive + null value → empty string label (no "—")
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('shows the community vote count when count is provided', () => {
    render(<StarRating value={6} count={5} />);
    expect(screen.getByText(/5 community votes/i)).toBeInTheDocument();
  });

  it('shows "No community votes yet" when count is 0', () => {
    render(<StarRating value={6} count={0} />);
    expect(screen.getByText(/No community votes yet/i)).toBeInTheDocument();
  });

  it('uses singular "vote" when count is 1', () => {
    render(<StarRating value={6} count={1} />);
    expect(screen.getByText(/1 community vote/i)).toBeInTheDocument();
  });

  it('does NOT call onRate in read-only mode on click', () => {
    const onRate = vi.fn();
    const { container } = render(<StarRating value={6} onRate={onRate} interactive={false} />);
    const starDivs = container.querySelectorAll('.flex > div');
    fireEvent.click(starDivs[0]);
    expect(onRate).not.toHaveBeenCalled();
  });

  it('calls onRate with the clicked star value in interactive mode (right half → full star)', () => {
    const onRate = vi.fn();
    const { container } = render(<StarRating value={6} onRate={onRate} interactive />);
    const starDivs = container.querySelectorAll('.flex > div');
    // Mock getBoundingClientRect so the click lands in the right half (x > width/2)
    const original = starDivs[2].getBoundingClientRect.bind(starDivs[2]);
    starDivs[2].getBoundingClientRect = () => ({
      ...original(),
      left: 0,
      width: 100,
    });
    // Click at x=60 (right half) on star index 3 → value 3*2 = 6
    fireEvent.click(starDivs[2], { clientX: 60 });
    expect(onRate).toHaveBeenCalledWith(6);
  });

  it('calls onRate with the half-star value in interactive mode (left half → half star)', () => {
    const onRate = vi.fn();
    const { container } = render(<StarRating value={6} onRate={onRate} interactive />);
    const starDivs = container.querySelectorAll('.flex > div');
    const original = starDivs[1].getBoundingClientRect.bind(starDivs[1]);
    starDivs[1].getBoundingClientRect = () => ({
      ...original(),
      left: 0,
      width: 100,
    });
    // Click at x=10 (left half) on star index 2 → value 2*2 - 1 = 3
    fireEvent.click(starDivs[1], { clientX: 10 });
    expect(onRate).toHaveBeenCalledWith(3);
  });

  it('applies the cursor-pointer class in interactive mode', () => {
    const { container } = render(<StarRating value={6} interactive />);
    const wrapper = container.querySelector('.flex');
    expect(wrapper?.classList.contains('cursor-pointer')).toBe(true);
  });

  it('applies the cursor-default class in read-only mode', () => {
    const { container } = render(<StarRating value={6} interactive={false} />);
    const wrapper = container.querySelector('.flex');
    expect(wrapper?.classList.contains('cursor-default')).toBe(true);
  });
});
