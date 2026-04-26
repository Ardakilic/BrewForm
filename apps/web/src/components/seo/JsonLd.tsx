interface RecipeJsonLdProps {
  title: string;
  description: string;
  slug: string;
  authorName: string;
  datePublished: string;
  image?: string;
}

export function RecipeJsonLd({ title, description, slug, authorName, datePublished, image }: RecipeJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Recipe',
    name: title,
    description,
    author: {
      '@type': 'Person',
      name: authorName,
    },
    url: `${globalThis.location.origin}/recipes/${slug}`,
    datePublished,
    ...(image ? { image } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}