import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { GRADES } from '../data/grades';
import { fmtD } from '../utils/format';
import './PriceChart.css';

const gradeMap = Object.fromEntries(GRADES.map((g) => [g.key, g]));

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const date = new Date(label);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{dateStr}</p>
      {payload.map((entry) => {
        const g = gradeMap[entry.dataKey];
        if (!g || entry.value == null) return null;
        return (
          <p key={entry.dataKey} style={{ color: g.color, margin: '2px 0' }}>
            {g.label}: ${fmtD(entry.value)}
          </p>
        );
      })}
    </div>
  );
}

export default function PriceChart({ gradeData, activeGrades, rangeDays }) {
  const chartData = useMemo(() => {
    const cutoff = Date.now() - rangeDays * 86400000;
    const dayMs = 86400000;

    // Find the start-of-day for cutoff and today
    const startDay = Math.floor(cutoff / dayMs);
    const endDay = Math.floor(Date.now() / dayMs);

    // Build a map of day -> { [gradeKey]: [prices] }
    const dayBuckets = {};
    for (let d = startDay; d <= endDay; d++) {
      dayBuckets[d] = {};
    }

    const activeKeys = GRADES.filter((g) => activeGrades[g.key]).map((g) => g.key);

    activeKeys.forEach((key) => {
      const sales = gradeData[key] || [];
      sales.forEach((sale) => {
        if (sale.t < cutoff) return;
        const day = Math.floor(sale.t / dayMs);
        if (!dayBuckets[day]) dayBuckets[day] = {};
        if (!dayBuckets[day][key]) dayBuckets[day][key] = [];
        dayBuckets[day][key].push(sale.price);
      });
    });

    // Convert to array of data points with daily averages
    const points = [];
    for (let d = startDay; d <= endDay; d++) {
      const bucket = dayBuckets[d];
      const point = { time: d * dayMs + dayMs / 2 };
      let hasData = false;
      activeKeys.forEach((key) => {
        if (bucket[key] && bucket[key].length > 0) {
          const avg = bucket[key].reduce((a, b) => a + b, 0) / bucket[key].length;
          point[key] = Math.round(avg);
          hasData = true;
        }
      });
      if (hasData) points.push(point);
    }

    return points;
  }, [gradeData, activeGrades, rangeDays]);

  const activeGradeList = GRADES.filter((g) => activeGrades[g.key]);

  if (!chartData.length) {
    return (
      <div className="price-chart-wrap">
        <p style={{ textAlign: 'center', color: '#888', padding: '20px 0' }}>
          No data for selected range
        </p>
      </div>
    );
  }

  return (
    <div className="price-chart-wrap">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            {activeGradeList.map((g) => (
              <linearGradient key={g.key} id={`grad-${g.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={g.color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={g.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis
            dataKey="time"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t) => {
              const d = new Date(t);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            tick={{ fontSize: 11 }}
            stroke="#ccc"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="#ccc"
            tickFormatter={(v) => `$${fmtD(v)}`}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          {activeGradeList.map((g) => (
            <Area
              key={g.key}
              type="monotone"
              dataKey={g.key}
              stroke={g.color}
              fill={`url(#grad-${g.key})`}
              strokeWidth={2}
              dot={{ r: 3, fill: g.color, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
