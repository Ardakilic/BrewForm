import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetadataBadges } from './MetadataBadges.tsx';

vi.mock('react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const baseProps = {
  author: { username: 'jdoe', displayName: 'Jane Doe' },
  visibility: 'public',
  brewMethod: 'espresso_machine',
  versionNumber: 1,
  versionCount: 1,
};

// ── Requirement 2.1 — Author badge ──────────────────────────────────────────

describe('MetadataBadges — author badge (Req 2.1)', () => {
  it('shows displayName when present', () => {
    render(<MetadataBadges {...baseProps} />);
    expect(screen.getByRole('link', { name: 'Jane Doe' })).toBeInTheDocument();
  });

  it('falls back to username when displayName is null', () => {
    render(
      <MetadataBadges
        {...baseProps}
        author={{ username: 'jdoe', displayName: null }}
      />,
    );
    expect(screen.getByRole('link', { name: 'jdoe' })).toBeInTheDocument();
  });

  it('links to /u/{username}', () => {
    render(<MetadataBadges {...baseProps} />);
    expect(screen.getByRole('link', { name: 'Jane Doe' })).toHaveAttribute('href', '/u/jdoe');
  });

  it('renders without author badge when author is null', () => {
    render(<MetadataBadges {...baseProps} author={null} />);
    expect(screen.queryByRole('link', { name: /jane doe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /jdoe/i })).not.toBeInTheDocument();
  });
});

// ── Requirement 2.2 — Visibility badge ──────────────────────────────────────

describe('MetadataBadges — visibility badge (Req 2.2)', () => {
  it.each([
    ['public', 'rgb(34, 197, 94)'], // #22c55e — green
    ['unlisted', 'rgb(245, 158, 11)'], // #f59e0b — amber
    ['private', 'rgb(168, 162, 158)'], // #a8a29e — gray
    ['draft', 'rgb(168, 162, 158)'], // #a8a29e — gray
  ])('renders %s visibility with correct dot color', (vis, expectedColor) => {
    render(<MetadataBadges {...baseProps} visibility={vis} />);
    const dot = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.backgroundColor).toBe(expectedColor);
  });

  it('displays the visibility label in title case', () => {
    render(<MetadataBadges {...baseProps} visibility='unlisted' />);
    expect(screen.getByText('Unlisted')).toBeInTheDocument();
  });

  it('renders draft badge with dashed border', () => {
    render(<MetadataBadges {...baseProps} visibility='draft' />);
    const draftText = screen.getByText('Draft');
    const badge = draftText.closest('span');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('border-dashed');
  });

  it('does not render dashed border for non-draft visibility', () => {
    render(<MetadataBadges {...baseProps} visibility='public' />);
    const publicText = screen.getByText('Public');
    const badge = publicText.closest('span');
    expect(badge).not.toBeNull();
    expect(badge!.className).not.toContain('border-dashed');
  });
});

// ── Requirement 2.3 — Brew method badge ─────────────────────────────────────

describe('MetadataBadges — brew method badge (Req 2.3)', () => {
  it('converts underscores to spaces and applies title case', () => {
    render(<MetadataBadges {...baseProps} brewMethod='espresso_machine' />);
    expect(screen.getByText('Espresso Machine')).toBeInTheDocument();
  });

  it('handles single-word brew method', () => {
    render(<MetadataBadges {...baseProps} brewMethod='aeropress' />);
    expect(screen.getByText('Aeropress')).toBeInTheDocument();
  });

  it('does not render brew method badge when brewMethod is null', () => {
    render(<MetadataBadges {...baseProps} brewMethod={null} />);
    expect(screen.queryByText('Espresso Machine')).not.toBeInTheDocument();
  });

  it('does not render brew method badge when brewMethod is undefined', () => {
    render(<MetadataBadges {...baseProps} brewMethod={undefined} />);
    expect(screen.queryByText('Espresso Machine')).not.toBeInTheDocument();
  });
});

// ── Requirement 2.4 & 2.5 — Version info ────────────────────────────────────

describe('MetadataBadges — version info (Req 2.4 & 2.5)', () => {
  it('shows version number and prior versions count when versionCount > 1', () => {
    render(<MetadataBadges {...baseProps} versionNumber={3} versionCount={3} />);
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('2 prior versions')).toBeInTheDocument();
  });

  it('uses singular "version" when there is exactly 1 prior version', () => {
    render(<MetadataBadges {...baseProps} versionNumber={2} versionCount={2} />);
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('1 prior version')).toBeInTheDocument();
  });

  it('does not show version info when versionCount is 1', () => {
    render(<MetadataBadges {...baseProps} versionNumber={1} versionCount={1} />);
    expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/prior version/)).not.toBeInTheDocument();
  });
});

// ── Requirement 2.6 — Prior versions clickable ──────────────────────────────

describe('MetadataBadges — onVersionHistoryClick (Req 2.6)', () => {
  it('renders prior versions as a button when onVersionHistoryClick is provided', () => {
    const handler = vi.fn();
    render(
      <MetadataBadges
        {...baseProps}
        versionNumber={3}
        versionCount={3}
        onVersionHistoryClick={handler}
      />,
    );
    const btn = screen.getByRole('button', { name: '2 prior versions' });
    expect(btn).toBeInTheDocument();
  });

  it('calls onVersionHistoryClick when prior versions button is clicked', async () => {
    const handler = vi.fn();
    render(
      <MetadataBadges
        {...baseProps}
        versionNumber={3}
        versionCount={3}
        onVersionHistoryClick={handler}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '2 prior versions' }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('renders prior versions as plain text when onVersionHistoryClick is not provided', () => {
    render(<MetadataBadges {...baseProps} versionNumber={3} versionCount={3} />);
    expect(screen.queryByRole('button', { name: /prior version/ })).not.toBeInTheDocument();
    expect(screen.getByText('2 prior versions')).toBeInTheDocument();
  });
});

// ── Layout ───────────────────────────────────────────────────────────────────

describe('MetadataBadges — layout', () => {
  it('renders a flex container', () => {
    const { container } = render(<MetadataBadges {...baseProps} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains('flex')).toBe(true);
  });
});
