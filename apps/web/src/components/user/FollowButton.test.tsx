import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { FollowButton } from './FollowButton.tsx';

function renderWithRouter(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: ui,
        children: [
          { path: 'follow/:userId', element: null },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FollowButton — initial state rendering', () => {
  it('renders "Follow" when initialFollowing=false', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Follow');
  });

  it('renders "Following" when initialFollowing=true', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing />);
    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Following');
  });

  it('button is not disabled when idle', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });
});

describe('FollowButton — styling', () => {
  it('does not have accent background when not following', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).toBeFalsy();
  });

  it('has accent background when following', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing />);
    const button = screen.getByRole('button');
    expect(button.style.backgroundColor).toBeTruthy();
  });

  it('renders as button with type button', () => {
    renderWithRouter(<FollowButton userId='user-1' initialFollowing={false} />);
    const button = screen.getByRole('button');
    expect(button.getAttribute('type')).toBe('button');
  });
});
