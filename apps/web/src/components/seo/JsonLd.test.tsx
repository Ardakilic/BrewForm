import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RecipeJsonLd } from './JsonLd.tsx';

describe('RecipeJsonLd', () => {
  const baseProps = {
    title: 'V60 Ethiopian',
    description: 'A bright pour-over',
    slug: 'v60-ethiopian',
    authorName: 'Barista',
    datePublished: '2025-01-15T00:00:00Z',
  };

  it('renders basic Recipe schema', () => {
    const { container } = render(<RecipeJsonLd {...baseProps} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(2);

    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe['@type']).toBe('Recipe');
    expect(recipe.name).toBe('V60 Ethiopian');
    expect(recipe.author.name).toBe('Barista');
  });

  it('includes cookTime (but NOT totalTime) when extractionTimeSeconds provided', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} extractionTimeSeconds={150} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.cookTime).toBe('PT2M30S');
    expect(recipe.totalTime).toBeUndefined();
  });

  it('includes recipeYield from extractionVolumeMl', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} extractionVolumeMl={36} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.recipeYield).toBe('36ml');
  });

  it('builds recipeIngredient from coffee data', () => {
    const { container } = render(
      <RecipeJsonLd
        {...baseProps}
        productName="Ethiopian Yirgacheffe"
        groundWeightGrams={18}
        grindSize="fine"
        extractionVolumeMl={250}
      />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.recipeIngredient).toContain('Ethiopian Yirgacheffe');
    expect(recipe.recipeIngredient).toContain('18g ground coffee (fine grind)');
    expect(recipe.recipeIngredient).not.toContain('250ml water');
    expect(recipe.recipeYield).toBe('250ml');
  });

  it('includes aggregateRating when available', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} avgRating={8.5} ratingCount={12} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.aggregateRating['@type']).toBe('AggregateRating');
    expect(recipe.aggregateRating.ratingValue).toBe(8.5);
    expect(recipe.aggregateRating.ratingCount).toBe(12);
    expect(recipe.aggregateRating.bestRating).toBe(10);
  });

  it('renders BreadcrumbList JSON-LD', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} brewMethod="v60" />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const breadcrumb = JSON.parse(scripts[1].textContent || '');
    expect(breadcrumb['@type']).toBe('BreadcrumbList');
    expect(breadcrumb.itemListElement.length).toBe(4);
    expect(breadcrumb.itemListElement[0].name).toBe('Home');
    expect(breadcrumb.itemListElement[1].name).toBe('Recipes');
  });

  it('includes keywords from brew method, drink type, and taste notes', () => {
    const { container } = render(
      <RecipeJsonLd
        {...baseProps}
        brewMethod="v60"
        drinkType="pour_over"
        tasteNoteNames={['Chocolate', 'Berry']}
      />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.keywords).toContain('V60');
    expect(recipe.keywords).toContain('Pour Over');
    expect(recipe.keywords).toContain('Chocolate');
    expect(recipe.keywords).toContain('Berry');
  });

  it('omits aggregateRating when ratingCount is zero', () => {
    const { container } = render(
      <RecipeJsonLd {...baseProps} avgRating={null} ratingCount={0} />,
    );
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    const recipe = JSON.parse(scripts[0].textContent || '');
    expect(recipe.aggregateRating).toBeUndefined();
  });
});