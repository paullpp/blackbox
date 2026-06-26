// Small inline SVG icon set (no dependency). Solid glyphs use fill; line
// glyphs use stroke. All inherit color via currentColor and size via `size`.
interface IconProps {
  size?: number;
  className?: string;
}

function Solid({
  size = 16,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Line({
  size = 16,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Solid {...p}>
    <path d="M7 5v14l11-7z" />
  </Solid>
);

export const PauseIcon = (p: IconProps) => (
  <Solid {...p}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Solid>
);

export const RewindIcon = (p: IconProps) => (
  <Solid {...p}>
    <path d="M11 6 5 12l6 6V6z" />
    <path d="M19 6l-6 6 6 6V6z" />
  </Solid>
);

export const ForwardIcon = (p: IconProps) => (
  <Solid {...p}>
    <path d="M13 6l6 6-6 6V6z" />
    <path d="M5 6l6 6-6 6V6z" />
  </Solid>
);

export const FilmIcon = (p: IconProps) => (
  <Line {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="8" y1="4" x2="8" y2="20" />
    <line x1="16" y1="4" x2="16" y2="20" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="8" x2="8" y2="8" />
    <line x1="3" y1="16" x2="8" y2="16" />
    <line x1="16" y1="8" x2="21" y2="8" />
    <line x1="16" y1="16" x2="21" y2="16" />
  </Line>
);

export const SeekIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 4v10" />
    <path d="M8 10l4 4 4-4" />
    <line x1="5" y1="20" x2="19" y2="20" />
  </Line>
);

export const CloseIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Line>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M12 5v14" />
    <path d="M6 13l6 6 6-6" />
  </Line>
);
