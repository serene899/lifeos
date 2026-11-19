import { useEffect, useState } from 'react';
import { ANCHOR_CANDIDATE, DIM_HINT, DIM_KEYS, DIM_LABEL, FACT_KEYS, FACT_LABEL, emptyDay, type DayRecord, type DimState, type Level } from '../lib/types';
import { deleteDay, getDay, saveDay } from '../lib/repo';
import { prettyDay, todayKey } from '../lib/time';
import { validateDimState } from '../lib/kline';

function LevelPicker({ label, value, onChange, testid }: { label: string; value?: Level; onChange: (v?: Level) => void; testid: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm w-14 shrink-0">{label}</span>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label} data-testid={testid}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={value === n}
            className={`seg ${value === n ? 'seg-on' : ''}`}
            onClick={() => onChange(value === n ? undefined : (n as Level))}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Record({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const [rec, setRec] = useState<DayRecord>(() => emptyDay(date, 'Asia/Shanghai'));
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [anchorOpen, setAnchorOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getDay(date).then((d) => {
      if (!alive) return;
      setRec(d ?? emptyDay(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'));
      setLoaded(true);
      setMsg('');
      setErrors([]);
    });
    return () => { alive = false; };
  }, [date]);

  const setDim = (k: (typeof DIM_KEYS)[number], patch: Partial<DimState>) => {
    setRec((r) => ({ ...r, dims: { ...r.dims, [k]: { ...(r.dims[k] ?? {}), ...patch } } }));
  };
  const setFact = (k: (typeof FACT_KEYS)[number], raw: string) => {
    const v = raw === '' ? undefined : Number(raw);
    setRec((r) => ({ ...r, facts: { ...r.facts, [k]: v !== undefined && Number.isFinite(v) && v >= 0 ? v : undefined } }));
  };

  const onSave = async () => {
    const errs: string[] = [];
    for (const k of DIM_KEYS) {
      const s = rec.dims[k];
      if (s) errs.push(...validateDimState(DIM_LABEL[k], s));
    }
    setErrors(errs);
    if (errs.length) return;
    // 清掉全空的维度，避免留下空壳
    const dims: DayRecord['dims'] = {};
    for (const k of DIM_KEYS) {
      const s = rec.dims[k];
      if (s && (s.morning !== undefined || s.evening !== undefined || s.best !== undefined || s.worst !== undefined)) dims[k] = s;
    }
    const saved = await saveDay({ ...rec, dims });
    setRec(saved);
    setMsg('已保存。刷新页面数据也不会丢。');
  };

  const onDelete = async () => {
    if (!window.confirm(`删除 ${date} 的整条日记录？此操作不可恢复（建议先导出备份）。`)) return;
    await deleteDay(date);
    setRec(emptyDay(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'));
    setMsg('已删除这一天的记录。');
  };

  if (!loaded) return <p className="muted text-sm">加载中…</p>;
  const isToday = date === todayKey();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] font-bold">日常记录</h1>
        <div className="flex items-center gap-2 mt-2">
          <input type="date" className="input !w-auto" value={date} max={todayKey()} onChange={(e) => e.target.value && onDateChange(e.target.value)} data-testid="date-input" />
          <span className="muted text-sm">{prettyDay(date)}{!isToday ? ' · 补记' : ''}</span>
        </div>
        <p className="muted text-sm mt-2">每一项都可以不填。没填就是没记录，不会按 0 分算，也不会替你编。</p>
      </header>

      {DIM_KEYS.map((k) => {
        const s = rec.dims[k] ?? {};
        return (
          <section key={k} className="card" data-testid={`dim-${k}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{DIM_LABEL[k]}</h2>
              <span className="muted text-[11px] text-right ml-2">{DIM_HINT[k]}</span>
            </div>
            <div className="mt-1.5">
              <LevelPicker label="晨 · 开" testid={`${k}-morning`} value={s.morning} onChange={(v) => setDim(k, { morning: v })} />
              <LevelPicker label="晚 · 收" testid={`${k}-evening`} value={s.evening} onChange={(v) => setDim(k, { evening: v })} />
              <LevelPicker label="最好" testid={`${k}-best`} value={s.best} onChange={(v) => setDim(k, { best: v })} />
              <LevelPicker label="最差" testid={`${k}-worst`} value={s.worst} onChange={(v) => setDim(k, { worst: v })} />
            </div>
          </section>
        );
      })}

      <button className="muted text-sm underline" onClick={() => setAnchorOpen(!anchorOpen)}>1~5 分是什么意思？（候选锚点）</button>
      {anchorOpen && (
        <section className="card text-sm space-y-1">
          {([1, 2, 3, 4, 5] as Level[]).map((n) => (
            <div key={n} className="flex gap-2"><span className="font-semibold w-4">{n}</span><span>{ANCHOR_CANDIDATE[n]}</span></div>
          ))}
          <p className="muted text-xs pt-1">这套锚点仍是候选规则：需要你实际使用满 21 天后再确认，现在不作定稿。</p>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold mb-1">事实（只有这四项是正式事实）</h2>
        <p className="muted text-xs mb-3">运动分钟、餐食次数、资产、模拟盈亏不进事实层，也不会换算成分数——想记可以写进下面的故事里。</p>
        <div className="grid grid-cols-2 gap-3">
          {FACT_KEYS.map((k) => (
            <label key={k} className="block">
              <span className="text-sm muted">{FACT_LABEL[k]}</span>
              <input
                type="number" inputMode="decimal" min={0}
                className="input mt-1"
                data-testid={`fact-${k}`}
                value={rec.facts[k] ?? ''}
                onChange={(e) => setFact(k, e.target.value)}
                placeholder="未记录"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">今天的故事</h2>
        <label className="block">
          <span className="text-sm muted">最好时刻发生了什么</span>
          <textarea className="input mt-1" data-testid="best-moment" value={rec.bestMoment ?? ''} onChange={(e) => setRec({ ...rec, bestMoment: e.target.value || undefined })} placeholder="对应「最好」的那一刻" />
        </label>
        <label className="block">
          <span className="text-sm muted">最差时刻发生了什么</span>
          <textarea className="input mt-1" data-testid="worst-moment" value={rec.worstMoment ?? ''} onChange={(e) => setRec({ ...rec, worstMoment: e.target.value || undefined })} placeholder="对应「最差」的那一刻" />
        </label>
        <label className="block">
          <span className="text-sm muted">今天的故事 / 最重要的一件事</span>
          <textarea className="input mt-1" data-testid="story" value={rec.story ?? ''} onChange={(e) => setRec({ ...rec, story: e.target.value || undefined })} placeholder="用自己的话记下来，多年后点开K线先看到的是它" />
        </label>
      </section>

      {errors.length > 0 && (
        <section className="card text-sm text-[#ff3b30] space-y-1" data-testid="form-errors">
          {errors.map((e) => <p key={e}>{e}</p>)}
          <p className="muted">最好/最差必须包住晨间与晚间，这是K线的真实约束；改对了再保存，我不会替你改数。</p>
        </section>
      )}
      {msg && <p className="text-sm text-[#007aff]" data-testid="save-msg">{msg}</p>}

      <div className="flex gap-2 pb-2">
        <button className="btn-primary flex-1" onClick={onSave} data-testid="save-btn">保存这一天</button>
        <button className="btn-ghost btn-danger" onClick={onDelete}>删除</button>
      </div>
    </div>
  );
}
