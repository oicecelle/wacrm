'use client';

interface PackageProgressRingProps {
  /** Sessions already used. */
  used: number;
  /** Total sessions in the package. */
  total: number;
  /** Diameter in pixels. */
  size?: number;
  /** Ring thickness in pixels. */
  strokeWidth?: number;
  /** Overrides the auto-picked color (see DEFAULT_COLORS below). */
  color?: string;
  className?: string;
}

// Cycles through a small fixed palette keyed by total session count, so
// different packages read as visually distinct at a glance — matching
// the reference look where each package got its own ring color rather
// than one uniform color for everything.
const DEFAULT_COLORS = ['#f59e0b', '#e11d48', '#2563eb', '#22c55e', '#7c3aed', '#ec4899'];

function colorFor(total: number): string {
  return DEFAULT_COLORS[total % DEFAULT_COLORS.length];
}

/**
 * A small circular "used / total" indicator for package sessions —
 * e.g. a package with 3 sessions, 1 already used, renders a ring 1/3
 * of the way filled with "1/3" centered inside. Fully used packages
 * (used >= total) render a solid, closed ring.
 */
export function PackageProgressRing({
  used,
  total,
  size = 44,
  strokeWidth = 4,
  color,
  className,
}: PackageProgressRingProps) {
  const safeTotal = Math.max(1, total);
  const safeUsed = Math.min(Math.max(0, used), safeTotal);
  const fraction = safeUsed / safeTotal;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);
  const ringColor = color ?? colorFor(safeTotal);
  const isEmpty = safeUsed === 0;

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
      title={`${used} de ${total} sessões utilizadas`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        {/* Small dot marking the start of the arc, visible while it's
            still empty or barely started — echoes the reference's
            "0/3" ring, which shows a dot at the top rather than a
            bare empty circle. */}
        {isEmpty && (
          <circle cx={size / 2} cy={strokeWidth / 2} r={strokeWidth / 2.2} fill={ringColor} />
        )}
      </svg>
      <span
        className="absolute text-[11px] font-bold leading-none"
        style={{ color: isEmpty ? undefined : ringColor }}
      >
        {used}/{total}
      </span>
    </div>
  );
}
