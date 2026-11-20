import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { equipmentApi, tasteApi } from './index.ts';
import { getEquipmentCached, getTasteNotesCached, invalidateStaticCache } from './static-cache.ts';

beforeEach(() => {
  invalidateStaticCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('static-cache', () => {
  it('getEquipmentCached fetches once and memoises', async () => {
    const spy = vi.spyOn(equipmentApi, 'list').mockResolvedValue([
      {
        id: '1',
        name: 'Scale',
        type: 'scale_accessory',
        brand: null,
        model: null,
        description: null,
        createdBy: null,
        isSystem: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      },
    ]);

    const first = await getEquipmentCached();
    const second = await getEquipmentCached();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('getTasteNotesCached fetches once and memoises', async () => {
    const spy = vi.spyOn(tasteApi, 'flat').mockResolvedValue([
      {
        id: '1',
        name: 'Fruity',
        parentId: null,
        color: null,
        definition: null,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      },
    ]);

    const first = await getTasteNotesCached();
    const second = await getTasteNotesCached();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('invalidateStaticCache re-arms the equipment fetch', async () => {
    const spy = vi
      .spyOn(equipmentApi, 'list')
      .mockResolvedValueOnce([
        {
          id: '1',
          name: 'Scale',
          type: 'scale_accessory',
          brand: null,
          model: null,
          description: null,
          createdBy: null,
          isSystem: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '2',
          name: 'Kettle',
          type: 'kettle',
          brand: null,
          model: null,
          description: null,
          createdBy: null,
          isSystem: false,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          deletedAt: null,
        },
      ]);

    await getEquipmentCached();
    invalidateStaticCache();
    const after = await getEquipmentCached();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(after).toEqual([
      {
        id: '2',
        name: 'Kettle',
        type: 'kettle',
        brand: null,
        model: null,
        description: null,
        createdBy: null,
        isSystem: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      },
    ]);
  });

  it('invalidateStaticCache re-arms the taste-notes fetch', async () => {
    const spy = vi
      .spyOn(tasteApi, 'flat')
      .mockResolvedValueOnce([
        {
          id: '1',
          name: 'Fruity',
          parentId: null,
          color: null,
          definition: null,
          depth: 0,
          createdAt: '2024-01-01T00:00:00Z',
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '2',
          name: 'Floral',
          parentId: null,
          color: null,
          definition: null,
          depth: 0,
          createdAt: '2024-01-01T00:00:00Z',
          deletedAt: null,
        },
      ]);

    await getTasteNotesCached();
    invalidateStaticCache();
    const after = await getTasteNotesCached();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(after).toEqual([
      {
        id: '2',
        name: 'Floral',
        parentId: null,
        color: null,
        definition: null,
        depth: 0,
        createdAt: '2024-01-01T00:00:00Z',
        deletedAt: null,
      },
    ]);
  });

  it('invalidateStaticCache writes the bust key', () => {
    invalidateStaticCache();
    const value = globalThis.localStorage.getItem('brewform-static-cache-bust');
    expect(value).not.toBeNull();
    expect(typeof value).toBe('string');
  });

  it('invalidateStaticCache swallows setItem errors', () => {
    const originalSetItem = globalThis.localStorage.setItem.bind(globalThis.localStorage);
    globalThis.localStorage.setItem = () => {
      throw new Error('Storage quota exceeded');
    };

    expect(() => invalidateStaticCache()).not.toThrow();

    globalThis.localStorage.setItem = originalSetItem;
  });

  describe('single-flight', () => {
    /** A promise whose resolution the test controls. */
    function deferred<T>() {
      let resolve!: (value: T) => void;
      let reject!: (err: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it('shares one taste-note request between concurrent callers', async () => {
      const pending = deferred<Awaited<ReturnType<typeof tasteApi.flat>>>();
      const spy = vi.spyOn(tasteApi, 'flat').mockReturnValue(pending.promise);

      const first = getTasteNotesCached();
      const second = getTasteNotesCached();
      pending.resolve([]);

      const [a, b] = await Promise.all([first, second]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
    });

    it('does not cache a failed equipment request: the next call retries', async () => {
      const spy = vi
        .spyOn(equipmentApi, 'list')
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValueOnce([]);

      await expect(getEquipmentCached()).rejects.toThrow('down');
      await expect(getEquipmentCached()).resolves.toEqual([]);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("an aborted caller stops waiting without cancelling the other callers' request", async () => {
      const pending = deferred<Awaited<ReturnType<typeof equipmentApi.list>>>();
      const spy = vi.spyOn(equipmentApi, 'list').mockReturnValue(pending.promise);
      const controller = new AbortController();

      const aborted = getEquipmentCached({ signal: controller.signal });
      const other = getEquipmentCached();
      controller.abort();
      pending.resolve([]);

      await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
      await expect(other).resolves.toEqual([]);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('invalidateStaticCache drops an in-flight request so the next call starts a new one', async () => {
      const spy = vi
        .spyOn(tasteApi, 'flat')
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValueOnce([]);

      void getTasteNotesCached();
      invalidateStaticCache();
      await expect(getTasteNotesCached()).resolves.toEqual([]);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
