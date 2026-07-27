import type { ReactNode } from 'react';

/** Allowed page-shell max-widths (mirrors the house `max-w-*` scale). */
export type PageContainerWidth = 'md' | '2xl' | '4xl' | '6xl';

const widthClasses: Record<PageContainerWidth, string> = {
  md: 'max-w-md',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

/** Props accepted by {@link PageContainer}. */
interface PageContainerProps {
  /** Max-width tier: forms `2xl`, list/detail `4xl` (default), browse/grid `6xl`, auth `md`. */
  width?: PageContainerWidth;
  /** Extra classes appended to the wrapper (e.g. `py-12` for auth pages). */
  className?: string;
  children: ReactNode;
}

/**
 * Standard page shell: `mx-auto max-w-{width} px-6 py-8`. Use this instead of
 * bare container classes so page widths cannot drift again.
 */
export function PageContainer({ width = '4xl', className = '', children }: PageContainerProps) {
  return (
    <div className={`mx-auto ${widthClasses[width]} px-6 py-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
