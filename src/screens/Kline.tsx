import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { DIM_KEYS, DIM_LABEL, type DimKey } from '../lib/types';
import { buildSeries, type DayBar, type Period, type PeriodBar } from '../lib/kline';
import { addDays, monthStart, todayKey, weekStart } from '../lib/time';

const UP = '#ef4444';
const DOWN = '#22a06b';

function isPeriodBar(b: DayBar | PeriodBar): b is PeriodBar {
  return 'start' in b;
}

export default function Kline({ goRecord }: { goRecord: (date: string) => void }) {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const [dim, setDim] = useState<DimKey>('health');
  const [period, setPeriod] = useState<Period>('day');
  const today = todayKey();

  const { from, to } = useMemo(() => {
    if (period === 'day') return { from: addDays(today, -29), to: today };
    if (period === 'week') return { from: addDays(weekStart(today), -7 * 11), to: today };
    return { from: monthStart(addDays(monthStart(today), -30 * 5)), to: today };
  }, [period, today]);

  const bars = useMemo(() => buildSeries(days ?? [], dim, period, from, to), [days, dim, period, from, to]);

  const W = 340, H = 190, PADL = 22, PADB = 18, PADT = 8;
  const plotW = W - PADL - 6, plotH = H - PADT - PADB;
  const y = (v: number) => PADT + plotH - ((v - 0.5) / 5) * plotH; // 域名 0.5~5.5
  const slot = plotW / Math.max(bars.length, 1);
  const cx = (i: number) => PADL + slot * i + slot / 2;

  const eventsIn = (start: string, end: string) => (events ?? []).filter((e) => e.date >= start && e.date <= end);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] font-bold">人生K线</h1>
        <p className="muted text-sm mt-1">看你每天点的数字怎么变。记得细的日子是一根小蜡烛，只点了「今晚整体」的日子是一个圆点，没记的日子空着——都正常，不用补。</p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="dim-chips">
        {DIM_KEYS.map((k) => (
          <button key={k} className={`chip ${dim === k ? 'chip-on' : ''}`} onClick={() => setDim(k)}>{DIM_LABEL[k]}</button>
        ))}
      </div>
      <div className="flex gap-1.5" data-testid="period-chips">
        {([['day', '日K · 近30天'], ['week', '周K · 近12周'], ['month', '月K · 近6月']] as [Period, string][]).map(([p, label]) => (
          <button key={p} className={`chip ${period === p ? 'chip-on' : ''}`} onClick={() => setPeriod(p)}>{label}</button>
        ))}
      </div>

      <section className="card !p-3" data-testid="kline-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${DIM_LABEL[dim]}K线图`}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PADL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="currentColor" opacity={0.12} />
              <text x={4} y={y(v) + 3} fontSize={9} fill="currentColor" opacity={0.5}>{v}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            if (b.kind === 'empty') return null;
            if (b.kind === 'candle' && b.ohlc) {
              const { open, high, low, close } = b.ohlc;
              const up = close >= open;
              const color = up ? UP : DOWN;
              const bw = Math.max(Math.min(slot * 0.55, 14), 3);
              const top = y(Math.max(open, close));
              const hgt = Math.max(y(Math.min(open, close)) - top, 2);
              return (
                <g key={i} data-testid="candle">
                  <line x1={cx(i)} x2={cx(i)} y1={y(high)} y2={y(low)} stroke={color} strokeWidth={1.4} />
                  <rect x={cx(i) - bw / 2} y={top} width={bw} height={hgt} fill={color} rx={1} />
                </g>
              );
            }
            const v = b.kind === 'point' ? b.value : undefined;
            if (v === undefined) return null;
            return <circle key={i} data-testid="point" cx={cx(i)} cy={y(v)} r={3.2} fill="none" stroke="#007aff" strokeWidth={1.8} />;
          })}
          {bars.map((b, i) => {
            if (i % Math.ceil(bars.length / 6) !== 0 && i !== bars.length - 1) return null;
            const label = isPeriodBar(b) ? b.start.slice(5) : b.date.slice(5);
            return <text key={`t${i}`} x={cx(i)} y={H - 4} fontSize={8.5} textAnchor="middle" fill="currentColor" opacity={0.5}>{label}</text>;
          })}
        </svg>
        <p className="muted text-[11px] mt-1">颜色只表示晚间相对晨间的方向（红=晚间更高，绿=晚间更低），不代表这一天过得好或不好。圆点 = 只有部分状态，不画蜡烛。</p>
      </section>

      <section className="space-y-2" data-testid="kline-list">
        {[...bars].reverse().map((b, ri) => {
          const i = bars.length - 1 - ri;
          void i;
          if (isPeriodBar(b)) {
            const evs = eventsIn(b.start, b.end);
            return (
              <div key={b.start} className="card !py-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{b.start.slice(0, 7) === b.end.slice(0, 7) ? `${b.start} ~ ${b.end.slice(5)}` : `${b.start} ~ ${b.end}`}</span>
                  <span className="muted">记录 {b.recordedDays}/{b.totalDays} 天</span>
                </div>
                <div className="muted mt-0.5">
                  {b.kind === 'candle' && b.ohlc ? `开 ${b.ohlc.open} · 高 ${b.ohlc.high} · 低 ${b.ohlc.low} · 收 ${b.ohlc.close}` :
                    b.kind === 'point' ? `数据不完整，只有点位 ${b.value}（不画蜡烛）` : '无记录，留空'}
                </div>
                {evs.length > 0 && <div className="mt-1">◆ {evs.map((e) => e.title).join('；')}</div>}
              </div>
            );
          }
          const day = (days ?? []).find((d) => d.date === b.date);
          const evs = eventsIn(b.date, b.date);
          return (
            <button key={b.date} className="card !py-3 text-sm w-full text-left" onClick={() => goRecord(b.date)}>
              <div className="flex justify-between">
                <span className="font-medium">{b.date}</span>
                <span className="muted">
                  {b.kind === 'candle' ? `开 ${b.ohlc.open} · 高 ${b.ohlc.high} · 低 ${b.ohlc.low} · 收 ${b.ohlc.close}` :
                    b.kind === 'point' ? `只有点位 ${b.value}${'invalid' in b && b.invalid ? '（四值约束不成立，未画蜡烛）' : '（不画蜡烛）'}` : day ? '该维无记录' : '无记录'}
                </span>
              </div>
              {day?.story && <p className="mt-0.5 line-clamp-2">{day.story}</p>}
              {evs.length > 0 && <div className="mt-0.5">◆ {evs.map((e) => e.title).join('；')}</div>}
            </button>
          );
        })}
      </section>
    </div>
  );
}
