import { describe, expect, it } from 'vitest';
import { extractListParams } from './recipe-filters.ts';

/**
 * recipe-filters — extractListParams parses sanitised recipe-list query
 * params from the URL: clamps `page` to a positive integer, defaults
 * `perPage`/`sortBy`, drops empty filters, and rejects non-UUID
 * equipment/variety ids.
 */
describe('extractListParams', () => {
  it('returns default page=1, perPage=12, sortBy=createdAt for an empty query string', () => {
    const params = extractListParams(new URLSearchParams(''));
    expect(params.page).toBe('1');
    expect(params.perPage).toBe('12');
    expect(params.sortBy).toBe('createdAt');
  });

  it('uses the provided sortBy value', () => {
    const params = extractListParams(new URLSearchParams('sortBy=likeCount'));
    expect(params.sortBy).toBe('likeCount');
  });

  it('clamps a negative page to 1', () => {
    const params = extractListParams(new URLSearchParams('page=-5'));
    expect(params.page).toBe('1');
  });

  it('clamps page=0 to 1', () => {
    const params = extractListParams(new URLSearchParams('page=0'));
    expect(params.page).toBe('1');
  });

  it('clamps a non-numeric page to 1', () => {
    const params = extractListParams(new URLSearchParams('page=abc'));
    expect(params.page).toBe('1');
  });

  it('accepts a valid positive integer page', () => {
    const params = extractListParams(new URLSearchParams('page=3'));
    expect(params.page).toBe('3');
  });

  it('preserves the brewMethod filter when provided', () => {
    const params = extractListParams(new URLSearchParams('brewMethod=pourover'));
    expect(params.brewMethod).toBe('pourover');
  });

  it('preserves the drinkType filter when provided', () => {
    const params = extractListParams(new URLSearchParams('drinkType=espresso'));
    expect(params.drinkType).toBe('espresso');
  });

  it('preserves the visibility filter when provided', () => {
    const params = extractListParams(new URLSearchParams('visibility=public'));
    expect(params.visibility).toBe('public');
  });

  it('preserves the search filter when provided', () => {
    const params = extractListParams(new URLSearchParams('search=colombian'));
    expect(params.search).toBe('colombian');
  });

  it('preserves the mainBrewer filter when provided', () => {
    const params = extractListParams(new URLSearchParams('mainBrewer=v60'));
    expect(params.mainBrewer).toBe('v60');
  });

  it('preserves the tasteNoteIds filter when provided', () => {
    const params = extractListParams(new URLSearchParams('tasteNoteIds=tn1,tn2'));
    expect(params.tasteNoteIds).toBe('tn1,tn2');
  });

  it('drops empty string filter values', () => {
    const params = extractListParams(new URLSearchParams('brewMethod=&search='));
    expect(params.brewMethod).toBeUndefined();
    expect(params.search).toBeUndefined();
  });

  it('accepts a valid UUID for equipmentId', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const params = extractListParams(new URLSearchParams(`equipmentId=${uuid}`));
    expect(params.equipmentId).toBe(uuid);
  });

  it('rejects a non-UUID equipmentId', () => {
    const params = extractListParams(new URLSearchParams('equipmentId=not-a-uuid'));
    expect(params.equipmentId).toBeUndefined();
  });

  it('accepts a valid UUID for coffeeVarietyId', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const params = extractListParams(new URLSearchParams(`coffeeVarietyId=${uuid}`));
    expect(params.coffeeVarietyId).toBe(uuid);
  });

  it('rejects a non-UUID coffeeVarietyId', () => {
    const params = extractListParams(new URLSearchParams('coffeeVarietyId=abc'));
    expect(params.coffeeVarietyId).toBeUndefined();
  });

  it('round-trips a full filter set through URLSearchParams → extractListParams', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const original = new URLSearchParams({
      page: '2',
      sortBy: 'likeCount',
      brewMethod: 'espresso',
      drinkType: 'cappuccino',
      visibility: 'unlisted',
      search: 'ethiopia',
      mainBrewer: 'la marzocco',
      tasteNoteIds: 't1,t2,t3',
      equipmentId: uuid,
      coffeeVarietyId: uuid,
    });
    const params = extractListParams(original);
    expect(params).toEqual({
      page: '2',
      perPage: '12',
      sortBy: 'likeCount',
      brewMethod: 'espresso',
      drinkType: 'cappuccino',
      visibility: 'unlisted',
      search: 'ethiopia',
      mainBrewer: 'la marzocco',
      tasteNoteIds: 't1,t2,t3',
      equipmentId: uuid,
      coffeeVarietyId: uuid,
    });
  });

  it('re-serializing the extracted params and re-parsing returns the same values', () => {
    const uuid = 'deadbeef-0000-1111-2222-333333333333';
    const first = extractListParams(
      new URLSearchParams(`page=4&sortBy=commentCount&brewMethod=aeropress&equipmentId=${uuid}`),
    );
    // Re-serialize: only the keys that extractListParams returns
    const reSerialized = new URLSearchParams();
    for (const [k, v] of Object.entries(first)) {
      reSerialized.set(k, v);
    }
    const second = extractListParams(reSerialized);
    expect(second).toEqual(first);
  });
});
