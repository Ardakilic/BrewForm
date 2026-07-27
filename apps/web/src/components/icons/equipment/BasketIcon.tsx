import { useSafeT } from '../../../utils/safe-translation.ts';

interface IconProps {
  size?: number;
  className?: string;
  label?: string;
}

/** SVG icon for an espresso filter basket. */
export function BasketIcon({ size = 24, className, label }: IconProps) {
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
      aria-label={label ?? t('a11y.equipment.basket')}
      className={className}
    >
      {/* Basket body — trapezoid shape */}
      <path d='M5 6 L7 18 L17 18 L19 6 Z' />
      {/* Top rim */}
      <line x1='4' y1='6' x2='20' y2='6' />
      {/* Filter holes */}
      <circle cx='10' cy='10' r='0.5' fill='currentColor' />
      <circle cx='12' cy='10' r='0.5' fill='currentColor' />
      <circle cx='14' cy='10' r='0.5' fill='currentColor' />
      <circle cx='9' cy='13' r='0.5' fill='currentColor' />
      <circle cx='12' cy='13' r='0.5' fill='currentColor' />
      <circle cx='15' cy='13' r='0.5' fill='currentColor' />
    </svg>
  );
}
