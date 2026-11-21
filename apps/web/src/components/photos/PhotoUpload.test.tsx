import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPhotoAction } from '../../routes/resources/photos.ts';
import { installNodeFormDataGlobals } from '../../test-utils/node-form-data.ts';
import { renderWithAppProviders } from '../../test-utils/render.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';

vi.mock('../../api/client.ts', () => ({
  api: { upload: vi.fn() },
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

import { api } from '../../api/client.ts';
import { ApiError } from '../../api/errors.ts';

const mockApi = vi.mocked(api);

/**
 * Renders the uploader with the real `resources/photos` resource action registered, inside the
 * app providers (English), and returns the render result.
 */
function render(ui: React.ReactElement) {
  return renderWithAppProviders(
    [
      { path: '/', element: ui },
      { path: '/resources/photos', action: uploadPhotoAction },
    ],
    { auth: 'user', locale: 'en' },
  );
}

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
}

function selectFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

// Stub Image so `new Image()` returns an element whose onload fires
// asynchronously when `src` is assigned, with naturalWidth/Height set.
function FakeImage(this: unknown) {
  const el = {
    naturalWidth: 100,
    naturalHeight: 100,
    onload: null as ((ev: Event) => void) | null,
    onerror: null as ((ev: Event) => void) | null,
    _src: '',
    set src(value: string) {
      this._src = value;
      // Fire onload asynchronously so the awaiting promise resolves.
      setTimeout(() => this.onload?.(new Event('load')), 0);
    },
    get src() {
      return this._src;
    },
  };
  return el;
}

/**
 * jsdom's `Image` never fires `onload` (no real image decoding), and
 * `URL.createObjectURL` is not implemented. Stub both so the
 * `createThumbnail` promise resolves and the upload loop can proceed.
 */
function stubImageAndObjectUrls() {
  const originalImage = globalThis.Image;
  Object.defineProperty(globalThis, 'Image', {
    value: FakeImage,
    configurable: true,
    writable: true,
  });

  // Stub URL.createObjectURL / revokeObjectURL (jsdom warns otherwise)
  const createObjectURL = vi.fn(() => 'blob:fake-url');
  const revokeObjectURL = vi.fn();
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURL,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURL,
    configurable: true,
    writable: true,
  });

  return () => {
    Object.defineProperty(globalThis, 'Image', {
      value: originalImage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreate,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevoke,
      configurable: true,
      writable: true,
    });
  };
}

/**
 * jsdom has no 2D canvas, so `createThumbnail` would give up (no thumbnail).
 * Stub `getContext` and `toBlob` so a JPEG thumbnail blob is produced.
 */
