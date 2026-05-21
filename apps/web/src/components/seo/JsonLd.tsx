interface RecipeJsonLdProps {
  title: string;
  description: string;
  slug: string;
  authorName: string;
  authorUsername?: string;
  datePublished: string;
  image?: string;
  extractionTimeSeconds?: number | null;
  extractionVolumeMl?: number | null;
  groundWeightGrams?: number | null;
  grindSize?: string | null;
  productName?: string | null;
  brewMethod?: string | null;
  drinkType?: string | null;
  preparationNotes?: string | null;
  temperatureCelsius?: number | null;
  tasteNoteNames?: string[];
  additionalPreparations?: Array<{
    name: string;
    inputAmount: string;
    type: string;
  }>;
  avgRating?: number | null;
  ratingCount?: number;
}

function toIsoDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0 && s > 0) return `PT${m}M${s}S`;
  if (m > 0) return `PT${m}M`;
  return `PT${s}S`;
}

function formatBrewMethod(method: string): string {
  return method
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function RecipeJsonLd(props: RecipeJsonLdProps) {
  const {
    title,
    description,
    slug,
    authorName,
    authorUsername,
    datePublished,
    image,
    extractionTimeSeconds,
    extractionVolumeMl,
    groundWeightGrams,
    grindSize,
    productName,
    brewMethod,
    drinkType,
    preparationNotes,
    tasteNoteNames,
    additionalPreparations,
    avgRating,
    ratingCount,
  } = props;

  const ingredients: string[] = [];
  if (productName) {
    ingredients.push(productName);
  }
  if (groundWeightGrams) {
    const grindLabel = grindSize ? ` (${grindSize} grind)` : '';
    ingredients.push(`${groundWeightGrams}g ground coffee${grindLabel}`);
  }
  if (additionalPreparations?.length) {
    for (const prep of additionalPreparations) {
      ingredients.push(`${prep.inputAmount} ${prep.name} (${prep.type})`);
    }
  }

  const instructions: Array<{ '@type': string; text: string }> = [];
  if (preparationNotes) {
    const steps = preparationNotes.split(/\n+/).filter((s) => s.trim());
    for (const step of steps) {
      instructions.push({
        '@type': 'HowToStep',
        text: step.trim(),
      });
    }
  }

  const keywords: string[] = [];
  if (brewMethod) keywords.push(formatBrewMethod(brewMethod));
  if (drinkType) keywords.push(formatBrewMethod(drinkType));
  if (tasteNoteNames?.length) keywords.push(...tasteNoteNames);
  keywords.push('coffee', 'brewing', 'recipe');

  const recipeJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'Recipe',
    name: title,
    description,
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUsername ? { url: `${globalThis.location.origin}/u/${authorUsername}` } : {}),
    },
    url: `${globalThis.location.origin}/recipes/${slug}`,
    datePublished,
    keywords: keywords.join(', '),
    recipeCategory: brewMethod ? formatBrewMethod(brewMethod) : 'Coffee',
    ...(image ? { image } : {}),
    ...(extractionTimeSeconds ? { cookTime: toIsoDuration(extractionTimeSeconds) } : {}),
    ...(extractionVolumeMl ? { recipeYield: `${extractionVolumeMl}ml` } : {}),
    ...(ingredients.length ? { recipeIngredient: ingredients } : {}),
    ...(instructions.length ? { recipeInstructions: instructions } : {}),
    ...(avgRating && ratingCount && ratingCount > 0
      ? {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: avgRating,
          ratingCount,
          bestRating: 10,
          worstRating: 1,
        },
      }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: globalThis.location.origin,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Recipes',
        item: `${globalThis.location.origin}/recipes`,
      },
      ...(brewMethod
        ? [
          {
            '@type': 'ListItem',
            position: 3,
            name: formatBrewMethod(brewMethod),
            item: `${globalThis.location.origin}/recipes?brewMethod=${brewMethod}`,
          },
          {
            '@type': 'ListItem',
            position: 4,
            name: title,
          },
        ]
        : [
          {
            '@type': 'ListItem',
            position: 3,
            name: title,
          },
        ]),
    ],
  };

  return (
    <>
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(recipeJsonLd) }}
      />
      <script
        type='application/ld+json'
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
    </>
  );
}
