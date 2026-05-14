interface IconProps {
  size?: number;
  className?: string;
}

export function GooseneckKettleIcon({ size = 24, className }: IconProps) {
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
      aria-label='Gooseneck Kettle'
      className={className}
    >
      {/* Kettle body */}
      <path d='M5 10 Q5 18 12 18 Q19 18 19 10 Z' />
      {/* Lid */}
      <line x1='7' y1='10' x2='17' y2='10' />
      <line x1='10' y1='10' x2='10' y2='8' />
      <line x1='14' y1='10' x2='14' y2='8' />
      <line x1='10' y1='8' x2='14' y2='8' />
      {/* Gooseneck spout — curves up then down */}
      <path d='M17 13 Q22 13 22 8 Q22 4 18 4 Q16 4 16 6' />
      {/* Handle on left */}
      <path d='M5 12 Q2 12 2 14 Q2 16 5 16' />
    </svg>
  );
}
