import Dexie, { type Table } from 'dexie';
import type { DayRecord, LifeEvent } from './types';

export const DB_NAME = 'lifeos-kline';

export class LifeKlineDB extends Dexie {
  days!: Table<DayRecord, string>;
  events!: Table<LifeEvent, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      days: 'date, updatedAt',
      events: 'id, date, updatedAt',
      meta: 'key',
    });
  }
}

export let db = new LifeKlineDB();

/** 仅供测试：换一个独立数据库 */
export function switchDatabase(name: string): LifeKlineDB {
  db = new LifeKlineDB(name);
  return db;
}
