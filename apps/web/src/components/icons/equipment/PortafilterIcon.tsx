interface IconProps {
  size?: number;
  className?: string;
}

export function PortafilterIcon({ size = 24, className }: IconProps) {
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
      aria-label='Portafilter'
      className={className}
    >
      {/* Handle */}
      <line x1='12' y1='4' x2='12' y2='10' />
      <line x1='10' y1='4' x2='14' y2='4' />
      {/* Circular filter holder body */}
      <circle cx='12' cy='15' r='5' />
      {/* Filter holes */}
      <circle cx='10' cy='14' r='0.5' fill='currentColor' />
      <circle cx='12' cy='14' r='0.5' fill='currentColor' />
      <circle cx='14' cy='14' r='0.5' fill='currentColor' />
      <circle cx='11' cy='16' r='0.5' fill='currentColor' />
      <circle cx='13' cy='16' r='0.5' fill='currentColor' />
      {/* Spout */}
      <line x1='9' y1='19' x2='8' y2='21' />
      <line x1='15' y1='19' x2='16' y2='21' />
    </svg>
  );
}
