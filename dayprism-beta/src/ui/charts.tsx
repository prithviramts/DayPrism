import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { showHour, showTime } from '../lib/time';
import { Txt } from './kit';
import { fonts, space, useTheme } from './theme';

// Small hand-built charts on react-native-svg. Specs: bars ≤ 24px with a 4px rounded data end
// on a single baseline, 2px lines, ≥ 8px markers with a 2px surface ring, hairline recessive
// grid, text in text colours (never the series colour). Tapping a mark shows its exact values
// in a readout line under the chart, the touch equivalent of a hover tooltip.

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

/** A rect with only its top corners rounded (data end up, square at the baseline). */
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.sm }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i.color }} />
          <Txt variant="caption">{i.label}</Txt>
        </View>
      ))}
    </View>
  );
}

function Readout({ children }: { children: ReactNode }) {
  return <Txt variant="caption" style={{ marginTop: space.sm, minHeight: 16 }}>{children}</Txt>;
}

// ---------------------------------------------------------------- grouped columns (bucket comparisons)

export interface BarGroup { label: string; days: number; values: (number | null)[] }

/**
 * Compares a few groups of days on one or two measures that share a scale (e.g. energy and
 * sleepiness, both 1–5). Each group shows how many days it's based on.
 */
export function GroupedBars({ groups, series, max, format = (v) => v.toFixed(1), countLabel = (n) => `${n} day${n === 1 ? '' : 's'}` }: {
  groups: BarGroup[]; series: { label: string; color: string }[]; max: number; format?: (v: number) => string;
  /** Second line under each group (default "6 days"); return '' to hide it. */
  countLabel?: (n: number) => string;
}) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const h = 150;
  const top = 18;
  const base = h - 34;
  const slot = groups.length ? w / groups.length : 0;
  const barW = Math.min(24, (slot * 0.6) / series.length);

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {[0.5, 1].map((f) => (
            <Line key={f} x1={0} x2={w} y1={base - (base - top) * f} y2={base - (base - top) * f} stroke={t.grid} strokeWidth={1} />
          ))}
          <Line x1={0} x2={w} y1={base} y2={base} stroke={t.grid} strokeWidth={1} />
          {groups.map((g, gi) => {
            const groupW = barW * series.length + 2 * (series.length - 1);
            const x0 = gi * slot + (slot - groupW) / 2;
            return (
              <G key={g.label}>
                {g.values.map((v, si) => {
                  if (v == null) return null;
                  const bh = ((base - top) * v) / max;
                  const x = x0 + si * (barW + 2);
                  return (
                    <Path key={si} d={topRounded(x, base - bh, barW, bh)} fill={series[si].color}
                      opacity={sel == null || sel === gi ? 1 : 0.35} />
                  );
                })}
                {g.values[0] != null && series.length === 1 ? (
                  <SvgText x={x0 + barW / 2} y={base - ((base - top) * g.values[0]!) / max - 5} fontSize={11} fontFamily={fonts.semibold}
                    fill={t.text2} textAnchor="middle">{format(g.values[0]!)}</SvgText>
                ) : null}
                <SvgText x={gi * slot + slot / 2} y={base + 15} fontSize={11} fontFamily={fonts.semibold} fill={t.text2} textAnchor="middle">{g.label}</SvgText>
                <SvgText x={gi * slot + slot / 2} y={base + 29} fontSize={10} fontFamily={fonts.medium} fill={t.muted} textAnchor="middle">
                  {countLabel(g.days)}
                </SvgText>
                <Rect x={gi * slot} y={0} width={slot} height={h} fill="transparent" onPress={() => setSel(sel === gi ? null : gi)} />
              </G>
            );
          })}
        </Svg>
      ) : <View style={{ height: h }} />}
      {series.length > 1 ? <Legend items={series} /> : null}
      <Readout>
        {sel != null
          ? `${groups[sel].label}: ` + series.map((s, i) => `${s.label} ${groups[sel].values[i] == null ? '–' : format(groups[sel].values[i]!)}`).join(' · ')
            + (countLabel(groups[sel].days) ? ` (${countLabel(groups[sel].days)})` : '')
          : 'Tap a group for exact values.'}
      </Readout>
    </View>
  );
}

// ---------------------------------------------------------------- lines (energy through the day)

