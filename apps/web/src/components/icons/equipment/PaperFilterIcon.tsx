interface IconProps {
  size?: number;
  className?: string;
}

export function PaperFilterIcon({ size = 24, className }: IconProps) {
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
      aria-label='Paper Filter'
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
