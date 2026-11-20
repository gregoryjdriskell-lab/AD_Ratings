import { TrendingDown } from 'lucide-react';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdAuditReport } from '../../../shared/types';
import { fmtTime, severityTone, toneHex } from '../lib/format';
import { usePlayer, usePlayerTime } from '../lib/player';
import { Card, SectionHeader, SeverityBadge, TimestampChip } from './ui';

const SERIES = '#3987e5';
const GRID = '#2c2c2a';
const AXIS = '#898781';

function retentionAt(curve: AdAuditReport['retentionCurve'], t: number) {
  const lo = Math.max(0, Math.min(curve.length - 1, Math.floor(t)));
  const hi = Math.min(curve.length - 1, lo + 1);
  const f = t - lo;
  return curve[lo].retention + (curve[hi].retention - curve[lo].retention) * Math.min(1, Math.max(0, f));
}

export function RetentionChart({ report }: { report: AdAuditReport }) {
  const { seek } = usePlayer();
  const now = usePlayerTime();
  const curve = report.retentionCurve;
  const last = curve[curve.length - 1]?.second ?? 1;

  const risksBySecond = useMemo(() => {
    const m = new Map<number, typeof report.dropOffRisks>();
    report.dropOffRisks.forEach((r) => {
      const k = Math.round(r.timestamp);
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [report.dropOffRisks]);

  const at3 = curve[Math.min(3, curve.length - 1)]?.retention ?? 0;
  const atEnd = curve[curve.length - 1]?.retention ?? 0;
  const halfway = curve[Math.floor(curve.length / 2)]?.retention ?? 0;

  return (
    <Card id="retention">
      <SectionHeader
        icon={TrendingDown}
        title="Simulated retention & drop-off"
        subtitle="Predicted share of in-feed impressions still watching, second by second. Click the chart to scrub."
      />
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        {[
          ['Hold @ 0:03', at3],
          ['Hold @ midpoint', halfway],
          ['Completion', atEnd],
        ].map(([label, v]) => (
          <div key={label as string} className="px-5 py-3">
            <p className="text-[11px] uppercase tracking-wider text-ink-3">{label}</p>
            <p className="tabular mt-0.5 text-xl font-semibold text-ink">{Math.round(v as number)}%</p>
          </div>
        ))}
      </div>
      <div className="h-[260px] px-2 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={curve}
            margin={{ top: 8, right: 16, bottom: 4, left: -8 }}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (label !== undefined && label !== null) seek(Number(label));
            }}
            style={{ cursor: 'pointer' }}
          >
            <defs>
              <linearGradient id="retFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <ReferenceArea x1={0} x2={Math.min(3, last)} fill="#7c6cff" fillOpacity={0.07} ifOverflow="hidden" />
            <XAxis
              dataKey="second"
              type="number"
              domain={[0, last]}
              tickCount={Math.min(last + 1, 9)}
              allowDecimals={false}
              tickFormatter={(v: number) => fmtTime(v, false)}
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#383835' }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: '#c3c2b7', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { second: number; retention: number };
                const risks = risksBySecond.get(p.second) ?? [];
                return (
                  <div className="max-w-64 rounded-lg border border-line-strong bg-surface-3 px-3 py-2 text-xs shadow-xl">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="tabular font-mono text-ink-2">{fmtTime(p.second)}</span>
                      <span className="tabular text-sm font-semibold text-ink">{p.retention.toFixed(0)}% watching</span>
                    </div>
                    {risks.map((r, i) => (
                      <div key={i} className="mt-1.5 border-t border-line pt-1.5">
                        <SeverityBadge severity={r.severity} compact />
                        <p className="mt-1 text-ink-2">
                          −{r.estimatedDrop} pts · {r.reason}
                        </p>
                      </div>
                    ))}
                    <p className="mt-1.5 text-[10px] text-ink-3">Click to jump here</p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="retention"
              stroke={SERIES}
              strokeWidth={2}
              fill="url(#retFill)"
              isAnimationActive={false}
              activeDot={{ r: 5, stroke: '#131316', strokeWidth: 2, fill: SERIES }}
              dot={false}
            />
            {report.dropOffRisks.map((r, i) => (
              <ReferenceDot
                key={i}
                x={Math.min(last, Math.round(r.timestamp))}
                y={retentionAt(curve, Math.round(r.timestamp))}
                r={5}
                fill={toneHex[severityTone[r.severity]]}
                stroke="#131316"
                strokeWidth={2}
                ifOverflow="visible"
              />
            ))}
            <ReferenceLine x={Math.min(now, last)} stroke="#f0efec" strokeWidth={1.5} ifOverflow="hidden" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 pb-1 text-[11px] text-ink-3">
        <span className="mr-4 inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded" style={{ background: SERIES }} /> Predicted retention
        </span>
        <span className="mr-4 inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-accent/25" /> 3-second hook window
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 rounded bg-ink" /> Playhead
        </span>
      </div>

      {report.dropOffRisks.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {report.dropOffRisks.map((r, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <TimestampChip seconds={r.timestamp} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={r.severity} compact />
                  <span className="tabular text-xs font-medium text-ink-2">−{r.estimatedDrop} pts</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{r.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
        AI simulation based on observed pacing and platform benchmarks — not measured delivery data. Validate with a live split test.
      </p>
    </Card>
  );
}
