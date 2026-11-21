import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../contexts/I18nContext.tsx';
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

/** Renders inside an I18nProvider with a stored locale. */
function renderInLocale(ui: ReactNode, locale: 'en' | 'tr' = 'en') {
  localStorage.setItem('brewform_locale', locale);
  return render(<I18nProvider>{ui}</I18nProvider>);
}

/** Number of stars drawn in each fill state. */
function fills(container: HTMLElement) {
  return {
    full: container.querySelectorAll('svg[data-fill="full"]').length,
    half: container.querySelectorAll('svg[data-fill="half"]').length,
    empty: container.querySelectorAll('svg[data-fill="empty"]').length,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

/**
 * StarRating — five-star rating on the stored 1–10 half-star scale.
 * Read-only: one labelled `role="img"`. Interactive: one `role="slider"`
 * with whole-star arrows, Shift+arrow half steps, digits, Home/End,
 * Enter/Space commit, Escape revert, blur commit, pointer half clicks and an
 * `aria-disabled` busy state that keeps focus.
 *
 * Feature: wave-6-audit-remediation (t6, chart-rendering)
 */
describe('StarRating — read-only', () => {
  it('renders a single role="img" named "Rated 3.5 out of 5 stars" with no buttons', () => {
    const { container } = renderInLocale(<StarRating value={7} interactive={false} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAccessibleName('Rated 3.5 out of 5 stars');
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(screen.queryByRole('slider')).toBeNull();
    expect(container.querySelector('[tabindex]')).toBeNull();
    expect(screen.getByText('3.5')).toBeInTheDocument();
    expect(fills(container)).toEqual({ full: 3, half: 1, empty: 1 });
  });

  it('uses the locale decimal separator (tr "3,5")', () => {
    renderInLocale(<StarRating value={7} interactive={false} />, 'tr');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('3,5');
    expect(screen.getByText('3,5')).toBeInTheDocument();
  });

  it('hides the star graphics from assistive technology', () => {
    const { container } = renderInLocale(<StarRating value={6} interactive={false} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(5);
    for (const svg of Array.from(svgs)) expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('rounds fractional input so fill and label agree (7.9 → 4 stars, label 4)', () => {
    const { container } = renderInLocale(<StarRating value={7.9} interactive={false} />);
    expect(fills(container)).toEqual({ full: 4, half: 0, empty: 1 });
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName('Rated 4 out of 5 stars');
  });

  it('clamps over-range input (11 → 5 stars)', () => {
    const { container } = renderInLocale(<StarRating value={11} interactive={false} />);
    expect(fills(container).full).toBe(5);
    expect(screen.getByRole('img')).toHaveAccessibleName('Rated 5 out of 5 stars');
    expect(container.textContent).not.toContain('5.5');
  });

  it.each([-1, Number.NaN, 0, null])(
    'shows "Not rated" for %s, with no minus sign or NaN',
    (value) => {
      const { container } = renderInLocale(<StarRating value={value} interactive={false} />);
      expect(screen.getByRole('img')).toHaveAccessibleName('Not rated');
      expect(fills(container)).toEqual({ full: 0, half: 0, empty: 5 });
      expect(container.textContent).not.toMatch(/NaN|-|−/);
      expect(screen.getByText('—')).toBeInTheDocument();
    },
  );

  it('fills stars with the --rating-star token and no hex colours or overflow-visible', () => {
    const { container } = renderInLocale(<StarRating value={7} interactive={false} />);
    const filled = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('fill') === 'var(--rating-star)',
    );
    expect(filled.length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(container.innerHTML).not.toContain('overflow-visible');
  });

  it('shows the community vote count when count is provided', () => {
    renderInLocale(<StarRating value={6} count={5} interactive={false} />);
    expect(screen.getByText(/5 community votes/i)).toBeInTheDocument();
  });

  it('shows "No community votes yet" when count is 0', () => {
    renderInLocale(<StarRating value={6} count={0} interactive={false} />);
    expect(screen.getByText(/No community votes yet/i)).toBeInTheDocument();
  });

  it('does NOT call onRate in read-only mode on click', () => {
    const onRate = vi.fn();
    const { container } = renderInLocale(
      <StarRating value={6} onRate={onRate} interactive={false} />,
    );
    fireEvent.click(container.querySelectorAll('svg')[0]);
    expect(onRate).not.toHaveBeenCalled();
  });
});

describe('StarRating — interactive slider', () => {
  it('is one focusable role="slider" with 0–10 range, valuenow and valuetext', () => {
    renderInLocale(<StarRating value={7} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '10');
    expect(slider).toHaveAttribute('aria-valuenow', '7');
    expect(slider).toHaveAttribute('aria-valuetext', '3.5 of 5 stars');
    expect(slider).toHaveAccessibleName('Rating');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('reports "Not rated" (valuenow 0) without a saved value', () => {
    renderInLocale(<StarRating value={null} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider).toHaveAttribute('aria-valuetext', 'Not rated');
  });

  it('accepts a custom accessible name', () => {
    renderInLocale(<StarRating value={null} onRate={vi.fn()} label="Your rating" />);
    expect(screen.getByRole('slider')).toHaveAccessibleName('Your rating');
  });

  it('describes the key bindings through aria-describedby', () => {
    renderInLocale(<StarRating value={null} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    const hintId = slider.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId ?? '')?.textContent).toMatch(/Shift\+arrow/);
  });

  it('ArrowRight ×3 + Enter commits 6 (three whole stars), never an odd value', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={null} onRate={onRate} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Enter}');
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(6);
  });

  it('Shift+ArrowRight moves half a star (2, 4, then 5) and valuetext reads 2.5 before commit', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={null} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}');
    expect(slider).toHaveAttribute('aria-valuetext', '2.5 of 5 stars');
    expect(slider).toHaveAttribute('aria-valuenow', '5');
    expect(onRate).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(5);
  });

  it('whole-star arrows snap a half-star value to whole stars (5 → 6, 5 → 4)', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const { unmount } = renderInLocale(<StarRating value={5} onRate={onRate} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(6);
    unmount();
    renderInLocale(<StarRating value={5} onRate={onRate} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(4);
  });

  it('clamps arrows to the range (End then ArrowRight stays 10; ArrowLeft never reaches 0)', async () => {
    const user = userEvent.setup();
    renderInLocale(<StarRating value={null} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{End}{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '10');
    await user.keyboard('{2}{ArrowLeft}{ArrowLeft}');
    expect(slider).toHaveAttribute('aria-valuenow', '2');
  });

  it.each([
    ['1', 2],
    ['3', 6],
    ['5', 10],
  ])('digit key %s selects %s', async (key, expected) => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={null} onRate={onRate} />);
    screen.getByRole('slider').focus();
    await user.keyboard(`${key}{Enter}`);
    expect(onRate).toHaveBeenCalledWith(expected);
  });

  it('Home selects ½ star and End selects 5 stars; Space commits', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={6} onRate={onRate} />);
    screen.getByRole('slider').focus();
    await user.keyboard('{Home} ');
    expect(onRate).toHaveBeenLastCalledWith(1);
    await user.keyboard('{End} ');
    expect(onRate).toHaveBeenLastCalledWith(10);
  });

  it('Escape reverts the pending value to the saved value without committing', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={6} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(slider).toHaveAttribute('aria-valuenow', '10');
    await user.keyboard('{Escape}');
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    act(() => slider.blur());
    expect(onRate).not.toHaveBeenCalled();
  });

  it('blur commits an uncommitted pending value exactly once', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={null} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    act(() => slider.blur());
    expect(onRate).toHaveBeenCalledTimes(1);
    expect(onRate).toHaveBeenCalledWith(2);
    act(() => slider.focus());
    act(() => slider.blur());
    expect(onRate).toHaveBeenCalledTimes(1);
  });

  it('does not re-commit on blur after Enter', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    renderInLocale(<StarRating value={null} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    act(() => slider.blur());
    expect(onRate).toHaveBeenCalledTimes(1);
  });

  it('pointer: clicking the left half of star 3 commits 5, the right half commits 6', () => {
    const onRate = vi.fn();
    const { container } = renderInLocale(<StarRating value={null} onRate={onRate} />);
    const star3 = container.querySelectorAll<HTMLElement>('[data-star]')[2];
    star3.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.click(star3, { clientX: 10 });
    expect(onRate).toHaveBeenLastCalledWith(5);
    fireEvent.click(star3, { clientX: 60 });
    expect(onRate).toHaveBeenLastCalledWith(6);
  });

  it('pointer hover previews the value under the pointer', () => {
    const { container } = renderInLocale(<StarRating value={null} onRate={vi.fn()} />);
    const star2 = container.querySelectorAll<HTMLElement>('[data-star]')[1];
    star2.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    fireEvent.mouseMove(star2, { clientX: 80 });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(fills(container).full).toBe(2);
  });

  it('busy: exposes aria-disabled, keeps focus and ignores keys and clicks until it clears', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    const { rerender, container } = renderInLocale(<StarRating value={null} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onRate).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <StarRating value={null} onRate={onRate} busy />
      </I18nProvider>,
    );
    expect(document.activeElement).toBe(slider);
    expect(slider).toHaveAttribute('aria-disabled', 'true');
    expect(slider).not.toHaveAttribute('disabled');
    expect(slider).toHaveAttribute('tabindex', '0');
    await user.keyboard('{ArrowRight}{Enter}');
    const star = container.querySelectorAll<HTMLElement>('[data-star]')[4];
    fireEvent.click(star, { clientX: 0 });
    expect(onRate).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <StarRating value={2} onRate={onRate} />
      </I18nProvider>,
    );
    expect(slider).not.toHaveAttribute('aria-disabled');
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(4);
  });

  it('drops a committed draft when its submission settles with a result', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    /** Re-renders the slider with the given saved value, busy flag and action result. */
    const view = (value: number, busy: boolean, result?: object) => (
      <I18nProvider>
        <StarRating value={value} onRate={onRate} busy={busy} result={result} />
      </I18nProvider>
    );
    const { rerender } = renderInLocale(<StarRating value={6} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(8);

    // Pending: the submitted value is shown.
    rerender(view(6, true));
    expect(slider).toHaveAttribute('aria-valuenow', '8');

    // Failed (the saved value did not change): back to the saved rating.
    rerender(view(6, false, { ok: false, error: 'boom' }));
    expect(slider).toHaveAttribute('aria-valuenow', '6');

    // Succeeded (the loader returned the new value): the new rating.
    await user.keyboard('{ArrowRight}{Enter}');
    rerender(view(6, true, { ok: false, error: 'boom' }));
    rerender(view(8, false, { ok: true, rating: 8 }));
    expect(slider).toHaveAttribute('aria-valuenow', '8');
  });

  it('a failure that settles without a busy render after an earlier success rolls back (B3)', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    /** Re-renders the slider with the given saved value, busy flag and action result. */
    const view = (value: number | null, busy: boolean, result?: object) => (
      <I18nProvider>
        <StarRating value={value} onRate={onRate} busy={busy} result={result} />
      </I18nProvider>
    );
    const { rerender } = renderInLocale(<StarRating value={null} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();

    // First rating succeeds: pending, then the loader's new value arrives with the result.
    await user.keyboard('4{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(8);
    rerender(view(null, true));
    rerender(view(8, false, { ok: true, rating: 8 }));
    expect(slider).toHaveAttribute('aria-valuenow', '8');

    // Second rating: the committed value shows until a new result arrives.
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(onRate).toHaveBeenLastCalledWith(6);
    expect(slider).toHaveAttribute('aria-valuenow', '6');

    // It fails at once: the failure result arrives with no busy render in between.
    rerender(view(8, false, { ok: false, error: 'Failed to fetch' }));
    expect(slider).toHaveAttribute('aria-valuenow', '8');
  });

  it('keeps the committed value while a result arrives during the revalidation (still busy)', async () => {
    const user = userEvent.setup();
    const onRate = vi.fn();
    /** Re-renders the slider with the given saved value, busy flag and action result. */
    const view = (value: number, busy: boolean, result?: object) => (
      <I18nProvider>
        <StarRating value={value} onRate={onRate} busy={busy} result={result} />
      </I18nProvider>
    );
    const { rerender } = renderInLocale(<StarRating value={6} onRate={onRate} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{Enter}');

    // The fetcher is `loading` (revalidating) with the action data already set.
    const result = { ok: true, rating: 8 };
    rerender(view(6, true, result));
    expect(slider).toHaveAttribute('aria-valuenow', '8');

    // Idle with the revalidated value: no flash of the old rating in between.
    rerender(view(8, false, result));
    expect(slider).toHaveAttribute('aria-valuenow', '8');
  });

  it('resets the pending value when the saved value changes', async () => {
    const user = userEvent.setup();
    const { rerender } = renderInLocale(<StarRating value={4} onRate={vi.fn()} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(slider).toHaveAttribute('aria-valuenow', '6');
    rerender(
      <I18nProvider>
        <StarRating value={8} onRate={vi.fn()} />
      </I18nProvider>,
    );
    expect(slider).toHaveAttribute('aria-valuenow', '8');
  });

  it('wraps the numeric label below the stars in a narrow card (flex-wrap)', () => {
    renderInLocale(<StarRating value={7} onRate={vi.fn()} />);
    expect(screen.getByRole('slider')).toHaveClass('flex-wrap');
  });
});