function stubCanvas() {
  const proto = HTMLCanvasElement.prototype;
  const originalGetContext = proto.getContext;
  const originalToBlob = proto.toBlob;
  Object.defineProperty(proto, 'getContext', {
    value: () => ({ drawImage: () => undefined }),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(proto, 'toBlob', {
    value(callback: BlobCallback) {
      callback(new Blob(['thumb'], { type: 'image/jpeg' }));
    },
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(proto, 'getContext', {
      value: originalGetContext,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(proto, 'toBlob', {
      value: originalToBlob,
      configurable: true,
      writable: true,
    });
  };
}

/** A rejection from the API client: an `ApiError` carrying the server error `code`. */
function apiError(code: string): Error {
  return new ApiError(code, code, undefined, 400);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await installNodeFormDataGlobals();
  vi.clearAllMocks();
  mockApi.upload.mockResolvedValue({ id: 'p1', url: '/uploads/p1.jpg' } as unknown as Awaited<
    ReturnType<typeof api.upload<Record<string, unknown>>>
  >);
});

/**
 * PhotoUpload — drag-and-drop / file-picker photo uploader. Validates
 * file type (JPEG/PNG/WebP) and size (≤10MB), generates a client-side
 * thumbnail, and submits each file to the `resources/photos` action, which POSTs it to
 * `/photos` via `api.upload`.
 */
describe('PhotoUpload', () => {
  it('renders the drop zone with file input and instructions', () => {
    const { container } = render(<PhotoUpload recipeId="r1" />);
    expect(screen.getByText('Drop photos here or click to browse')).toBeInTheDocument();
    expect(screen.getByText(/JPEG, PNG, or WebP — Max 10MB each/i)).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.accept).toBe('image/jpeg,image/png,image/webp');
  });

  it('displays an error for unsupported file types and skips upload', async () => {
    const { container } = render(<PhotoUpload recipeId="r1" />);
    selectFile(container, makeFile('doc.txt', 'text/plain'));
    await waitFor(() => {
      expect(screen.getByText(/Unsupported file type/i)).toBeInTheDocument();
    });
    expect(mockApi.upload).not.toHaveBeenCalled();
  });

  it('displays an error when the file exceeds 10MB and skips upload', async () => {
    const { container } = render(<PhotoUpload recipeId="r1" />);
    selectFile(container, makeFile('huge.jpg', 'image/jpeg', 11 * 1024 * 1024));
    await waitFor(() => {
      expect(screen.getByText(/File too large/i)).toBeInTheDocument();
    });
    expect(mockApi.upload).not.toHaveBeenCalled();
  });

  it('uploads a valid JPEG and calls onUploadComplete with the result', async () => {
    const restore = stubImageAndObjectUrls();
    try {
      const onUploadComplete = vi.fn();
      const { container } = render(
        <PhotoUpload recipeId="r1" onUploadComplete={onUploadComplete} />,
      );
      selectFile(container, makeFile('photo.jpg', 'image/jpeg', 2048));
      await waitFor(() => {
        expect(mockApi.upload).toHaveBeenCalledWith('/photos', expect.any(FormData), {
          signal: expect.any(AbortSignal),
        });
      });
      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalledWith([{ id: 'p1', url: '/uploads/p1.jpg' }]);
      });
    } finally {
      restore();
    }
  });

  it('sends fixed multipart filenames instead of the local filenames', async () => {
    const restoreImage = stubImageAndObjectUrls();
    const restoreCanvas = stubCanvas();
    try {
      const { container } = render(<PhotoUpload recipeId="r1" />);
      selectFile(container, makeFile('my holiday at home.png', 'image/png', 2048));
      await waitFor(() => {
        expect(mockApi.upload).toHaveBeenCalledTimes(1);
      });
      const form = mockApi.upload.mock.calls[0][1] as FormData;
      expect(form.get('recipeId')).toBe('r1');
      expect((form.get('file') as File).name).toBe('photo.png');
      expect((form.get('thumbnail') as File).name).toBe('thumbnail.jpg');
      for (const [, value] of form.entries()) {
        if (value instanceof File) expect(value.name).not.toContain('holiday');
      }
    } finally {
      restoreCanvas();
      restoreImage();
    }
  });

  it.each([
    ['FILE_TOO_LARGE', /photo\.jpg: File too large/i],
    ['PAYLOAD_TOO_LARGE', /photo\.jpg: File too large/i],
    ['UNSUPPORTED_MEDIA_TYPE', /photo\.jpg: Unsupported file type/i],
    ['INVALID_IMAGE', /photo\.jpg: Unsupported file type/i],
    ['INTERNAL_ERROR', /Failed to upload photo\.jpg/i],
  ])('maps a server %s rejection to its message', async (code, message) => {
    mockApi.upload.mockRejectedValueOnce(apiError(code));
    const restore = stubImageAndObjectUrls();
    try {
      const { container } = render(<PhotoUpload recipeId="r1" />);
      selectFile(container, makeFile('photo.jpg', 'image/jpeg', 1024));
      await waitFor(() => {
        expect(screen.getByText(message)).toBeInTheDocument();
      });
    } finally {
      restore();
    }
  });

  it('shows an error message when api.upload rejects', async () => {
    mockApi.upload.mockRejectedValueOnce(new Error('network'));
    const restore = stubImageAndObjectUrls();
    try {
      const { container } = render(<PhotoUpload recipeId="r1" />);
      selectFile(container, makeFile('photo.png', 'image/png', 1024));
      await waitFor(() => {
        expect(screen.getByText(/Failed to upload photo\.png/i)).toBeInTheDocument();
      });
    } finally {
      restore();
    }
  });
});
