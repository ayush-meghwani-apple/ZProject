import { useEffect, useRef, useState } from 'react';

export interface ChartSeries {
  label: string;
  color: string;
  values: (number | null)[]; // aligned to `labels`
  dashed?: boolean;
}

/** Compact INR for axis ticks: ₹1.2L, ₹3.4Cr, ₹8k. */
function compactINR(n: number): string {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${Math.round(v / 1e3)}k`;
  return `₹${v}`;
}
function fullINR(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * A small, dependency-free line chart with real x/y axes and touch inspection:
 * tap or drag anywhere and a crosshair snaps to the nearest point, showing that
 * point's date (x) and each series' value (y). Renders at the container's pixel
 * width so text stays crisp.
 */
export default function LineChart({
  labels,
  series,
  height = 180,
  emptyHint = 'Not enough data yet — this builds up as you use the app.',
}: {
  labels: string[];
  series: ChartSeries[];
  height?: number;
  emptyHint?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320));
    ro.observe(el);
    setW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);

  // A single data point (e.g. the very first day of tracking) is expanded to a
  // flat two-point line so the chart shows a "starting point today" instead of
  // an empty message; it then grows as more days are captured.
  let lbls = labels;
  let srs = series;
  if (labels.length === 1) {
    lbls = [labels[0], labels[0]];
    srs = series.map((s) => ({ ...s, values: [s.values[0] ?? null, s.values[0] ?? null] }));
  }

  const n = lbls.length;
  const allVals = srs.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
  if (n < 2 || allVals.length < 1) {
    return <p className="ft-chart__empty">{emptyHint}</p>;
  }

  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) {
    min = min === 0 ? -1 : min * 0.95;
    max = max === 0 ? 1 : max * 1.05;
  }
  const padL = 46;
  const padR = 10;
  const padT = 10;
  const padB = 20;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, height - padT - padB);
  const xFor = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * plotW);
  const yFor = (v: number) => padT + (1 - (v - min) / (max - min)) * plotH;

  const pathFor = (vals: (number | null)[]) => {
    let d = '';
    let started = false;
    vals.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) return;
      d += `${started ? 'L' : 'M'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)} `;
      started = true;
    });
    return d.trim();
  };

  const yTicks = [max, (min + max) / 2, min];
  const xTickIdx = [0, Math.floor((n - 1) / 2), n - 1];

  function onMove(e: React.PointerEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round(((x - padL) / plotW) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  }

  const tipLeft = active != null ? Math.max(4, Math.min(w - 132, xFor(active) - 66)) : 0;

  return (
    <div className="ft-chart" ref={wrapRef}>
      <svg
        className="ft-chart__svg"
        width={w}
        height={height}
        onPointerDown={onMove}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') onMove(e);
        }}
        onPointerLeave={() => setActive(null)}
      >
        {yTicks.map((t, i) => {
          const y = yFor(t);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} className="ft-chart__grid" />
              <text x={padL - 6} y={y + 3} className="ft-chart__ylabel">{compactINR(t)}</text>
            </g>
          );
        })}
        {xTickIdx.map((i) => (
          <text key={i} x={xFor(i)} y={height - 6} className="ft-chart__xlabel" style={{ textAnchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }}>
            {lbls[i]}
          </text>
        ))}
        {srs.map((s) => (
          <path
            key={s.label}
            d={pathFor(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '4 3' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {active != null && (
          <>
            <line x1={xFor(active)} y1={padT} x2={xFor(active)} y2={padT + plotH} className="ft-chart__cross" />
            {srs.map((s) => {
              const v = s.values[active];
              if (v == null || !Number.isFinite(v)) return null;
              return <circle key={s.label} cx={xFor(active)} cy={yFor(v)} r={3.5} fill={s.color} />;
            })}
          </>
        )}
      </svg>
      {active != null && (
        <div className="ft-chart__tip" style={{ left: tipLeft }}>
          <div className="ft-chart__tipdate">{lbls[active]}</div>
          {srs.map((s) => {
            const v = s.values[active];
            if (v == null || !Number.isFinite(v)) return null;
            return (
              <div key={s.label} className="ft-chart__tiprow">
                <span className="ft-chart__tipdot" style={{ background: s.color }} />
                <span className="ft-chart__tiplabel">{s.label}</span>
                <span className="ft-chart__tipval">{fullINR(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
