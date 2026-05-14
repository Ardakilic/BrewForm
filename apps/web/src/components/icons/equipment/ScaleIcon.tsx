interface IconProps {
  size?: number;
  className?: string;
}

export function ScaleIcon({ size = 24, className }: IconProps) {
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
      aria-label='Scale'
      className={className}
    >
      {/* Scale base */}
      <rect x='3' y='19' width='18' height='2' rx='1' />
      {/* Scale platform */}
      <rect x='5' y='14' width='14' height='5' rx='1' />
      {/* Display screen */}
      <rect x='8' y='16' width='8' height='2' rx='0.5' />
      {/* Weighing surface */}
      <rect x='6' y='12' width='12' height='2' rx='0.5' />
    </svg>
  );
}
