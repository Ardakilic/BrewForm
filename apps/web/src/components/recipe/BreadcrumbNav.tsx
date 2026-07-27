import { BREW_METHODS } from '@brewform/shared/constants';
import { Breadcrumb, type BreadcrumbItem } from '../ui/Breadcrumb.tsx';
import { useTranslation } from '../../contexts/I18nContext.tsx';

interface BreadcrumbNavProps {
  brewMethod: string | null | undefined;
  recipeTitle: string;
}

function getBrewMethodLabel(value: string, t: (key: string) => string): string {
  const found = BREW_METHODS.find((m) => m.value === value);
  if (found) return t(`brewMethod.${value}`);
  // Fallback: replace underscores with spaces and title-case each word
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function truncateTitle(title: string): string {
  if (title.length <= 40) return title;
  return title.slice(0, 37) + '…';
}

/**
 * Breadcrumb trail for recipe pages: Recipes → brew method (as filter
 * link) → truncated recipe title. Thin adapter over the generic
 * {@link Breadcrumb} primitive.
 */
export function BreadcrumbNav({ brewMethod, recipeTitle }: BreadcrumbNavProps) {
  const { t } = useTranslation();
  const items: BreadcrumbItem[] = [
    { label: t('recipe.list.title'), to: '/recipes' },
    ...(brewMethod
      ? [{ label: getBrewMethodLabel(brewMethod, t), to: `/recipes?brewMethod=${brewMethod}` }]
      : []),
    { label: truncateTitle(recipeTitle) },
  ];

  return <Breadcrumb items={items} />;
}
