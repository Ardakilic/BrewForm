interface IconProps {
  size?: number;
  className?: string;
}

/** SVG icon for a thermometer. */
export function ThermometerIcon({ size = 24, className }: IconProps) {
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
      aria-label='Thermometer'
      className={className}
    >
      {/* Thermometer tube */}
      <path d='M12 3 Q10 3 10 5 L10 14 Q8 15 8 17 Q8 20 12 20 Q16 20 16 17 Q16 15 14 14 L14 5 Q14 3 12 3 Z' />
      {/* Mercury level indicator */}
      <line x1='12' y1='14' x2='12' y2='9' />
      {/* Bulb fill */}
      <circle cx='12' cy='17' r='2' fill='currentColor' stroke='none' />
      {/* Tick marks */}
      <line x1='14' y1='7' x2='15' y2='7' />
      <line x1='14' y1='10' x2='15' y2='10' />
      <line x1='14' y1='13' x2='15' y2='13' />
    </svg>
  );
}
