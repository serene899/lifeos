import { db } from './db';
import type { AutoDay, DayRecord, LifeEvent, Person } from './types';
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

/* ---------- 通讯录 ---------- */

export async function allPeople(): Promise<Person[]> {
  return (await db.people.toArray()).sort((a, b) => (a.name < b.name ? -1 : 1));
}
export async function savePerson(input: { id?: string; name: string; relation: string; note?: string; synthetic?: boolean }): Promise<Person> {
  const now = nowUtc();
  const existing = input.id ? await db.people.get(input.id) : undefined;
  const p: Person = {
    id: input.id ?? uuid(),
    name: input.name.trim(),
    relation: input.relation.trim(),
    note: input.note?.trim() || undefined,
    synthetic: existing?.synthetic ?? input.synthetic,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    tz: deviceTz(),
  };
  await db.people.put(p);
  return p;
}
export async function deletePerson(id: string): Promise<void> {
  await db.people.delete(id);
}

/** 导入写入：merge=按日期/id 合并（同日同 id 以导入为准）；overwrite=先清空再写入 */
export async function applyImport(file: ExportFile, mode: 'merge' | 'overwrite'): Promise<void> {
  await db.transaction('rw', db.days, db.events, db.people, async () => {
    if (mode === 'overwrite') {
      await db.days.clear();
      await db.events.clear();
      await db.people.clear();
    }
    if (file.days.length) await db.days.bulkPut(file.days);
    if (file.events.length) await db.events.bulkPut(file.events);
    if (file.people?.length) await db.people.bulkPut(file.people);
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.days, db.events, db.autoDays, db.people, async () => {
    await db.days.clear();
    await db.events.clear();
    await db.autoDays.clear();
    await db.people.clear();
  });
}

/* ---------- 汇入层（其他 App 的交换数据） ---------- */

export async function allAutoDays(): Promise<AutoDay[]> {
  return (await db.autoDays.toArray()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
export async function getAutoDay(date: string): Promise<AutoDay | undefined> {
  return db.autoDays.get(date);
}
/** 合并写入汇入数据：按日期合并，新文件带来的字段覆盖旧值，未带来的保留 */
export async function mergeAutoDays(incoming: AutoDay[]): Promise<void> {
  await db.transaction('rw', db.autoDays, async () => {
    for (const inc of incoming) {
      const old = await db.autoDays.get(inc.date);
      if (!old) {
        await db.autoDays.put(inc);
      } else {
        await db.autoDays.put({
          date: inc.date,
          facts: { ...old.facts, ...inc.facts },
          refs: { ...old.refs, ...inc.refs },
          sources: [...new Set([...old.sources, ...inc.sources])],
          updatedAt: inc.updatedAt,
        });
      }
    }
  });
}
export async function clearAutoDays(): Promise<void> {
  await db.autoDays.clear();
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
