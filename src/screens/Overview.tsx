import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { DIM_KEYS, DIM_LABEL, hasAnyData } from '../lib/types';
import { addDays, daysBetween, monthStart, prettyDay, todayKey } from '../lib/time';
import { getMeta } from '../lib/repo';
import { computeAutoScores, fmtMinutes } from '../lib/autoscore';
import { useEffect, useMemo, useState } from 'react';

export default function Overview({ goRecord, goKline }: { goRecord: (date: string) => void; goKline: () => void }) {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const autoDays = useLiveQuery(() => db.autoDays.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const autoScores = useMemo(() => computeAutoScores(autoDays ?? []), [autoDays]);
  const autoByDate = useMemo(() => new Map((autoDays ?? []).map((a) => [a.date, a])), [autoDays]);
  const [lastExportAt, setLastExportAt] = useState<string | undefined>();
  useEffect(() => { getMeta<string>('lastExportAt').then(setLastExportAt).catch(() => undefined); }, []);

  const today = todayKey();
  const list = [...(days ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = new Map(list.map((d) => [d.date, d]));
  const todayRec = byDate.get(today);
  const month = monthStart(today);
  const monthDays = list.filter((d) => d.date >= month && hasAnyData(d));
  const daysInMonthSoFar = daysBetween(month, today) + 1;
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const recentStories = [...list].reverse().filter((d) => d.story || d.bestMoment || d.worstMoment).slice(0, 3);
  const recentEvents = [...(events ?? [])].sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 3);
  const exportAge = lastExportAt ? daysBetween(lastExportAt.slice(0, 10), today) : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] font-bold">人生K线图</h1>
        <p className="muted text-sm mt-1">记录真实人生，而不是评判人生。{prettyDay(today)}</p>
      </header>

      <section className="card" data-testid="guide-card">
        <h2 className="font-semibold mb-2">怎么用？大部分数据自己会来</h2>
        <ol className="text-sm space-y-1.5 list-none">
          <li><b>1.</b> 生息、钱在哪、阅迹里的数据，在「数据」页选一次交换文件收进来，图和自动分就有了</li>
          <li><b>2.</b> 你每天只补两件机器不知道的事：工作、情绪各点一个数字，再写一句话今天发生了什么</li>
          <li><b>3.</b> 点保存，完成。健康、财务、学习、精神生活的分都由数据自动算，你觉得不对随时改，改完以你的为准</li>
        </ol>
      </section>

      <section className="card" data-testid="today-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">今天</h2>
          <button className="btn-primary" onClick={() => goRecord(today)}>{todayRec && hasAnyData(todayRec) ? '继续记录今天' : '记录今天'}</button>
        </div>
        {todayRec && hasAnyData(todayRec) ? (
          <div className="mt-3 space-y-1 text-sm">
            {DIM_KEYS.map((k) => {
              const s = todayRec.dims[k];
              if (!s) return null;
              const parts: string[] = [];
              if (s.morning !== undefined) parts.push(`晨 ${s.morning}`);
              if (s.evening !== undefined) parts.push(`晚 ${s.evening}`);
              if (s.best !== undefined) parts.push(`最好 ${s.best}`);
              if (s.worst !== undefined) parts.push(`最差 ${s.worst}`);
              if (!parts.length) return null;
              return <div key={k} className="flex justify-between"><span>{DIM_LABEL[k]}</span><span className="muted">{parts.join(' · ')}</span></div>;
            })}
            {todayRec.story && <p className="pt-1">{todayRec.story}</p>}
          </div>
        ) : (
          <p className="muted text-sm mt-2">今天还没有记录。只记一句话也算数。</p>
        )}
        {(() => {
          const a = autoByDate.get(today);
          const sc = autoScores.get(today);
          if (!a && !sc) return null;
          const facts: string[] = [];
          const sleep = todayRec?.facts.sleepMinutes ?? a?.facts.sleepMinutes;
          if (sleep !== undefined) facts.push(`睡眠 ${fmtMinutes(sleep)}`);
          const spend = todayRec?.facts.spendAmount ?? a?.facts.spendAmount;
          if (spend !== undefined) facts.push(`支出 ¥${spend}`);
          if (a?.refs.readingMinutes) facts.push(`阅读 ${fmtMinutes(a.refs.readingMinutes)}`);
          return (
            <div className="mt-3 rounded-xl bg-amber-500/10 p-2.5 text-sm" data-testid="today-auto">
              <span className="text-amber-600 dark:text-amber-400 font-medium">已自动收到今天的数据</span>
              {facts.length > 0 && <span className="muted"> · {facts.join(' · ')}</span>}
              {sc && <div className="mt-1 muted text-xs">自动分：{Object.entries(sc).map(([k, v]) => `${DIM_LABEL[k as keyof typeof DIM_LABEL]} ${v!.score}`).join(' · ')}</div>}
            </div>
          );
        })()}
        <div className="flex gap-1.5 mt-4" aria-label="最近7天记录情况">
          {last7.map((d) => (
            <button key={d} onClick={() => goRecord(d)} className="flex-1">
              <div className={`h-2 rounded-full ${byDate.get(d) && hasAnyData(byDate.get(d)!) ? 'bg-[#007aff]' : 'bg-black/10 dark:bg-white/15'}`} />
              <div className="text-[10px] muted mt-1">{d.slice(5)}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-1">六维状态（最近一次记录）</h2>
        <p className="muted text-xs mb-3">六个维度分开看，不合成总分——平均值代表不了人生整体状态。</p>
        <div className="grid grid-cols-2 gap-2.5">
          {DIM_KEYS.map((k) => {
            const rec = [...list].reverse().find((d) => {
              const s = d.dims[k];
              return s && (s.evening !== undefined || s.morning !== undefined);
            });
            const s = rec?.dims[k];
            const v = s?.evening ?? s?.morning;
            // 手动没有时，回退到最近一天的自动分（标明自动）
            const autoEntry = v === undefined
              ? [...autoScores.entries()].filter(([, sc]) => sc[k]).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0]
              : undefined;
            return (
              <button key={k} className="text-left rounded-xl bg-black/[0.03] dark:bg-white/[0.06] p-3" onClick={goKline}>
                <div className="text-sm font-medium">{DIM_LABEL[k]}</div>
                <div className="text-[22px] font-bold mt-0.5">{v !== undefined ? v : autoEntry ? autoEntry[1][k]!.score : '—'}</div>
                <div className="muted text-[11px]">
                  {rec ? `${rec.date.slice(5)} ${s?.evening !== undefined ? '晚间' : '晨间'}状态`
                    : autoEntry ? `${autoEntry[0].slice(5)} 自动分 · ${autoEntry[1][k]!.basis}`
                    : '还没有记录'}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card text-sm space-y-1.5">
        <div className="flex justify-between"><span>本月记录覆盖</span><span className="muted">{monthDays.length} / {daysInMonthSoFar} 天</span></div>
        <div className="flex justify-between"><span>累计日记录</span><span className="muted">{list.length} 条</span></div>
        <div className="flex justify-between"><span>时间轴事件</span><span className="muted">{events?.length ?? 0} 条</span></div>
        <div className="flex justify-between">
          <span>上次导出备份</span>
          <span className={exportAge !== null && exportAge > 30 ? 'text-[#ff3b30]' : 'muted'}>
            {lastExportAt ? `${lastExportAt.slice(0, 10)}${exportAge !== null && exportAge > 30 ? '（已超过 30 天，记得备份）' : ''}` : '还没有导出过'}
          </span>
        </div>
      </section>

      {recentStories.length > 0 && (
        <section className="card">
          <h2 className="font-semibold mb-2">最近的故事</h2>
          <div className="space-y-3 text-sm">
            {recentStories.map((d) => (
              <button key={d.date} className="block text-left w-full" onClick={() => goRecord(d.date)}>
                <div className="muted text-xs">{d.date}{d.synthetic ? ' · 示例' : ''}</div>
                {d.story && <p>{d.story}</p>}
                {d.bestMoment && <p className="muted">最好时刻：{d.bestMoment}</p>}
                {d.worstMoment && <p className="muted">最差时刻：{d.worstMoment}</p>}
              </button>
            ))}
          </div>
        </section>
      )}

      {recentEvents.length > 0 && (
        <section className="card">
          <h2 className="font-semibold mb-2">最近事件</h2>
          <div className="space-y-2 text-sm">
            {recentEvents.map((e) => (
              <div key={e.id}><span className="muted text-xs mr-2">{e.date}</span>{e.title}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
