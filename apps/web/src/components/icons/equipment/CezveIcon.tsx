import { useSafeT } from '../../../utils/safe-translation.ts';

interface IconProps {
  size?: number;
  className?: string;
  label?: string;
}

/** SVG icon for a cezve (Turkish coffee pot). */
export function CezveIcon({ size = 24, className, label }: IconProps) {
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
      aria-label={label ?? t('a11y.equipment.cezve')}
      className={className}
    >
      {/* Cezve body — wider at top, narrower at bottom */}
      <path d='M7 18 Q7 20 12 20 Q17 20 17 18 L16 10 Q16 8 12 8 Q8 8 8 10 Z' />
      {/* Flared rim at top */}
      <path d='M6 10 Q6 8 12 8 Q18 8 18 10' />
      {/* Long straight handle */}
      <line x1='17' y1='9' x2='22' y2='5' />
      {/* Spout lip */}
      <path d='M8 8 Q7 6 6 6' />
    </svg>
  );
}
