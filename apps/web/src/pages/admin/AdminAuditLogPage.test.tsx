import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

vi.mock('../../contexts/I18nContext.tsx', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      const map: Record<string, string> = {
        'admin.auditLog': 'Denetim Günlüğü',
        'admin.audit.allEntities': 'Tüm Varlıklar',
        'admin.audit.date': 'Tarih',
        'admin.audit.admin': 'Yönetici',
        'admin.audit.action': 'Eylem',
        'admin.audit.entity': 'Varlık',
        'admin.audit.details': 'Detaylar',
        'common.loading': 'Yükleniyor...',
        'common.previous': 'Önceki',
        'common.next': 'İleri',
      };
      return map[k] ?? k;
    },
    locale: 'tr',
    setLocale: vi.fn(),
    availableLocales: ['en', 'tr'],
  }),
}));

vi.mock('../../api/client.ts', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../api/client.ts';
import { AdminAuditLogPage } from './AdminAuditLogPage.tsx';

const mockApi = vi.mocked(api);

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.get.mockResolvedValue({ logs: [], total: 0 });
});

describe('AdminAuditLogPage — tr locale spot-check', () => {
  it('renders the Turkish audit-log heading', async () => {
    render(<AdminAuditLogPage />);

    await waitFor(() => {
      expect(screen.getByText('Denetim Günlüğü')).toBeInTheDocument();
    });
  });
});
