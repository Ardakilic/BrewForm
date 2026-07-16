import '@testing-library/jest-dom';

// Hermetic Web Storage per test file.
//
// Root cause of flaky i18n failures (e.g. OnboardingWizard rendering in Turkish
// when the test expects English): under Deno, jsdom's `localStorage` is backed
// by a single store that is SHARED across test files in the same worker — and,
// because the backing store is persistent, across PARALLEL worker processes too.
// A file that writes `brewform_locale`/`brewform_theme` (e.g. HomePage.test.tsx,
// I18nContext.test.tsx) can therefore overwrite the key between another file's
// `localStorage.clear()` in `beforeEach` and its component render — a genuine
// cross-process race that makes tests fail nondeterministically.
//
// Fix: replace `localStorage` with a fresh in-memory Storage for every test
// file (setupFiles are evaluated once per test file, so each file gets its own
// Map). Writes can no longer leak across files or processes; each file's
// existing `beforeEach` → `localStorage.clear()` keeps tests within the file
// isolated from each other.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryLocalStorage = new MemoryStorage();
for (
  const target of [globalThis, globalThis.window] as Array<Record<string, unknown> | undefined>
) {
  if (!target) continue;
  try {
    Object.defineProperty(target, 'localStorage', {
      value: memoryLocalStorage,
      configurable: true,
      writable: true,
    });
  } catch {
    // If the property is non-configurable on one of the targets, the other
    // override still governs bare `localStorage` access in tests/components.
  }
}

// Tell React 19 it is running in a test environment so act() warnings work.
// Note: This only takes effect in ESM module scope. React 19's CJS development
// bundle uses strict mode, where bare global references (typeof IS_REACT_ACT_ENVIRONMENT)
// do NOT fall through to globalThis. This is a known Deno CJS compat limitation.
// The "not configured to support act()" warning may still appear in some test
// files (e.g., Navbar) where tests explicitly invoke React.act(). This warning
// is benign — all tests pass correctly.
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// React 19 calls window.reportError for recoverable errors. In Deno + jsdom
// this can crash with "parameter 1 is not of type 'Event'" because Deno's
// web implementation of reportError dispatches through jsdom's EventTarget
// with a plain object instead of an ErrorEvent instance. Override to log.
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as Record<string, unknown>).reportError = (error: unknown) => {
    console.error(error);
  };
}

// jsdom does not implement navigation, so clicking <a href="..."> elements
// emits a noisy "Not implemented: navigation to another Document" warning.
// Suppress it by preventing default on internal link clicks during tests.
if (typeof globalThis !== 'undefined') {
  globalThis.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.getAttribute('href')?.startsWith('/')) {
      event.preventDefault();
    }
  });
}
