interface IconProps {
  size?: number;
  className?: string;
}

export function TamperIcon({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Tamper"
      className={className}
    >
      {/* Handle top */}
      <rect x="9" y="3" width="6" height="4" rx="1" />
      {/* Handle shaft */}
      <line x1="12" y1="7" x2="12" y2="14" />
      {/* Base disc */}
      <rect x="7" y="14" width="10" height="3" rx="1" />
      {/* Bottom flat face */}
      <line x1="7" y1="17" x2="17" y2="17" />
    </svg>
  );
}
