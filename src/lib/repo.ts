import { db } from './db';
import type { DayRecord, LifeEvent } from './types';
import { deviceTz, nowUtc, todayKey, uuid } from './time';
import type { ExportFile } from './exporter';

export async function getDay(date: string): Promise<DayRecord | undefined> {
  return db.days.get(date);
}
export async function allDays(): Promise<DayRecord[]> {
  return (await db.days.toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
export async function saveDay(input: DayRecord): Promise<DayRecord> {
  const existing = await db.days.get(input.date);
  const now = nowUtc();
  const rec: DayRecord = {
    ...input,
    createdAt: existing?.createdAt ?? input.createdAt ?? now,
    updatedAt: now,
    tz: deviceTz(),
    backfill: existing?.backfill ?? (input.backfill ?? input.date < todayKey()),
    synthetic: existing?.synthetic ?? input.synthetic,
  };
  await db.days.put(rec);
  return rec;
}
export async function deleteDay(date: string): Promise<void> {
  await db.days.delete(date);
}

export async function allEvents(): Promise<LifeEvent[]> {
  return (await db.events.toArray()).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
  );
}
export async function saveEvent(input: { id?: string; date: string; title: string; note?: string; synthetic?: boolean }): Promise<LifeEvent> {
  const now = nowUtc();
  const existing = input.id ? await db.events.get(input.id) : undefined;
  const ev: LifeEvent = {
    id: input.id ?? uuid(),
    date: input.date,
    title: input.title.trim(),
    note: input.note?.trim() || undefined,
    synthetic: existing?.synthetic ?? input.synthetic,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tz: deviceTz(),
  };
  await db.events.put(ev);
  return ev;
}
export async function deleteEvent(id: string): Promise<void> {
  await db.events.delete(id);
}

/** 导入写入：merge=按日期/id 合并（同日同 id 以导入为准）；overwrite=先清空再写入 */
export async function applyImport(file: ExportFile, mode: 'merge' | 'overwrite'): Promise<void> {
  await db.transaction('rw', db.days, db.events, async () => {
    if (mode === 'overwrite') {
      await db.days.clear();
      await db.events.clear();
    }
    if (file.days.length) await db.days.bulkPut(file.days);
    if (file.events.length) await db.events.bulkPut(file.events);
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.days, db.events, async () => {
    await db.days.clear();
    await db.events.clear();
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
