interface IconProps {
  size?: number;
  className?: string;
}

/** SVG icon for an espresso puck screen. */
export function PuckScreenIcon({ size = 24, className }: IconProps) {
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
      aria-label='Puck Screen'
      className={className}
    >
      {/* Outer disc */}
      <circle cx='12' cy='12' r='8' />
      {/* Mesh grid lines — horizontal */}
      <line x1='4' y1='10' x2='20' y2='10' />
      <line x1='4' y1='12' x2='20' y2='12' />
      <line x1='4' y1='14' x2='20' y2='14' />
      {/* Mesh grid lines — vertical */}
      <line x1='10' y1='4' x2='10' y2='20' />
      <line x1='12' y1='4' x2='12' y2='20' />
      <line x1='14' y1='4' x2='14' y2='20' />
    </svg>
  );
}
