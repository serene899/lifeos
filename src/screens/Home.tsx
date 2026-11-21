import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { DIM_KEYS, DIM_LABEL, type DimKey, type LifeEvent, type Person } from '../lib/types';
import { buildSeries, mergeAutoPoints, type DayBar, type Period, type PeriodBar } from '../lib/kline';
import { computeAutoScores, fmtMinutes } from '../lib/autoscore';
import { deleteEvent, saveEvent } from '../lib/repo';
import { parseMentions } from '../lib/people';
import { addDays, monthStart, prettyDay, todayKey, weekStart } from '../lib/time';

const UP = '#e5484d';
const DOWN = '#30a46c';

function isPeriodBar(b: DayBar | PeriodBar): b is PeriodBar {
  return 'start' in b;
}

function MentionText({ text, people }: { text: string; people: Person[] }) {
  return (
    <>
      {parseMentions(text, people).map((s, i) => s.person
        ? <span key={i} className="font-medium text-[#007aff]">{s.text}</span>
        : <span key={i}>{s.text}</span>)}
    </>
  );
}

export default function Home({ goRecord, openSettings }: { goRecord: (date: string) => void; openSettings: () => void }) {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const autoDays = useLiveQuery(() => db.autoDays.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const people = useLiveQuery(() => db.people.toArray(), [], [] as Person[]);
  const [dim, setDim] = useState<DimKey>('health');
  const [period, setPeriod] = useState<Period>('day');
  const [selected, setSelected] = useState<string | null>(null);
  const [evForm, setEvForm] = useState<{ id?: string; date: string; title: string; note: string } | null>(null);
  const [msg, setMsg] = useState('');
  const today = todayKey();

  const { from, to } = useMemo(() => {
    if (period === 'day') return { from: addDays(today, -29), to: today };
    if (period === 'week') return { from: addDays(weekStart(today), -7 * 11), to: today };
    return { from: monthStart(addDays(monthStart(today), -30 * 5)), to: today };
  }, [period, today]);

  const autoScores = useMemo(() => computeAutoScores(autoDays ?? []), [autoDays]);
  const bars = useMemo(() => {
    const raw = buildSeries(days ?? [], dim, period, from, to, autoScores);
    return period === 'day' ? mergeAutoPoints(raw, autoScores, dim) : raw;
  }, [days, autoScores, dim, period, from, to]);
  const hasAnyBar = bars.some((b) => b.kind !== 'empty');
  const totallyEmpty = (days ?? []).length === 0 && (autoDays ?? []).length === 0;

  const W = 340, H = 208, PADL = 22, PADB = 18, PADT = 8;
  const plotW = W - PADL - 6, plotH = H - PADT - PADB;
  const y = (v: number) => PADT + plotH - ((v - 0.5) / 5) * plotH;
  const slot = plotW / Math.max(bars.length, 1);
  const cx = (i: number) => PADL + slot * i + slot / 2;

  const eventsOn = (date: string) => (events ?? []).filter((e) => e.date === date);
  const eventsIn = (start: string, end: string) => (events ?? []).filter((e) => e.date >= start && e.date <= end);

  const selDay = selected ? (days ?? []).find((d) => d.date === selected) : undefined;
  const selAuto = selected ? (autoDays ?? []).find((a) => a.date === selected) : undefined;
  const selAutoScores = selected ? autoScores.get(selected) : undefined;
  const selEvents = selected ? eventsOn(selected) : [];

  const onSaveEvent = async () => {
    if (!evForm) return;
    if (!evForm.title.trim()) { setMsg('事件标题不能为空'); return; }
    await saveEvent({ id: evForm.id, date: evForm.date, title: evForm.title, note: evForm.note });
    setEvForm(null);
    setMsg('事件已保存');
  };
  const onDeleteEvent = async (e: LifeEvent) => {
    if (!window.confirm(`删除事件「${e.title}」？`)) return;
    await deleteEvent(e.id);
    setMsg('事件已删除');
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">人生K线图</h1>
        <button className="btn-ghost !rounded-full" onClick={openSettings} data-testid="open-settings" aria-label="设置与数据管理">⚙ 设置</button>
      </header>

      <div className="segbar" data-testid="dim-seg">
        {DIM_KEYS.map((k) => (
          <button key={k} className={`segbtn ${dim === k ? 'segbtn-on' : ''}`} onClick={() => setDim(k)}>{DIM_LABEL[k]}</button>
        ))}
      </div>
      <div className="segbar" data-testid="period-seg">
        {([['day', '日K'], ['week', '周K'], ['month', '月K']] as [Period, string][]).map(([p, label]) => (
          <button key={p} className={`segbtn ${period === p ? 'segbtn-on' : ''}`} onClick={() => setPeriod(p)}>{label}</button>
        ))}
      </div>

      <section className="card !p-3" data-testid="kline-chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${DIM_LABEL[dim]}K线图`}>
          {[1, 2, 3, 4, 5].map((v) => (
            <g key={v}>
              <line x1={PADL} x2={W - 6} y1={y(v)} y2={y(v)} stroke="currentColor" opacity={0.07} />
              <text x={4} y={y(v) + 3} fontSize={9} fill="currentColor" opacity={0.45}>{v}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            if (b.kind === 'empty') return null;
            const pick = period === 'day' && 'date' in b ? () => setSelected(b.date) : undefined;
            if (b.kind === 'candle' && b.ohlc) {
              const { open, high, low, close } = b.ohlc;
              const color = close >= open ? UP : DOWN;
              const bw = Math.max(Math.min(slot * 0.55, 14), 3);
              const top = y(Math.max(open, close));
              const hgt = Math.max(y(Math.min(open, close)) - top, 2);
              return (
                <g key={i} data-testid="candle" onClick={pick} style={pick ? { cursor: 'pointer' } : undefined}>
                  <line x1={cx(i)} x2={cx(i)} y1={y(high)} y2={y(low)} stroke={color} strokeWidth={1.4} />
                  <rect x={cx(i) - bw / 2} y={top} width={bw} height={hgt} fill={color} rx={1} />
                </g>
              );
            }
            const v = b.kind === 'point' ? b.value : undefined;
            if (v === undefined) return null;
            if (!isPeriodBar(b) && 'auto' in b && b.auto) {
              const s = 4.2;
              return <polygon key={i} data-testid="auto-point" onClick={pick} style={pick ? { cursor: 'pointer' } : undefined} points={`${cx(i)},${y(v) - s} ${cx(i) + s},${y(v)} ${cx(i)},${y(v) + s} ${cx(i) - s},${y(v)}`} fill="#f59e0b" stroke="none" />;
            }
            return <circle key={i} data-testid="point" onClick={pick} style={pick ? { cursor: 'pointer' } : undefined} cx={cx(i)} cy={y(v)} r={3.2} fill="none" stroke="#007aff" strokeWidth={1.8} />;
          })}
          {bars.map((b, i) => {
            if (i % Math.ceil(bars.length / 6) !== 0 && i !== bars.length - 1) return null;
            const label = isPeriodBar(b) ? b.start.slice(5) : b.date.slice(5);
            return <text key={`t${i}`} x={cx(i)} y={H - 4} fontSize={8.5} textAnchor="middle" fill="currentColor" opacity={0.45}>{label}</text>;
          })}
        </svg>
        {!hasAnyBar && (
          <p className="text-center text-sm muted py-3">
            {totallyEmpty ? '还没有任何数据。点下面「记录今天」写第一笔，或在设置里收一份其他 App 的交换文件。' : `「${DIM_LABEL[dim]}」还没有数据，换个维度看看，或点「记录今天」补一笔。`}
          </p>
        )}
        <p className="muted text-[11px] mt-1">红/绿只表示晚间相对晨间的升/降，不代表好坏。圆点 = 你手记的，橙色菱形 = 自动分（试行，手记优先）。点任意一天可以看那天的故事。</p>
      </section>

      <button className="btn-primary w-full !py-3" onClick={() => goRecord(today)} data-testid="record-today">✎ 记录今天</button>
      {msg && <p className="text-sm text-[#007aff]">{msg}</p>}

      {period === 'day' && selected && (
        <section className="card space-y-3" data-testid="day-detail">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{prettyDay(selected)}</h2>
            <div className="flex gap-2">
              <button className="btn-ghost !py-1.5" onClick={() => goRecord(selected)} data-testid="detail-record">记录 / 编辑</button>
              <button className="btn-ghost !py-1.5" onClick={() => { setSelected(null); setEvForm(null); }}>关闭</button>
            </div>
          </div>

          {selDay?.story && <p className="text-[15px] leading-relaxed"><MentionText text={selDay.story} people={people ?? []} /></p>}
          {selDay?.bestMoment && <p className="text-sm"><span className="muted">最好时刻：</span><MentionText text={selDay.bestMoment} people={people ?? []} /></p>}
          {selDay?.worstMoment && <p className="text-sm"><span className="muted">最差时刻：</span><MentionText text={selDay.worstMoment} people={people ?? []} /></p>}
          {selDay && (selDay.facts.sleepMinutes !== undefined || selDay.facts.studyMinutes !== undefined || selDay.facts.workMinutes !== undefined || selDay.facts.spendAmount !== undefined) && (
            <p className="text-sm muted">
              事实：
              {selDay.facts.sleepMinutes !== undefined && ` 睡眠 ${fmtMinutes(selDay.facts.sleepMinutes)}`}
              {selDay.facts.studyMinutes !== undefined && ` · 学习 ${fmtMinutes(selDay.facts.studyMinutes)}`}
              {selDay.facts.workMinutes !== undefined && ` · 工作 ${fmtMinutes(selDay.facts.workMinutes)}`}
              {selDay.facts.spendAmount !== undefined && ` · 支出 ${selDay.facts.spendAmount} 元`}
            </p>
          )}
          {selAuto && (
            <div className="text-sm muted space-y-0.5">
              <p>已自动收到：
                {selAuto.facts.sleepMinutes !== undefined && ` 睡眠 ${fmtMinutes(selAuto.facts.sleepMinutes)}`}
                {selAuto.facts.studyMinutes !== undefined && ` · 学习 ${fmtMinutes(selAuto.facts.studyMinutes)}`}
                {selAuto.facts.spendAmount !== undefined && ` · 支出 ${selAuto.facts.spendAmount} 元`}
                {selAuto.refs.readingMinutes !== undefined && ` · 阅读 ${fmtMinutes(selAuto.refs.readingMinutes)}`}
                {selAuto.refs.assetSnapshotCny !== undefined && ` · 总资产 ¥${selAuto.refs.assetSnapshotCny.toLocaleString()}`}
              </p>
              {selAutoScores && DIM_KEYS.filter((k) => selAutoScores[k]).map((k) => (
                <p key={k} className="text-amber-600 dark:text-amber-400">自动分 · {DIM_LABEL[k]} {selAutoScores[k]!.score} · {selAutoScores[k]!.basis}</p>
              ))}
            </div>
          )}
          {!selDay?.story && !selAuto && selEvents.length === 0 && <p className="text-sm muted">这一天还没有记录。</p>}

          <div className="space-y-1.5">
            {selEvents.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-sm">
                <span className="text-[#af52de]">◆</span>
                <span className="flex-1">{e.title}{e.note ? <span className="muted"> ｜<MentionText text={e.note} people={people ?? []} /></span> : null}</span>
                <button className="text-[#007aff] text-xs shrink-0" onClick={() => setEvForm({ id: e.id, date: e.date, title: e.title, note: e.note ?? '' })}>编辑</button>
                <button className="text-[#ff3b30] text-xs shrink-0" onClick={() => onDeleteEvent(e)}>删除</button>
              </div>
            ))}
            {!evForm && (
              <button className="text-[#007aff] text-sm" onClick={() => setEvForm({ date: selected, title: '', note: '' })} data-testid="add-event-btn">＋ 添加事件</button>
            )}
            {evForm && (
              <div className="space-y-2 pt-1" data-testid="event-form">
                <input type="date" className="input" value={evForm.date} max={today} onChange={(e) => setEvForm({ ...evForm, date: e.target.value })} data-testid="event-date" />
                <input className="input" value={evForm.title} onChange={(e) => setEvForm({ ...evForm, title: e.target.value })} placeholder="发生了什么，如：搬家 / 和家人旅行" data-testid="event-title" />
                <textarea className="input" value={evForm.note} onChange={(e) => setEvForm({ ...evForm, note: e.target.value })} placeholder="备注（可选）" data-testid="event-note" />
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={onSaveEvent} data-testid="event-save">保存事件</button>
                  <button className="btn-ghost" onClick={() => setEvForm(null)}>取消</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2" data-testid="kline-list">
        {[...bars].reverse().map((b) => {
          if (isPeriodBar(b)) {
            const evs = eventsIn(b.start, b.end);
            return (
              <div key={b.start} className="card !py-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{b.start.slice(0, 7) === b.end.slice(0, 7) ? `${b.start} ~ ${b.end.slice(5)}` : `${b.start} ~ ${b.end}`}</span>
                  <span className="muted">有效评分 {b.recordedDays}/{b.totalDays} 天{b.autoDays > 0 ? `（含自动分 ${b.autoDays} 天）` : ''}</span>
                </div>
                <div className="muted mt-0.5">
                  {b.kind === 'candle' && b.ohlc ? `开 ${b.ohlc.open} · 高 ${b.ohlc.high} · 低 ${b.ohlc.low} · 收 ${b.ohlc.close}` :
                    b.kind === 'point' ? `只有一条有效评分 ${b.value}（只画点，不画蜡烛）` : '无数据，留空'}
                </div>
                {evs.length > 0 && <div className="mt-1">◆ {evs.map((e) => e.title).join('；')}</div>}
              </div>
            );
          }
          const day = (days ?? []).find((d) => d.date === b.date);
          const evs = eventsOn(b.date);
          const isSel = selected === b.date;
          return (
            <button key={b.date} className="card !py-3 text-sm w-full text-left" style={isSel ? { borderColor: '#007aff' } : undefined} onClick={() => setSelected(isSel ? null : b.date)} data-testid="day-row" data-date={b.date}>
              <div className="flex justify-between gap-3">
                <span className="font-medium shrink-0">{b.date.slice(5)}</span>
                <span className="muted text-right">
                  {b.kind === 'candle' ? `开 ${b.ohlc.open} · 高 ${b.ohlc.high} · 低 ${b.ohlc.low} · 收 ${b.ohlc.close}` :
                    b.kind === 'point' && 'auto' in b && b.auto ? <span className="text-amber-600 dark:text-amber-400">自动分 {b.value} · {b.auto.basis}</span> :
                    b.kind === 'point' ? `点位 ${b.value}${'invalid' in b && b.invalid ? '（四值约束不成立）' : ''}` : day ? '该维无记录' : '无记录'}
                </span>
              </div>
              {day?.story && <p className="mt-0.5 line-clamp-1">{day.story}</p>}
              {evs.length > 0 && <div className="mt-0.5">◆ {evs.map((e) => e.title).join('；')}</div>}
            </button>
          );
        })}
      </section>
    </div>
  );
}
