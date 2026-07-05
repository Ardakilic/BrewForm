interface IconProps {
  size?: number;
  className?: string;
}

/** SVG icon for a metal mesh filter. */
export function MeshFilterIcon({ size = 24, className }: IconProps) {
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
      aria-label='Mesh Filter'
      className={className}
    >
      {/* Outer rectangle frame */}
      <rect x='4' y='4' width='16' height='16' rx='1' />
      {/* Horizontal mesh lines */}
      <line x1='4' y1='8' x2='20' y2='8' />
      <line x1='4' y1='12' x2='20' y2='12' />
      <line x1='4' y1='16' x2='20' y2='16' />
      {/* Vertical mesh lines */}
      <line x1='8' y1='4' x2='8' y2='20' />
      <line x1='12' y1='4' x2='12' y2='20' />
      <line x1='16' y1='4' x2='16' y2='20' />
    </svg>
  );
}
