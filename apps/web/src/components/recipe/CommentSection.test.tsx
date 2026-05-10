import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentSection } from './CommentSection';

vi.mock('react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock('../../api/client.ts', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../../contexts/AuthContext.tsx', () => ({
  useAuth: vi.fn(),
}));

import { api } from '../../api/client.ts';
import { useAuth } from '../../contexts/AuthContext.tsx';

const mockApi = vi.mocked(api);
const mockUseAuth = vi.mocked(useAuth);

const recipeId = 'recipe-1';
const recipeAuthorId = 'author-1';

const guestAuth = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const regularUserAuth = {
  user: {
    id: 'user-2',
    email: 'bob@example.com',
    username: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const recipeOwnerAuth = {
  user: {
    id: recipeAuthorId,
    email: 'alice@example.com',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    isAdmin: false,
    onboardingCompleted: true,
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const adminAuth = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    username: 'admin',
    displayName: 'Admin',
    avatarUrl: null,
    isAdmin: true,
    onboardingCompleted: true,
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

const sampleComment = {
  id: 'comment-1',
  content: 'Great recipe!',
  authorId: 'user-2',
  author: { id: 'user-2', username: 'bob', displayName: 'Bob', avatarUrl: null },
  createdAt: '2026-05-09T10:00:00Z',
  replies: [],
};

const sampleCommentWithReply = {
  ...sampleComment,
  replies: [
    {
      id: 'reply-1',
      content: 'Thanks!',
      authorId: recipeAuthorId,
      author: { id: recipeAuthorId, username: 'alice', displayName: 'Alice', avatarUrl: null },
      createdAt: '2026-05-09T11:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue([]);
  mockUseAuth.mockReturnValue(guestAuth as ReturnType<typeof useAuth>);
});

// ---------------------------------------------------------------------------
// Comment display
// ---------------------------------------------------------------------------

describe('CommentSection — comment display', () => {
  it('renders comments returned by the API', async () => {
    mockApi.get.mockResolvedValue([sampleComment]);
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByText('Great recipe!')).toBeInTheDocument();
    });
  });

  it('renders nested replies under their parent comment', async () => {
    mockApi.get.mockResolvedValue([sampleCommentWithReply]);
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByText('Great recipe!')).toBeInTheDocument();
      expect(screen.getByText('Thanks!')).toBeInTheDocument();
    });
  });

  it('shows OP badge only on comments authored by the recipe owner', async () => {
    const ownerComment = {
      ...sampleComment,
      id: 'comment-op',
      authorId: recipeAuthorId,
      author: { id: recipeAuthorId, username: 'alice', displayName: 'Alice', avatarUrl: null },
    };
    mockApi.get.mockResolvedValue([ownerComment, sampleComment]);
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const opBadges = screen.getAllByText('OP');
      // Only the recipe owner's comment should have the OP badge
      expect(opBadges).toHaveLength(1);
    });
  });

  it('does not show OP badge on replies from non-owners', async () => {
    mockApi.get.mockResolvedValue([sampleCommentWithReply]);
    // The reply is from recipeAuthorId (alice), so it SHOULD show OP
    // The top-level comment is from user-2 (bob), so it should NOT show OP
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      const opBadges = screen.getAllByText('OP');
      // Only alice's reply should have OP
      expect(opBadges).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Comment form visibility
// ---------------------------------------------------------------------------

describe('CommentSection — comment form', () => {
  it('shows the comment form when authenticated', () => {
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    expect(screen.getByPlaceholderText('Write a comment...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post Comment' })).toBeInTheDocument();
  });

  it('hides the comment form when not authenticated', () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    expect(screen.queryByPlaceholderText('Write a comment...')).not.toBeInTheDocument();
  });

  it('submits a new top-level comment without parentCommentId', async () => {
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);
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
    // parentCommentId must NOT be present for top-level comments
    expect(mockApi.post).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ parentCommentId: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// Reply button visibility
// ---------------------------------------------------------------------------

describe('CommentSection — Reply button visibility', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue([sampleComment]);
  });

  it('shows Reply button for the recipe owner', async () => {
    mockUseAuth.mockReturnValue(recipeOwnerAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    });
  });

  it('shows Reply button for an admin user', async () => {
    mockUseAuth.mockReturnValue(adminAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    });
  });

  it('does NOT show Reply button for a regular (non-owner, non-admin) user', async () => {
    mockUseAuth.mockReturnValue(regularUserAuth as ReturnType<typeof useAuth>);

    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByText('Great recipe!')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });

  it('does NOT show Reply button for unauthenticated visitors', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => {
      expect(screen.getByText('Great recipe!')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Reply form interaction
// ---------------------------------------------------------------------------

describe('CommentSection — Reply form', () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue([sampleComment]);
    mockUseAuth.mockReturnValue(recipeOwnerAuth as ReturnType<typeof useAuth>);
  });

  it('opens the inline reply form when Reply is clicked', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByPlaceholderText('Write a reply...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Reply button itself should be hidden while form is open
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

  it('submits a reply with parentCommentId when Post Reply is clicked', async () => {
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
      { content: 'Nice one!', parentCommentId: sampleComment.id },
    );
  });

  it('closes the reply form and shows the reply optimistically after successful submit', async () => {
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
      // Form should be closed
      expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument();
    });
  });

  it('Post Reply button is disabled when reply textarea is empty', async () => {
    render(<CommentSection recipeId={recipeId} recipeAuthorId={recipeAuthorId} />);

    await waitFor(() => screen.getByRole('button', { name: 'Reply' }));
    await userEvent.click(screen.getByRole('button', { name: 'Reply' }));

    expect(screen.getByRole('button', { name: 'Post Reply' })).toBeDisabled();
  });
});
