import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentSection } from './CommentSection';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-router', () => ({
  Link: (
    { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
  ) => <a href={to} {...props}>{children}</a>,
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

const mockApi = vi.mocked(api);
const mockUseAuth = vi.mocked(useAuth);
const mockUseTranslation = vi.mocked(useTranslation);

// ── Fixtures ───────────────────────────────────────────────────────────────

const recipeId = 'recipe-1';
const recipeAuthorId = 'author-1';

const enT = (key: string) => {
  const map: Record<string, string> = {
    'comment.reply': 'Reply',
    'comment.op': 'OP',
    'comment.writeComment': 'Write a comment...',
    'comment.postComment': 'Post Comment',
    'comment.posting': 'Posting...',
    'comment.writeReply': 'Write a reply...',
    'comment.postReply': 'Post Reply',
    'comment.cancel': 'Cancel',
    'comment.loadMore': 'Load More',
    'comment.count': 'Comments ({count})',
  };
  return map[key] ?? key;
};

const trT = (key: string) => {
  const map: Record<string, string> = {
    'comment.reply': 'Yanıtla',
    'comment.op': 'OP',
    'comment.writeComment': 'Yorum yaz...',
    'comment.postComment': 'Yorum Gönder',
    'comment.posting': 'Gönderiliyor...',
    'comment.writeReply': 'Yanıt yaz...',
    'comment.postReply': 'Yanıt Gönder',
    'comment.cancel': 'İptal',
    'comment.loadMore': 'Daha Fazla Yükle',
    'comment.count': 'Yorumlar ({count})',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

const guestAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

function makeUser(overrides: Partial<{ id: string; isAdmin: boolean }> = {}) {
  return {
    id: overrides.id ?? 'user-99',
    email: 'u@example.com',
    username: overrides.id ?? 'user99',
    displayName: null,
    avatarUrl: null,
    isAdmin: overrides.isAdmin ?? false,
    onboardingCompleted: true,
  };
}

const recipeOwnerUser = makeUser({ id: recipeAuthorId });
const adminUser = makeUser({ id: 'admin-1', isAdmin: true });
const regularUser = makeUser({ id: 'user-2' });

const topLevelComment = {
  id: 'comment-1',
  content: 'Great recipe!',
  authorId: 'user-2',
  author: { id: 'user-2', username: 'bob', displayName: 'Bob', avatarUrl: null },
  createdAt: '2026-05-09T10:00:00Z',
  replies: [],
};

const commentByOwner = {
  id: 'comment-owner',
  content: 'My own comment',
  authorId: recipeAuthorId,
  author: { id: recipeAuthorId, username: 'alice', displayName: 'Alice', avatarUrl: null },
  createdAt: '2026-05-09T09:00:00Z',
  replies: [],
};

const replyByAlice = {
  id: 'reply-1',
  content: 'Thanks!',
  authorId: recipeAuthorId,
  author: { id: recipeAuthorId, username: 'alice', displayName: 'Alice', avatarUrl: null },
  createdAt: '2026-05-09T11:00:00Z',
};

const commentWithReply = { ...topLevelComment, replies: [replyByAlice] };

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
  mockUseAuth.mockReturnValue(guestAuth as ReturnType<typeof useAuth>);
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

// ── i18n ───────────────────────────────────────────────────────────────────

describe('CommentSection — i18n', () => {
  it('renders heading and form labels using t() — English', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.queryByText('Posting...')).not.toBeInTheDocument());

    expect(screen.getByText('Comments (0)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post Comment' })).toBeInTheDocument();
  });

  it('renders heading and form labels in Turkish when locale is tr', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.queryByText('Gönderiliyor...')).not.toBeInTheDocument());

    expect(screen.getByText('Yorumlar (0)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Yorum yaz...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yorum Gönder' })).toBeInTheDocument();
  });

  it('renders Reply button label using t()', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('renders Reply button in Turkish', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Yanıtla' })).toBeInTheDocument();
  });

  it('renders reply form labels using t() — English', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

// ── Reply button visibility ────────────────────────────────────────────────

describe('CommentSection — Reply button visibility', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue([topLevelComment]);
  });

  it('shows Reply button for the recipe owner', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('shows Reply button for an admin', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: adminUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('shows Reply button for the top-level comment author', async () => {
    // regularUser is the author of topLevelComment (authorId = 'user-2')
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('does NOT show Reply button for a different regular user (not owner, not admin, not comment author)', async () => {
    const otherUser = makeUser({ id: 'user-99' });
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: otherUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('does NOT show Reply button for unauthenticated visitors', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });
});

// ── Reply button on replies ────────────────────────────────────────────────

describe('CommentSection — Reply button on replies', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue([commentWithReply]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
  });

  it('shows Reply button on a reply for permitted users', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());
    // There should be Reply buttons: one on the top-level comment, one on the reply
    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    expect(replyButtons.length).toBe(2);
  });

  it('clicking Reply on a reply opens the form on the parent comment pre-filled with @username', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());

    // The second Reply button is on the reply (alice's reply)
    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    await userEvent.click(replyButtons[1]);

    // Form should open with @alice pre-filled
    const textarea = screen.getByPlaceholderText('Write a reply...');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe('@alice ');
  });

  it('submitting the pre-filled reply sends parentCommentId of the top-level comment', async () => {
    mockApi.post.mockResolvedValue({
      id: 'new-reply',
      content: '@alice nice!',
      authorId: recipeAuthorId,
      createdAt: new Date().toISOString(),
    });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());

    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    await userEvent.click(replyButtons[1]); // click Reply on the reply

    const textarea = screen.getByPlaceholderText('Write a reply...');
    await userEvent.type(textarea, 'nice!');
    await userEvent.click(screen.getByRole('button', { name: 'Post Reply' }));

    expect(mockApi.post).toHaveBeenCalledWith(
      `/comments/recipe/${recipeId}`,
      expect.objectContaining({ parentCommentId: topLevelComment.id }),
    );
  });
});

