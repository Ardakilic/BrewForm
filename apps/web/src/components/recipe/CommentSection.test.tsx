import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { CommentSection } from './CommentSection.tsx';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    Link: (
      { to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown },
    ) => <a href={to} {...props}>{children}</a>,
  };
});

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

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

let testCurrentUserId = 'user-99';

const recipeId = 'recipe-1';
const recipeAuthorId = 'author-1';

const defaultComments = {
  data: [],
  meta: { pagination: { total: 0, page: 1, perPage: 10, totalPages: 0 } },
};

function makePaginationInitialData(options: {
  total: number;
  page: number;
  perPage: number;
  commentCount: number;
}) {
  const comments = Array.from({ length: options.commentCount }, (_, i) => ({
    id: `comment-init-${i + 1}`,
    content: `Initial comment ${i + 1}`,
    authorId: 'user-1',
    createdAt: new Date(Date.now() - i * 60000).toISOString(),
    replies: [],
  }));
  return {
    data: comments,
    meta: {
      pagination: {
        total: options.total,
        page: options.page,
        perPage: options.perPage,
        totalPages: Math.ceil(options.total / options.perPage),
      },
    },
  };
}

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
    'recipe.comments': 'Comments',
    'comment.commentBy': 'Comment by {name}',
    'comment.replyBy': 'Reply by {name}',
    'comment.label': 'Comment',
    'comment.replyLabel': 'Reply',
    'comment.posted': 'Comment posted',
    'comment.replyPosted': 'Reply posted',
    'common.delete': 'Delete',
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
    'recipe.comments': 'Yorumlar',
    'comment.commentBy': 'Yorum yapan: {name}',
    'comment.replyBy': 'Yanıtlayan: {name}',
    'comment.label': 'Yorum',
    'comment.replyLabel': 'Yanıt',
    'comment.posted': 'Yorum gönderildi',
    'comment.replyPosted': 'Yanıt gönderildi',
    'common.delete': 'Sil',
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
    emailVerifiedAt: null,
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

// ── Render helper ──────────────────────────────────────────────────────────

