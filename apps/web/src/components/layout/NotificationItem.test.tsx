// ── Module-level mocks (hoisted by Vitest — MUST come before imports) ──

vi.mock('react-router', () => ({
  Link: (
    { to, children, onClick, ...props }: {
      to: string;
      children: React.ReactNode;
      onClick?: () => void;
      [key: string]: unknown;
    },
  ) => <a href={to} onClick={onClick} {...props}>{children}</a>,
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('../../api/index.ts', () => ({
  notificationApi: {
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    list: vi.fn(),
    unreadCount: vi.fn(),
  },
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../utils/notification-events.ts', () => ({
  notifyNotificationsChanged: vi.fn(),
}));

// ── Imports (after all vi.mock calls) ──

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationOutput } from '@brewform/shared/schemas';
import { useTranslation } from '../../contexts/I18nContext.tsx';
import { notificationApi } from '../../api/index.ts';
import { notifyNotificationsChanged } from '../../utils/notification-events.ts';
import { NotificationItem } from './NotificationItem.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockMarkRead = vi.mocked(notificationApi.markRead);
const mockNotify = vi.mocked(notifyNotificationsChanged);

// Translation table returns the raw templates; the component does the .replace().
const templates: Record<string, string> = {
  'notifications.mention': '{username} mentioned you in a comment on {recipeTitle}',
  'notifications.mentionGeneric': '{username} mentioned you in a comment',
  'notifications.follow': '{actorUsername} started following you',
  'notifications.like': '{actorUsername} liked your recipe {recipeTitle}',
  'notifications.comment': '{actorUsername} commented on {recipeTitle}',
  'notifications.markRead': 'Mark as read',
};

function baseNotification(overrides: Partial<NotificationOutput> = {}): NotificationOutput {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'mention',
    actorId: 'a1',
    actorUsername: 'alice',
    referenceId: 'c1',
    referenceType: 'comment',
    metadata: JSON.stringify({ recipeSlug: 'pour-over', recipeTitle: 'Pour Over' }),
    readAt: null,
    createdAt: '2026-05-09T10:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMarkRead.mockResolvedValue(baseNotification({ readAt: '2026-05-09T11:00:00Z' }));
  mockUseTranslation.mockReturnValue({
    locale: 'en',
    setLocale: vi.fn(),
    t: (key: string) => templates[key] ?? key,
    availableLocales: ['en', 'tr'],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NotificationItem', () => {
  it('renders mention text with username and recipe title interpolated', () => {
    render(<NotificationItem notification={baseNotification()} />);
    expect(screen.getByText('alice mentioned you in a comment on Pour Over')).toBeInTheDocument();
  });

  it('links to the recipe using the metadata slug', () => {
    render(<NotificationItem notification={baseNotification()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over');
  });

  it('falls back to generic text when metadata is malformed', () => {
    render(<NotificationItem notification={baseNotification({ metadata: 'not-json{' })} />);
    expect(screen.getByText('alice mentioned you in a comment')).toBeInTheDocument();
    // No recipe slug parsed → renders a button rather than a Link.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the unread dot and mark-read affordance when unread', () => {
    render(<NotificationItem notification={baseNotification()} />);
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
  });

  it('hides the unread dot and mark-read button when already read', () => {
    render(
      <NotificationItem notification={baseNotification({ readAt: '2026-05-09T11:00:00Z' })} />,
    );
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
  });

  it('marks read and broadcasts the change when the mark-read button is clicked', async () => {
    const onRead = vi.fn();
    const user = userEvent.setup();
    render(<NotificationItem notification={baseNotification()} onRead={onRead} />);

    await user.click(screen.getByRole('button', { name: 'Mark as read' }));

    await waitFor(() => {
      expect(mockMarkRead).toHaveBeenCalledWith('n1');
      expect(onRead).toHaveBeenCalledWith('n1');
      expect(mockNotify).toHaveBeenCalled();
    });
  });

  it('renders follow text with actorUsername interpolated and links to the actor profile', () => {
    render(
      <NotificationItem
        notification={baseNotification({
          type: 'follow',
          metadata: JSON.stringify({ followerUsername: 'alice' }),
        })}
      />,
    );
    expect(screen.getByText('alice started following you')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/u/alice');
  });

  it('renders like text with actorUsername and recipeTitle and links to the recipe', () => {
    render(<NotificationItem notification={baseNotification({ type: 'like' })} />);
    expect(screen.getByText('alice liked your recipe Pour Over')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over');
  });

  it('renders comment text and links to the recipe with #commentId anchor', () => {
    render(
      <NotificationItem
        notification={baseNotification({ type: 'comment', referenceId: 'c-123' })}
      />,
    );
    expect(screen.getByText('alice commented on Pour Over')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/recipes/pour-over#c-123');
  });

  it('falls back to mentionGeneric for an unknown notification type', () => {
    // ponytail: `as never` deliberately crosses the type union for forward-compat testing.
    render(
      <NotificationItem notification={baseNotification({ type: 'futureType' as never })} />,
    );
    expect(screen.getByText('alice mentioned you in a comment')).toBeInTheDocument();
  });
});