// ── Reply form interaction ─────────────────────────────────────────────────

describe('CommentSection — Reply form', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
  });

  it('opens the reply form when Reply is clicked on a top-level comment', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('closes the reply form when Cancel is clicked', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('submits a reply with parentCommentId', async () => {
    mockApi.post.mockResolvedValue({
      id: 'reply-new',
      content: 'Nice one!',
      authorId: recipeAuthorId,
      createdAt: new Date().toISOString(),
    });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Nice one!');
    await userEvent.click(screen.getByRole('button', { name: 'Post Reply' }));

    expect(mockApi.post).toHaveBeenCalledWith(
      `/comments/recipe/${recipeId}`,
      { content: 'Nice one!', parentCommentId: topLevelComment.id },
    );
  });

  it('Post Reply button is disabled when textarea is empty', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeDisabled();
  });

  it('shows reply optimistically after successful submit', async () => {
    mockApi.post.mockResolvedValue({
      id: 'reply-new',
      content: 'Nice one!',
      authorId: recipeAuthorId,
      createdAt: new Date().toISOString(),
    });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Nice one!');
    await userEvent.click(screen.getByRole('button', { name: 'Post Reply' }));

    await waitFor(() => {
      expect(screen.getByText('Nice one!')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    });
  });
});

// ── Comment display ────────────────────────────────────────────────────────

describe('CommentSection — comment display', () => {
  it('renders comments from the API', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
  });

  it('renders nested replies under their parent', async () => {
    mockApi.get.mockResolvedValue([commentWithReply]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByText('Great recipe!')).toBeInTheDocument();
      expect(screen.getByText('Thanks!')).toBeInTheDocument();
    });
  });

  it('shows OP badge only on comments by the recipe owner', async () => {
    mockApi.get.mockResolvedValue([commentByOwner, topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('My own comment')).toBeInTheDocument());

    const opBadges = screen.getAllByText('OP');
    expect(opBadges).toHaveLength(1);
  });
});

// ── Inline markdown rendering ──────────────────────────────────────────────

describe('CommentSection — inline markdown rendering', () => {
  it('renders **bold** as <strong>', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '**bold text**' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const strong = document.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('bold text');
    });
  });

  it('renders *italic* as <em>', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '*italic text*' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const em = document.querySelector('em');
      expect(em).not.toBeNull();
      expect(em?.textContent).toBe('italic text');
    });
  });

  it('renders _italic_ as <em>', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '_italic text_' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const em = document.querySelector('em');
      expect(em).not.toBeNull();
      expect(em?.textContent).toBe('italic text');
    });
  });

  it('renders __underline__ as <u>', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '__underline text__' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const u = document.querySelector('u');
      expect(u).not.toBeNull();
      expect(u?.textContent).toBe('underline text');
    });
  });

  it('renders mixed markdown in a single comment', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '**bold** and *italic*' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(document.querySelector('strong')?.textContent).toBe('bold');
      expect(document.querySelector('em')?.textContent).toBe('italic');
    });
  });

  it('renders plain text without any markdown tokens unchanged', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: 'just plain text' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => expect(screen.getByText('just plain text')).toBeInTheDocument());
    expect(document.querySelector('strong')).toBeNull();
    expect(document.querySelector('em')).toBeNull();
    expect(document.querySelector('u')).toBeNull();
  });

  it('does not render HTML tags — treats them as plain text', async () => {
    mockApi.get.mockResolvedValue([{ ...topLevelComment, content: '<script>alert(1)</script>' }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      // The script tag should NOT be injected into the DOM
      expect(document.querySelector('script')).toBeNull();
      // The raw text should appear as-is
      expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    });
  });

  it('renders markdown in reply bodies too', async () => {
    mockApi.get.mockResolvedValue([{
      ...topLevelComment,
      replies: [{ ...replyByAlice, content: '**bold reply**' }],
    }]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const strong = document.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('bold reply');
    });
  });
});

// ── Comment form ───────────────────────────────────────────────────────────

describe('CommentSection — comment form', () => {
  it('shows the form when authenticated', () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();
  });

  it('hides the form when not authenticated', () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  it('submits a top-level comment without parentCommentId', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
    mockApi.post.mockResolvedValue({
      id: 'new-comment',
      content: 'Hello world',
      authorId: 'user-2',
      createdAt: new Date().toISOString(),
    });

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await userEvent.type(screen.getByPlaceholderText('Write a comment...'), 'Hello world');
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }));

    expect(mockApi.post).toHaveBeenCalledWith(
      `/comments/recipe/${recipeId}`,
      { content: 'Hello world' },
    );
    expect(mockApi.post).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ parentCommentId: expect.anything() }),
    );
  });
});
