import type { ReactNode } from 'react';

export interface DonutSegment {
  value: number;
  color: string;
}

/**
 * A lightweight SVG donut chart. Segments are drawn as arcs on a single ring
 * (stroke-dasharray), with a small gap between them for a clean, segmented
 * look. Center content (a total, an icon…) is rendered as an overlay so callers
 * can drop in any React node.
 */
export default function Donut({
  segments,
  size = 148,
  thickness = 16,
  gap = 2,
  track = 'rgba(255,255,255,0.06)',
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  gap?: number;
  track?: string;
  children?: ReactNode;
}) {
  const r = 50 - thickness / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const parts = total > 0 ? segments.filter((s) => s.value > 0) : [];

  let offset = 0;
  return (
    <div className="ft-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="ft-donut__svg">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth={thickness} />
        {parts.map((s, i) => {
          const frac = s.value / total;
          const len = frac * c;
          // Shrink each arc by `gap` for a sliver between segments (only when
          // there is more than one slice — a lone slice stays a full ring).
          const drawn = parts.length > 1 ? Math.max(0.001, len - gap) : len;
          const dash = `${drawn} ${c - drawn}`;
          const dashOffset = -offset;
          offset += len;
          return (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform="rotate(-90 50 50)"
            />
          );
        })}
      </svg>
      {children != null && <div className="ft-donut__center">{children}</div>}
    </div>
  );
}
