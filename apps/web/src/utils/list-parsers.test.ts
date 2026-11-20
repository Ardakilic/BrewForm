import { describe, expect, it } from 'vitest';
import {
  parseCoffeeVarietyCatalogParams,
  parseEquipmentCatalogParams,
  parseNotificationListParams,
  parsePageOnlyParams,
  parseTasteNotesParams,
} from './list-parsers.ts';

const sp = (query: string) => new URLSearchParams(query);

describe('list parsers', () => {
  it('parses the equipment catalogue, accepting a legacy search link', () => {
    expect(parseEquipmentCatalogParams(sp('type=grinder&q=stagg&page=2'))).toEqual({
      page: 2,
      type: 'grinder',
      q: 'stagg',
    });
    expect(parseEquipmentCatalogParams(sp('search=fellow&type=bogus&page=-1'))).toEqual({
      page: 1,
      type: '',
      q: 'fellow',
    });
  });

  it('parses the coffee-variety catalogue, normalising unknown categories', () => {
    expect(parseCoffeeVarietyCatalogParams(sp('category=processing&q=washed'))).toEqual({
      page: 1,
      category: 'processing',
      q: 'washed',
    });
    expect(parseCoffeeVarietyCatalogParams(sp('category=nope')).category).toBe('');
  });

  it('parses notifications (unreadOnly only for the literal true)', () => {
    expect(parseNotificationListParams(sp('unreadOnly=true&page=3'))).toEqual({
      page: 3,
      unreadOnly: true,
    });
    expect(parseNotificationListParams(sp('unreadOnly=1&page=abc'))).toEqual({
      page: 1,
      unreadOnly: false,
    });
  });

  it('parses page-only lists and the taste-note filter', () => {
    expect(parsePageOnlyParams(sp('page=4'))).toEqual({ page: 4 });
    expect(parsePageOnlyParams(sp(''))).toEqual({ page: 1 });
    expect(parseTasteNotesParams(sp('q=%20berry%20'))).toEqual({ q: 'berry' });
  });
});
