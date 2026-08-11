import React, { useId, useMemo } from 'react';
import './Sparkline.css';

const THIRTY_DAYS_MS = 30 * 86400000;
const UP_COLOR = '#57cc99';
const DOWN_COLOR = '#f87171';

// Compact 30-day trend line: green when the last price is at/above the
// first, red when it's below. `history` is the same {grade, price,
// captured_at}[] shape /api/price-history returns.
export default function Sparkline({ history, gradeKey, compact = false }) {
  const gradId = useId();

  const points = useMemo(() => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return (history || [])
      .filter((h) => (!gradeKey || h.grade === gradeKey) && h.captured_at * 1000 >= cutoff)
      .sort((a, b) => a.captured_at - b.captured_at);
  }, [history, gradeKey]);

  if (points.length < 2) {
    return (
      <div className={`sparkline sparkline-empty${compact ? ' sparkline-compact' : ''}`}>
        {compact ? '—' : 'No 30d trend data'}
      </div>
    );
  }

  const prices = points.map((p) => p.price);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const isUp = last >= first;
  const color = isUp ? UP_COLOR : DOWN_COLOR;
  const pctChange = first ? ((last - first) / first) * 100 : 0;

  const width = 100;
  const height = compact ? 18 : 28;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.price - min) / range) * height;
    return [x, y];
  });
  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div className={`sparkline${compact ? ' sparkline-compact' : ''}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="sparkline-svg"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {!compact && (
        <span className="sparkline-pct" style={{ color }}>
          {isUp ? '+' : ''}
          {pctChange.toFixed(1)}%
        </span>
      )}
    </div>
  );
}