function renderCommentSection(
  props: Partial<{
    recipeId: string;
    recipeAuthorId: string;
    initialComments: typeof defaultComments;
  }> = {},
) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <CommentSection
            recipeId={props.recipeId ?? recipeId}
            recipeAuthorId={props.recipeAuthorId ?? recipeAuthorId}
            initialComments={props.initialComments ?? defaultComments}
          />
        ),
        children: [
          {
            path: 'comments/recipe/:recipeId',
            loader: async ({ request }: { request: Request }) => {
              const url = new URL(request.url);
              const page = parseInt(url.searchParams.get('page') ?? '1', 10);
              if (page === 2) {
                return {
                  data: Array.from({ length: 10 }, (_, i) => ({
                    id: `comment-page2-${i + 1}`,
                    content: `Second page comment ${i + 1}`,
                    authorId: 'user-1',
                    createdAt: '2024-02-01T10:00:00Z',
                    replies: [],
                  })),
                  meta: {
                    pagination: { total: 25, page: 2, perPage: 10, totalPages: 3 },
                  },
                };
              }
              if (page === 3) {
                return {
                  data: Array.from({ length: 5 }, (_, i) => ({
                    id: `comment-page3-${i + 1}`,
                    content: `Third page comment ${i + 1}`,
                    authorId: 'user-3',
                    createdAt: '2024-02-01T08:00:00Z',
                    replies: [],
                  })),
                  meta: {
                    pagination: { total: 25, page: 3, perPage: 10, totalPages: 3 },
                  },
                };
              }
              return {
                data: [],
                meta: {
                  pagination: { total: 25, page: 1, perPage: 10, totalPages: 3 },
                },
              };
            },
            action: async ({ request }: { request: Request }) => {
              const formData = await request.formData();
              const content = formData.get('content') as string;
              return {
                id: `new-${Date.now()}`,
                content,
                authorId: testCurrentUserId,
                createdAt: new Date().toISOString(),
              };
            },
            element: null,
          },
          {
            path: 'comments/:id',
            action: async () => ({ success: true }),
            element: null,
          },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  testCurrentUserId = 'user-99';
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

    renderCommentSection();

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

    renderCommentSection();

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

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('renders Reply button in Turkish', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );
    mockUseTranslation.mockReturnValue({ ...defaultTranslation, locale: 'tr', t: trT });

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Yanıtla' })).toBeInTheDocument();
  });

  it('renders reply form labels using t() — English', async () => {
    mockApi.get.mockResolvedValue([topLevelComment]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: recipeOwnerUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

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

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('shows Reply button for an admin', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: adminUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('shows Reply button for the top-level comment author', async () => {
    // regularUser is the author of topLevelComment (authorId = 'user-2')
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument());
  });

  it('does NOT show Reply button for a different regular user (not owner, not admin, not comment author)', async () => {
    const otherUser = makeUser({ id: 'user-99' });
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: otherUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('does NOT show Reply button for unauthenticated visitors', async () => {
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

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
    renderCommentSection({
      initialComments: { data: [commentWithReply], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());
    // There should be Reply buttons: one on the top-level comment, one on the reply
    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    expect(replyButtons.length).toBe(2);
  });

  it('clicking Reply on a reply opens the form on the parent comment pre-filled with @username', async () => {
    renderCommentSection({
      initialComments: { data: [commentWithReply], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());

    // The second Reply button is on the reply (alice's reply)
    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    await userEvent.click(replyButtons[1]);

    // Form should open with @alice pre-filled
    const textarea = screen.getByPlaceholderText('Write a reply...');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe('@alice ');
  });

  it('submitting a reply to a reply adds it under the top-level parent comment', async () => {
    renderCommentSection({
      initialComments: { data: [commentWithReply], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());

    const replyButtons = screen.getAllByRole('button', { name: 'Reply' });
    await userEvent.click(replyButtons[1]); // click Reply on the reply

    const textarea = screen.getByPlaceholderText('Write a reply...');
    await userEvent.type(textarea, 'nice!');
    await userEvent.click(screen.getByRole('button', { name: 'Post Reply' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    });
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
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('closes the reply form when Cancel is clicked', async () => {
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('submits a reply and closes the reply form', async () => {
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));
    await userEvent.type(screen.getByPlaceholderText('Write a reply...'), 'Nice one!');
    await userEvent.click(screen.getByRole('button', { name: 'Post Reply' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    });
  });

  it('Post Reply button is disabled when textarea is empty', async () => {
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeDisabled();
  });

  it('shows reply optimistically after successful submit', async () => {
    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

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

    renderCommentSection({
      initialComments: { data: [topLevelComment], meta: defaultComments.meta },
    });

    await waitFor(() => expect(screen.getByText('Great recipe!')).toBeInTheDocument());
  });

  it('renders nested replies under their parent', async () => {
    mockApi.get.mockResolvedValue([commentWithReply]);
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection({
      initialComments: { data: [commentWithReply], meta: defaultComments.meta },
    });

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

    renderCommentSection({
      initialComments: {
        data: [commentByOwner, topLevelComment],
        meta: { pagination: { total: 2, page: 1, perPage: 10, totalPages: 1 } },
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '**bold text**' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '*italic text*' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '_italic text_' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '__underline text__' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '**bold** and *italic*' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: 'just plain text' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, content: '<script>alert(1)</script>' }],
        meta: defaultComments.meta,
      },
    });

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

    renderCommentSection({
      initialComments: {
        data: [{ ...topLevelComment, replies: [{ ...replyByAlice, content: '**bold reply**' }] }],
        meta: defaultComments.meta,
      },
    });

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
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderCommentSection();

    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();
  });

  it('hides the form when not authenticated', () => {
    mockApi.get.mockReturnValue(new Promise(() => {}));

    renderCommentSection();

    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  it('submits a top-level comment and shows it in the list', async () => {
    mockUseAuth.mockReturnValue(
      { ...guestAuth, user: regularUser, isAuthenticated: true } as ReturnType<typeof useAuth>,
    );

    renderCommentSection();

    await userEvent.type(screen.getByPlaceholderText('Write a comment...'), 'Hello world');
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }));

    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });
});

// ── Load More pagination ───────────────────────────────────────────────────

describe('CommentSection — Load More pagination', () => {
  it('shows "Load More" button when total exceeds visible comments', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
    });
  });

  it('does not show "Load More" button when all comments are visible', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 5,
      page: 1,
      perPage: 10,
      commentCount: 5,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText(/comments/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('does not show "Load More" button when there are zero comments', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 0,
      page: 1,
      perPage: 10,
      commentCount: 0,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText(/0 comments|Comments \(0\)/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('appends second-page comments when "Load More" is clicked', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    expect(screen.getByText('Initial comment 10')).toBeInTheDocument();

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    expect(screen.getByText('Initial comment 10')).toBeInTheDocument();

    expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    expect(screen.getByText('Second page comment 2')).toBeInTheDocument();
  });

  it('shows correct total in count heading after loading more', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText(/25/)).toBeInTheDocument();
    });

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });
    expect(screen.getByText(/25/)).toBeInTheDocument();
  });

  it('hides "Load More" button after loading all pages', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByText('Initial comment 1')).toBeInTheDocument();
    });

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Second page comment 1')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText('Third page comment 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    });
  });

  it('allows comment submission after loader is added to the route', async () => {
    mockUseAuth.mockReturnValue({
      ...guestAuth,
      user: regularUser,
      isAuthenticated: true,
    } as ReturnType<typeof useAuth>);

    const initialData = makePaginationInitialData({
      total: 25,
      page: 1,
      perPage: 10,
      commentCount: 10,
    });
    renderCommentSection({ initialComments: initialData });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/write a comment/i)).toBeInTheDocument();
    });

    await userEvent.type(
      screen.getByPlaceholderText(/write a comment/i),
      'New comment during pagination',
    );
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => {
      expect(screen.getByText('New comment during pagination')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
