import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { hasAnyData, type LifeEvent } from '../lib/types';
import { deleteEvent, saveEvent } from '../lib/repo';
import { todayKey } from '../lib/time';

interface Item {
  date: string;
  kind: 'event' | 'day';
  title: string;
  note?: string;
  event?: LifeEvent;
}

export default function Timeline({ goRecord }: { goRecord: (date: string) => void }) {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const [editing, setEditing] = useState<LifeEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fDate, setFDate] = useState(todayKey());
  const [fTitle, setFTitle] = useState('');
  const [fNote, setFNote] = useState('');
  const [msg, setMsg] = useState('');

  const items: Item[] = [];
  for (const e of events ?? []) items.push({ date: e.date, kind: 'event', title: e.title, note: e.note, event: e });
  for (const d of days ?? []) {
    if (!hasAnyData(d)) continue;
    const texts = [d.story, d.bestMoment ? `最好时刻：${d.bestMoment}` : '', d.worstMoment ? `最差时刻：${d.worstMoment}` : ''].filter(Boolean);
    if (texts.length) items.push({ date: d.date, kind: 'day', title: texts[0]!, note: texts.slice(1).join('\n') || undefined });
  }
  items.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.kind === 'event' ? -1 : 1));

  const openNew = () => { setEditing(null); setFDate(todayKey()); setFTitle(''); setFNote(''); setFormOpen(true); };
  const openEdit = (e: LifeEvent) => { setEditing(e); setFDate(e.date); setFTitle(e.title); setFNote(e.note ?? ''); setFormOpen(true); };
  const onSave = async () => {
    if (!fTitle.trim()) { setMsg('事件标题不能为空'); return; }
    await saveEvent({ id: editing?.id, date: fDate, title: fTitle, note: fNote });
    setFormOpen(false);
    setMsg(editing ? '事件已更新' : '事件已添加');
  };
  const onDelete = async (e: LifeEvent) => {
    if (!window.confirm(`删除事件「${e.title}」？`)) return;
    await deleteEvent(e.id);
    setMsg('事件已删除');
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold">人生时间轴</h1>
          <p className="muted text-sm mt-1">关系与生活事件只在这里作标记，不评分、不进维度。</p>
        </div>
        <button className="btn-primary shrink-0" onClick={openNew} data-testid="add-event-btn">＋ 事件</button>
      </header>

      {formOpen && (
        <section className="card space-y-3" data-testid="event-form">
          <h2 className="font-semibold">{editing ? '编辑事件' : '新事件'}</h2>
          <input type="date" className="input" value={fDate} max={todayKey()} onChange={(e) => setFDate(e.target.value)} data-testid="event-date" />
          <input className="input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="发生了什么，如：搬家 / 和家人旅行 / 换工作" data-testid="event-title" />
          <textarea className="input" value={fNote} onChange={(e) => setFNote(e.target.value)} placeholder="备注（可选，原文保留）" data-testid="event-note" />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={onSave} data-testid="event-save">保存事件</button>
            <button className="btn-ghost" onClick={() => setFormOpen(false)}>取消</button>
          </div>
        </section>
      )}
      {msg && <p className="text-sm text-[#007aff]">{msg}</p>}

      <section className="space-y-2" data-testid="timeline-list">
        {items.length === 0 && <p className="muted text-sm">还没有内容。先去记录今天，或添加一个事件。</p>}
        {items.map((it, i) => (
          <div key={`${it.date}-${i}`} className="card !py-3 text-sm flex gap-3">
            <div className="shrink-0 w-[74px]">
              <div className="muted text-xs">{it.date}</div>
              <div className={`text-[11px] mt-0.5 ${it.kind === 'event' ? 'text-[#af52de]' : 'text-[#007aff]'}`}>{it.kind === 'event' ? '◆ 事件' : '日记'}</div>
            </div>
            <div className="flex-1 min-w-0">
              <button className="text-left w-full" onClick={() => goRecord(it.date)}>
                <p>{it.title}</p>
                {it.note && <p className="muted mt-0.5 whitespace-pre-line">{it.note}</p>}
              </button>
              {it.event && (
                <div className="flex gap-3 mt-1.5">
                  <button className="text-[#007aff] text-xs" onClick={() => openEdit(it.event!)}>编辑</button>
                  <button className="text-[#ff3b30] text-xs" onClick={() => onDelete(it.event!)}>删除</button>
                  {it.event.synthetic && <span className="muted text-xs">示例</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
