import { useEffect, useRef, useState } from 'react';
import { ANCHOR_CANDIDATE, DIM_HINT, DIM_KEYS, DIM_LABEL, FACT_KEYS, FACT_LABEL, emptyDay, type DayRecord, type DimState, type Level, type Person } from '../lib/types';
import { allPeople, deleteDay, getAutoDay, getDay, saveDay, savePerson } from '../lib/repo';
import { activeMentionQuery } from '../lib/people';
import { fmtMinutes } from '../lib/autoscore';
import type { AutoDay } from '../lib/types';
import { prettyDay, todayKey } from '../lib/time';
import { validateDimState } from '../lib/kline';

function LevelPicker({ label, value, onChange, testid }: { label: string; value?: Level; onChange: (v?: Level) => void; testid: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm w-24 shrink-0">{label}</span>
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
  // 快速模式是默认：每维只点「今晚整体」一个数。晨/最好/最差/事实收在「记更细」里，按需展开。
  const [detailed, setDetailed] = useState(false);
  const [auto, setAuto] = useState<AutoDay | undefined>();
  useEffect(() => { getAutoDay(date).then(setAuto).catch(() => setAuto(undefined)); }, [date]);

  // 故事 @ 提及：通讯录名单 + 正在输入的 @ 查询
  const [people, setPeople] = useState<Person[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number; caret: number } | null>(null);
  const storyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { allPeople().then(setPeople).catch(() => setPeople([])); }, []);

  const onStoryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setRec({ ...rec, story: v || undefined });
    const caret = e.target.selectionStart ?? v.length;
    const q = activeMentionQuery(v, caret);
    setMention(q ? { ...q, caret } : null);
  };
  const insertMention = (name: string) => {
    if (!mention) return;
    const cur = rec.story ?? '';
    const next = `${cur.slice(0, mention.start)}@${name} ${cur.slice(mention.caret)}`;
    setRec({ ...rec, story: next });
    setMention(null);
    requestAnimationFrame(() => {
      const el = storyRef.current;
      if (el) { const pos = mention.start + name.length + 2; el.focus(); el.setSelectionRange(pos, pos); }
    });
  };
  const pickPerson = (p: Person) => insertMention(p.name);
  const createAndPick = async (name: string) => {
    const p = await savePerson({ name, relation: '' });
    setPeople(await allPeople());
    insertMention(p.name);
  };
  const mentionMatches = mention ? people.filter((p) => !mention.query || p.name.includes(mention.query)).slice(0, 6) : [];
  const mentionCanCreate = !!mention && mention.query.trim().length > 0 && !people.some((p) => p.name === mention.query.trim());

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    getDay(date).then((d) => {
      if (!alive) return;
      const rec0 = d ?? emptyDay(date, Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
      setRec(rec0);
      // 已有详细数据的日子自动展开，免得用户以为数据丢了
      const hasDetail =
        Object.values(rec0.dims).some((s) => s && (s.morning !== undefined || s.best !== undefined || s.worst !== undefined)) ||
        Object.values(rec0.facts).some((v) => v !== undefined) ||
        !!rec0.bestMoment || !!rec0.worstMoment;
      setDetailed(hasDetail);
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
        <p className="muted text-sm mt-2">
          <b className="text-[rgb(var(--c-ink))]">每天只要做两件事：</b>下面六项各点一个数（今晚回想一下，这一项今天整体怎么样，1 最差、5 最好），
          再往下写一句话今天发生了什么，点保存就完事。其他的都不用管。
        </p>
        {auto && (
          <p className="text-sm mt-2 rounded-xl bg-amber-500/10 p-2.5" data-testid="record-auto-hint">
            <span className="text-amber-600 dark:text-amber-400 font-medium">这天已从其他 App 收到数据：</span>
            {[
              auto.facts.sleepMinutes !== undefined ? `睡眠 ${fmtMinutes(auto.facts.sleepMinutes)}` : null,
              auto.facts.spendAmount !== undefined ? `支出 ¥${auto.facts.spendAmount}` : null,
              auto.refs.readingMinutes ? `阅读 ${fmtMinutes(auto.refs.readingMinutes)}` : null,
              auto.refs.exerciseMinutes ? `运动 ${fmtMinutes(auto.refs.exerciseMinutes)}` : null,
            ].filter(Boolean).join(' · ') || '（见 K线 页自动分）'}
            <span className="muted">。健康、财务、学习、精神生活已有自动分，你主要补工作和情绪就行。</span>
          </p>
        )}
      </header>

      {DIM_KEYS.map((k) => {
        const s = rec.dims[k] ?? {};
        return (
          <section key={k} className="card !py-3" data-testid={`dim-${k}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{DIM_LABEL[k]}</h2>
              <span className="muted text-[11px] text-right ml-2">{DIM_HINT[k]}</span>
            </div>
            <div className="mt-1">
              <LevelPicker label="今晚整体" testid={`${k}-evening`} value={s.evening} onChange={(v) => setDim(k, { evening: v })} />
              {detailed && (
                <>
                  <LevelPicker label="早上醒来时" testid={`${k}-morning`} value={s.morning} onChange={(v) => setDim(k, { morning: v })} />
                  <LevelPicker label="今天最好时" testid={`${k}-best`} value={s.best} onChange={(v) => setDim(k, { best: v })} />
                  <LevelPicker label="今天最差时" testid={`${k}-worst`} value={s.worst} onChange={(v) => setDim(k, { worst: v })} />
                </>
              )}
            </div>
          </section>
        );
      })}

      <button
        className="btn-ghost w-full"
        data-testid="toggle-detail"
        onClick={() => setDetailed(!detailed)}
      >
        {detailed ? '收起详细记录' : '记更细一点（可选）：早上状态、今天最好/最差、睡眠和支出'}
      </button>

      <button className="muted text-sm underline" onClick={() => setAnchorOpen(!anchorOpen)}>1~5 分是什么意思？（候选锚点）</button>
      {anchorOpen && (
        <section className="card text-sm space-y-1">
          {([1, 2, 3, 4, 5] as Level[]).map((n) => (
            <div key={n} className="flex gap-2"><span className="font-semibold w-4">{n}</span><span>{ANCHOR_CANDIDATE[n]}</span></div>
          ))}
          <p className="muted text-xs pt-1">这套锚点仍是候选规则：需要你实际使用满 21 天后再确认，现在不作定稿。</p>
        </section>
      )}

      {detailed && (
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
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">今天的故事</h2>
        {detailed && (
          <>
            <label className="block">
              <span className="text-sm muted">最好时刻发生了什么</span>
              <textarea className="input mt-1" data-testid="best-moment" value={rec.bestMoment ?? ''} onChange={(e) => setRec({ ...rec, bestMoment: e.target.value || undefined })} placeholder="对应「今天最好时」的那一刻" />
            </label>
            <label className="block">
              <span className="text-sm muted">最差时刻发生了什么</span>
              <textarea className="input mt-1" data-testid="worst-moment" value={rec.worstMoment ?? ''} onChange={(e) => setRec({ ...rec, worstMoment: e.target.value || undefined })} placeholder="对应「今天最差时」的那一刻" />
            </label>
          </>
        )}
        <label className="block">
          <span className="text-sm muted">今天的故事 / 最重要的一件事</span>
          <textarea ref={storyRef} className="input mt-1" data-testid="story" value={rec.story ?? ''} onChange={onStoryChange} placeholder="用自己的话记下来。打 @ 可以提到一个人，比如：下午跟 @王子怡 去吃火锅" />
        </label>
        {mention && (mentionMatches.length > 0 || mentionCanCreate) && (
          <div className="rounded-xl border p-1.5 space-y-0.5" style={{ borderColor: 'rgb(var(--c-ink) / 0.12)', background: 'rgb(var(--c-card))' }} data-testid="mention-list">
            {mentionMatches.map((p) => (
              <button key={p.id} type="button" className="w-full text-left px-2.5 py-2 rounded-lg active:bg-black/5 dark:active:bg-white/10" data-testid={`mention-${p.name}`} onClick={() => pickPerson(p)}>
                <span className="font-medium">@{p.name}</span>
                {p.relation && <span className="muted text-sm"> · {p.relation}</span>}
              </button>
            ))}
            {mentionCanCreate && (
              <button type="button" className="w-full text-left px-2.5 py-2 rounded-lg text-[#007aff]" data-testid="mention-create" onClick={() => createAndPick(mention.query.trim())}>
                ＋ 新建联系人「{mention.query.trim()}」（关系之后到「人物」页补）
              </button>
            )}
          </div>
        )}
        <p className="text-xs muted">小提示：写故事时打 @ 就能选人；通讯录在底部「人物」页，可以先把常出现的人加好，写上「他是我的谁」。</p>
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
