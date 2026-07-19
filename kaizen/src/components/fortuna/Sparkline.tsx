import { useMemo } from 'react';
import { formatINR } from './shared';

/** A compact inline SVG sparkline. Draws `values` as a line (optionally filled),
 *  with an optional faint `baseline` series behind it (e.g. amount invested). */
export function Sparkline({
  values,
  baseline,
  width = 240,
  height = 44,
  stroke = '#6366f1',
  baselineStroke = '#94a3b8',
  fill = true,
}: {
  values: number[];
  baseline?: number[];
  width?: number;
  height?: number;
  stroke?: string;
  baselineStroke?: string;
  fill?: boolean;
}) {
  const { line, area, basePath } = useMemo(() => {
    const all = [...values, ...(baseline ?? [])].filter((n) => Number.isFinite(n));
    if (values.length < 2 || all.length === 0) return { line: '', area: '', basePath: '' };
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const pad = 3;
    const x = (i: number, len: number) => pad + (i / (len - 1)) * (width - pad * 2);
    const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
    const toPath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i, arr.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const line = toPath(values);
    const area = `${line} L ${x(values.length - 1, values.length).toFixed(1)} ${height - pad} L ${x(0, values.length).toFixed(1)} ${height - pad} Z`;
    const basePath = baseline && baseline.length >= 2 ? toPath(baseline) : '';
    return { line, area, basePath };
  }, [values, baseline, width, height]);

  if (!line) return null;
  const gid = `spark-${stroke.replace('#', '')}`;
  return (
    <svg className="ft-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} stroke="none" />}
      {basePath && <path d={basePath} fill="none" stroke={baselineStroke} strokeWidth="1.25" strokeDasharray="3 3" opacity="0.7" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A small labelled trend card: headline value, month-on-month delta, sparkline. */
export function TrendCard({
  title,
  values,
  baseline,
  baselineLabel,
  stroke,
}: {
  title: string;
  values: number[];
  baseline?: number[];
  baselineLabel?: string;
  stroke?: string;
}) {
  if (values.length < 2) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const delta = last - prev;
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : 0;
  const tone = delta > 0 ? 'ft-mf__pos' : delta < 0 ? 'ft-mf__neg' : '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '■';

  return (
    <div className="ft-trend">
      <div className="ft-trend__head">
        <span className="ft-trend__title">{title}</span>
        <span className={`ft-trend__delta ${tone}`}>
          {arrow} {formatINR(Math.abs(delta))} <small>({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%) vs last month</small>
        </span>
      </div>
      <Sparkline values={values} baseline={baseline} stroke={stroke} />
      <div className="ft-trend__foot">
        <span>{values.length}-month trend</span>
        {baseline && baselineLabel && <span className="ft-trend__baseline">– – {baselineLabel}</span>}
      </div>
    </div>
  );
}
