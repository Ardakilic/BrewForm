import { useSafeT } from '../../../utils/safe-translation.ts';

interface IconProps {
  size?: number;
  className?: string;
  label?: string;
}

/** SVG icon for a paper filter. */
export function PaperFilterIcon({ size = 24, className, label }: IconProps) {
  const t = useSafeT();
  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      role='img'
      aria-label={label ?? t('a11y.equipment.paperFilter')}
      className={className}
    >
      {/* Cone/funnel shape */}
      <path d='M4 4 L12 20 L20 4 Z' />
      {/* Fold line on left side */}
      <line x1='4' y1='4' x2='12' y2='20' />
      {/* Top rim */}
      <line x1='4' y1='4' x2='20' y2='4' />
    </svg>
  );
}
