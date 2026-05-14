interface IconProps {
  size?: number;
  className?: string;
}

export function CezveIcon({ size = 24, className }: IconProps) {
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
      aria-label='Cezve'
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
