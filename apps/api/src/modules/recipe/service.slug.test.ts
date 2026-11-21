/**
 * DB-backed regression tests for the recipe slug pipeline at the service layer
 * (spec: recipe-slug). Every title carries a per-run marker, so the tests never
 * depend on each other's rows; reserved, non-Latin and UUID titles are always
 * suffixed with a random suffix, so they need no marker.
 */
import '../../test-setup.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as service from './service.ts';
import { recipeInput, SFX, SlugFixtures, slugMarker, suffixedSlug } from './test-helpers.ts';

describe('recipe slug pipeline (service)', () => {
  const fixtures = new SlugFixtures();
  let author: Awaited<ReturnType<SlugFixtures['user']>>;
  let other: Awaited<ReturnType<SlugFixtures['user']>>;
  let third: Awaited<ReturnType<SlugFixtures['user']>>;

  beforeAll(async () => {
    author = await fixtures.user('slug-author');
    other = await fixtures.user('slug-other');
    third = await fixtures.user('slug-third');
  });

  afterAll(async () => {
    await fixtures.cleanup();
  });

  it('suffixes the second recipe with the same title', async () => {
    const m = slugMarker();
    const first = await service.createRecipe(author.id, recipeInput(`Morning V60 ${m}`));
    const second = await service.createRecipe(other.id, recipeInput(`Morning V60 ${m}`));
    expect(first!.slug).toBe(`morning-v60-${m}`);
    expect(second!.slug).toMatch(suffixedSlug(`morning-v60-${m}`));
  });

  it('suffixes a title held by a soft-deleted recipe and keeps the deleted slug', async () => {
    const m = slugMarker();
    const deleted = await service.createRecipe(author.id, recipeInput(`Espresso ${m}`));
    await service.deleteRecipe(deleted!.id, author.id);

    const fresh = await service.createRecipe(author.id, recipeInput(`Espresso ${m}`));
    expect(fresh!.slug).toMatch(suffixedSlug(`espresso-${m}`));
    const deletedRow = await fixtures.rawRecipe(deleted!.id);
    expect(deletedRow.deletedAt).not.toBeNull();
    expect(deletedRow.slug).toBe(`espresso-${m}`);
  });

  it('always suffixes reserved and UUID-shaped titles', async () => {
    const created = await service.createRecipe(author.id, recipeInput('New'));
    expect(created!.slug).toMatch(suffixedSlug('new'));

    const starred = await service.createRecipe(author.id, recipeInput('Starred'));
    expect(starred!.slug).toMatch(suffixedSlug('starred'));

    const uuid = crypto.randomUUID();
    const uuidTitled = await service.createRecipe(author.id, recipeInput(uuid));
    expect(uuidTitled!.slug).toMatch(suffixedSlug(uuid));
  });

  it('falls back to recipe-<sfx> for titles without ASCII-mappable characters', async () => {
    for (const title of ['東京コーヒー', 'Кофе', '!!!']) {
      const created = await service.createRecipe(author.id, recipeInput(title));
      expect(created!.slug).toMatch(new RegExp(`^recipe-${SFX}$`));
    }
  });

  it('forks the same recipe twice without a title', async () => {
    const m = slugMarker();
    const source = await service.createRecipe(author.id, recipeInput(`Espresso ${m}`));

    const forkB = await service.forkRecipe(source!.id, other.id);
    const forkC = await service.forkRecipe(source!.id, third.id);
    expect(forkB.slug).toBe(`fork-of-espresso-${m}`);
    expect(forkC.slug).toMatch(suffixedSlug(`fork-of-espresso-${m}`));
  });

  it('sanitizes the fork title and falls back when it sanitizes to empty', async () => {
    const m = slugMarker();
    const source = await service.createRecipe(author.id, recipeInput(`Espresso ${m}`));

    const named = await service.forkRecipe(source!.id, other.id, `<b>My</b> Fork ${m}`);
    expect(named.title).toBe(`My Fork ${m}`);
    expect(named.slug).toBe(`my-fork-${m}`);

    const fallback = await service.forkRecipe(source!.id, third.id, '<b></b>');
    expect(fallback.title).toBe(`Fork of Espresso ${m}`);
  });

  it('gives two merges with the same title distinct slugs', async () => {
    const m = slugMarker();
    const a = await service.createRecipe(author.id, recipeInput(`Merge A ${m}`));
    const b = await service.createRecipe(author.id, recipeInput(`Merge B ${m}`));
    const payload = {
      recipeVersionId1: a!.versions[0].id,
      recipeVersionId2: b!.versions[0].id,
      title: `Best Of Both ${m}`,
      selections: {},
    };

    const first = await service.mergeRecipes(author.id, payload);
    const second = await service.mergeRecipes(author.id, payload);
    expect(first!.slug).toBe(`best-of-both-${m}`);
    expect(second!.slug).toMatch(suffixedSlug(`best-of-both-${m}`));
  });

  it('lets two concurrent creates with the same new title both succeed', async () => {
    const m = slugMarker();
    const [x, y] = await Promise.all([
      service.createRecipe(author.id, recipeInput(`Race ${m}`)),
      service.createRecipe(other.id, recipeInput(`Race ${m}`)),
    ]);
    const slugs = [x!.slug, y!.slug].sort();
    expect(slugs[0]).toBe(`race-${m}`);
    expect(slugs[1]).toMatch(suffixedSlug(`race-${m}`));
    expect(await fixtures.versionCount(x!.id)).toBe(1);
    expect(await fixtures.versionCount(y!.id)).toBe(1);
  });

  it('keeps the slug when the title changes (amend and bump)', async () => {
    const m = slugMarker();
    const created = await service.createRecipe(author.id, recipeInput(`Morning ${m}`));

    const amended = await service.updateRecipe(created!.id, author.id, {
      bumpVersion: false,
      title: `Evening ${m}`,
    });
    expect(amended!.title).toBe(`Evening ${m}`);
    expect(amended!.slug).toBe(`morning-${m}`);

    const bumped = await service.updateRecipe(created!.id, author.id, {
      bumpVersion: true,
      title: `Night ${m}`,
    });
    expect(bumped!.title).toBe(`Night ${m}`);
    expect(bumped!.slug).toBe(`morning-${m}`);
  });
});
