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
      { id: '1', name: 'Scale', type: 'scale_accessory', brand: null },
    ]);

    const first = await getEquipmentCached();
    const second = await getEquipmentCached();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('getTasteNotesCached fetches once and memoises', async () => {
    const spy = vi.spyOn(tasteApi, 'flat').mockResolvedValue([
      { id: '1', name: 'Fruity', parentId: null, category: 'taste' },
    ]);

    const first = await getTasteNotesCached();
    const second = await getTasteNotesCached();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('invalidateStaticCache re-arms the equipment fetch', async () => {
    const spy = vi.spyOn(equipmentApi, 'list')
      .mockResolvedValueOnce([
        { id: '1', name: 'Scale', type: 'scale_accessory', brand: null },
      ])
      .mockResolvedValueOnce([
        { id: '2', name: 'Kettle', type: 'kettle', brand: null },
      ]);

    await getEquipmentCached();
    invalidateStaticCache();
    const after = await getEquipmentCached();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(after).toEqual([{ id: '2', name: 'Kettle', type: 'kettle', brand: null }]);
  });

  it('invalidateStaticCache re-arms the taste-notes fetch', async () => {
    const spy = vi.spyOn(tasteApi, 'flat')
      .mockResolvedValueOnce([
        { id: '1', name: 'Fruity', parentId: null, category: 'taste' },
      ])
      .mockResolvedValueOnce([
        { id: '2', name: 'Floral', parentId: null, category: 'taste' },
      ]);

    await getTasteNotesCached();
    invalidateStaticCache();
    const after = await getTasteNotesCached();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(after).toEqual([{ id: '2', name: 'Floral', parentId: null, category: 'taste' }]);
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
});