export function HourLines({ points, series }: {
  points: { hour: number; values: number[]; n: number }[];
  series: { label: string; color: string }[];
}) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const h = 170;
  const left = 22, right = 8, top = 10, bottom = 22;
  if (points.length === 0) return null;
  const minH = Math.min(...points.map((p) => p.hour));
  const maxH = Math.max(...points.map((p) => p.hour), minH + 1);
  const x = (hour: number) => left + ((hour - minH) / (maxH - minH)) * (w - left - right);
  const y = (v: number) => top + ((5 - v) / 4) * (h - top - bottom);
  const ticks = [1, 3, 5];
  // Every third hour inside the range, so labels never crowd each other.
  const hourTicks: number[] = [];
  for (let hr = Math.ceil(minH / 3) * 3; hr <= maxH; hr += 3) hourTicks.push(hr);

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {ticks.map((v) => (
            <G key={v}>
              <Line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke={t.grid} strokeWidth={1} />
              <SvgText x={left - 8} y={y(v) + 4} fontSize={10} fill={t.muted} fontFamily={fonts.medium} textAnchor="end">{v}</SvgText>
            </G>
          ))}
          {hourTicks.map((hr) => (
            <SvgText key={hr} x={x(hr)} y={h - 6} fontSize={10} fill={t.muted} fontFamily={fonts.medium} textAnchor="middle">
              {showHour(hr)}
            </SvgText>
          ))}
          {sel != null ? <Line x1={x(points[sel].hour)} x2={x(points[sel].hour)} y1={top} y2={h - bottom} stroke={t.muted} strokeWidth={1} /> : null}
          {series.map((s, si) => (
            <Path key={s.label} d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.hour)},${y(p.values[si])}`).join(' ')}
              stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map((s, si) => points.map((p, i) => (
            <Circle key={`${si}-${i}`} cx={x(p.hour)} cy={y(p.values[si])} r={sel === i ? 5.5 : 4} fill={s.color} stroke={t.surface} strokeWidth={2} />
          )))}
          {points.map((p, i) => (
            <Rect key={i} x={x(p.hour) - 14} y={0} width={28} height={h} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
          ))}
        </Svg>
      ) : <View style={{ height: h }} />}
      <Legend items={series} />
      <Readout>
        {sel != null
          ? `${showTime(`${String(points[sel].hour).padStart(2, '0')}:00`)} · ` + series.map((s, i) => `${s.label} ${points[sel].values[i].toFixed(1)}`).join(' · ') + ` (${points[sel].n} check-ins)`
          : 'Tap the chart for exact values.'}
      </Readout>
    </View>
  );
}

// ---------------------------------------------------------------- floating bars (sleep window per night)

/** Each night as a bar from bedtime to wake time. Values are hours after 18:00. */
export function SleepWindows({ nights, color, label }: {
  nights: { key: string; label: string; from: number; to: number; detail: string }[]; color: string; label: (h: number) => string;
}) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const h = 180;
  const left = 40, right = 4, top = 6, bottom = 6;
  if (nights.length === 0) return null;
  const lo = Math.floor(Math.min(...nights.map((n) => n.from)));
  const hi = Math.ceil(Math.max(...nights.map((n) => n.to)));
  const y = (v: number) => top + ((v - lo) / Math.max(1, hi - lo)) * (h - top - bottom);
  const slot = (w - left - right) / nights.length;
  const barW = Math.max(3, Math.min(14, slot - 2));
  const step = hi - lo > 10 ? 3 : 2;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {ticks.map((v) => (
            <G key={v}>
              <Line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke={t.grid} strokeWidth={1} />
              <SvgText x={left - 6} y={y(v) + 4} fontSize={10} fill={t.muted} fontFamily={fonts.medium} textAnchor="end">{label(v)}</SvgText>
            </G>
          ))}
          {nights.map((n, i) => (
            <Rect key={n.key} x={left + i * slot + (slot - barW) / 2} y={y(n.from)} width={barW} height={Math.max(2, y(n.to) - y(n.from))}
              rx={Math.min(4, barW / 2)} fill={color} opacity={sel == null || sel === i ? 1 : 0.35} />
          ))}
          {nights.map((n, i) => (
            <Rect key={`hit-${n.key}`} x={left + i * slot} y={0} width={slot} height={h} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
          ))}
        </Svg>
      ) : <View style={{ height: h }} />}
      <Readout>{sel != null ? `${nights[sel].label}: ${nights[sel].detail}` : 'Each bar is one night, from bedtime (top) to waking. Tap one.'}</Readout>
    </View>
  );
}

// ---------------------------------------------------------------- stacked rows (hours per week by activity family)

export function StackedRows({ rows, keys, unit = 'h' }: {
  rows: { label: string; note?: string; values: Record<string, number> }[];
  keys: { key: string; label: string; color: string }[];
  unit?: string;
}) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const totals = rows.map((r) => keys.reduce((s, k) => s + (r.values[k.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const barH = 16;

  return (
    <View onLayout={onLayout}>
      {rows.map((r, ri) => {
        let x = 0;
        return (
          <Pressable key={r.label} onPress={() => setSel(sel === ri ? null : ri)} style={{ marginBottom: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Txt variant="caption" color={t.text2}>{r.label}{r.note ? <Txt variant="caption"> · {r.note}</Txt> : null}</Txt>
              <Txt variant="caption" color={t.text2}>{totals[ri].toFixed(1)}{unit}</Txt>
            </View>
            {w > 0 ? (
              <Svg width={w} height={barH}>
                <Rect x={0} y={0} width={w} height={barH} rx={4} fill={t.surface2} />
                {keys.map((k) => {
                  const v = r.values[k.key] ?? 0;
                  if (v <= 0) return null;
                  const segW = (v / max) * w;
                  const rect = <Rect key={k.key} x={x} y={0} width={Math.max(1, segW - 2)} height={barH} rx={3} fill={k.color} opacity={sel == null || sel === ri ? 1 : 0.4} />;
                  x += segW;
                  return rect;
                })}
              </Svg>
            ) : <View style={{ height: barH }} />}
          </Pressable>
        );
      })}
      <Legend items={keys.map((k) => ({ color: k.color, label: k.label }))} />
      <Readout>
        {sel != null
          ? `${rows[sel].label}: ` + keys.filter((k) => (rows[sel].values[k.key] ?? 0) > 0).map((k) => `${k.label} ${rows[sel].values[k.key].toFixed(1)}${unit}`).join(' · ')
          : 'Tap a week for the breakdown.'}
      </Readout>
    </View>
  );
}

// ---------------------------------------------------------------- rating trend

export function RatingTrend({ points, color }: { points: { date: string; label: string; rating: number | null; rolling: number | null }[]; color: string }) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const h = 150;
  const left = 22, right = 8, top = 10, bottom = 10;
  if (points.length === 0) return null;
  const x = (i: number) => left + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (w - left - right);
  const y = (v: number) => top + ((5 - v) / 4) * (h - top - bottom);
  const segments: string[] = [];
  let cur = '';
  points.forEach((p, i) => {
    if (p.rolling == null) { if (cur) segments.push(cur); cur = ''; return; }
    cur += `${cur ? 'L' : 'M'}${x(i)},${y(p.rolling)} `;
  });
  if (cur) segments.push(cur);
  const slot = (w - left - right) / Math.max(1, points.length);

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {[1, 3, 5].map((v) => (
            <G key={v}>
              <Line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke={t.grid} strokeWidth={1} />
              <SvgText x={left - 8} y={y(v) + 4} fontSize={10} fill={t.muted} fontFamily={fonts.medium} textAnchor="end">{v}</SvgText>
            </G>
          ))}
          {segments.map((d, i) => <Path key={i} d={d} stroke={t.text2} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />)}
          {points.map((p, i) => p.rating == null ? null : (
            <Circle key={p.date} cx={x(i)} cy={y(p.rating)} r={sel === i ? 6 : 4} fill={color} stroke={t.surface} strokeWidth={2} />
          ))}
          {points.map((p, i) => (
            <Rect key={`hit-${p.date}`} x={x(i) - slot / 2} y={0} width={Math.max(slot, 10)} height={h} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
          ))}
        </Svg>
      ) : <View style={{ height: h }} />}
      <Legend items={[{ color, label: 'Day rating' }, { color: t.text2, label: '7-day average' }]} />
      <Readout>
        {sel != null
          ? `${points[sel].label}: rating ${points[sel].rating ?? '–'}${points[sel].rolling != null ? ` · 7-day average ${points[sel].rolling!.toFixed(1)}` : ''}`
          : 'Tap a day for its rating.'}
      </Readout>
    </View>
  );
}

// ---------------------------------------------------------------- one bar per day (custom trackers)

/**
 * A compact daily bar chart. `min` lifts the baseline for measures like weight, where the
 * interesting part is a narrow band (70–75 kg), not the distance from zero.
 */
export function DayBars({ days, color, max, min = 0, format }: {
  days: { label: string; value: number | null }[]; color: string; max: number; min?: number; format: (v: number) => string;
}) {
  const t = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const h = 90;
  const slot = days.length ? w / days.length : 0;
  const barW = Math.max(2, Math.min(14, slot - 2));
  const span = Math.max(max - min, 1e-6);

  return (
    <View onLayout={onLayout}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Line x1={0} x2={w} y1={h - 1} y2={h - 1} stroke={t.grid} strokeWidth={1} />
          {days.map((d, i) => {
            if (d.value == null) return null;
            const bh = Math.max(3, ((Math.min(d.value, max) - min) / span) * (h - 6));
            return (
              <Path key={i} d={topRounded(i * slot + (slot - barW) / 2, h - 1 - bh, barW, bh, 3)} fill={color}
                opacity={sel == null || sel === i ? 1 : 0.35} />
            );
          })}
          {days.map((d, i) => (
            <Rect key={`hit-${i}`} x={i * slot} y={0} width={slot} height={h} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
          ))}
        </Svg>
      ) : <View style={{ height: h }} />}
      <Readout>
        {sel != null ? `${days[sel].label}: ${days[sel].value == null ? 'nothing logged' : format(days[sel].value!)}` : 'Tap a bar for that day.'}
      </Readout>
    </View>
  );
}
