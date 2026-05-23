import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactPage } from './ContactPage.tsx';

vi.mock('../api/client.ts', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('../contexts/I18nContext.tsx', () => ({
  useTranslation: vi.fn(),
}));

import { api } from '../api/client.ts';
import { useTranslation } from '../contexts/I18nContext.tsx';

const mockUseTranslation = vi.mocked(useTranslation);
const mockApiPost = vi.mocked(api.post);

const enT = (key: string) => {
  const map: Record<string, string> = {
    'contact.title': 'Contact Us',
    'contact.description': 'Send us a message',
    'contact.form.name': 'Name',
    'contact.form.email': 'Email',
    'contact.form.subject': 'Subject',
    'contact.form.message': 'Message',
    'contact.form.submit': 'Send',
    'contact.form.sending': 'Sending...',
    'contact.success.title': 'Message Sent',
    'contact.success.message': "We'll get back to you soon.",
    'error.500': 'Something went wrong',
  };
  return map[key] ?? key;
};

const defaultTranslation = {
  locale: 'en' as const,
  setLocale: vi.fn(),
  t: enT,
  availableLocales: ['en', 'tr'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseTranslation.mockReturnValue(defaultTranslation);
});

describe('ContactPage', () => {
  it('renders all form fields', () => {
    const { container } = render(<ContactPage />);

    expect(screen.getByText('Contact Us')).toBeInTheDocument();
    expect(screen.getByText('Send us a message')).toBeInTheDocument();

    expect(container.querySelector('input[name="name"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="email"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="subject"]')).toBeInTheDocument();
    expect(container.querySelector('textarea[name="message"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('submits form and shows success message', async () => {
    mockApiPost.mockResolvedValueOnce({ message: 'ok' });

    const { container } = render(<ContactPage />);

    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Alice' },
    });
    fireEvent.change(container.querySelector('input[name="email"]')!, {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(container.querySelector('input[name="subject"]')!, {
      target: { value: 'Test Subject' },
    });
    fireEvent.change(container.querySelector('textarea[name="message"]')!, {
      target: { value: 'This is a test message.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/contact', {
        name: 'Alice',
        email: 'alice@example.com',
        subject: 'Test Subject',
        message: 'This is a test message.',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Message Sent')).toBeInTheDocument();
      expect(screen.getByText("We'll get back to you soon.")).toBeInTheDocument();
    });
  });

  it('shows error message on API failure', async () => {
    mockApiPost.mockRejectedValueOnce(new Error('Network error'));

    const { container } = render(<ContactPage />);

    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Bob' },
    });
    fireEvent.change(container.querySelector('input[name="email"]')!, {
      target: { value: 'bob@example.com' },
    });
    fireEvent.change(container.querySelector('input[name="subject"]')!, {
      target: { value: 'Error Test' },
    });
    fireEvent.change(container.querySelector('textarea[name="message"]')!, {
      target: { value: 'This should fail.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.queryByText('Message Sent')).not.toBeInTheDocument();
  });
});
