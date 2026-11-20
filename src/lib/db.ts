import Dexie, { type Table } from 'dexie';
import type { AutoDay, DayRecord, LifeEvent, Person } from './types';

export const DB_NAME = 'lifeos-kline';

export class LifeKlineDB extends Dexie {
  days!: Table<DayRecord, string>;
  events!: Table<LifeEvent, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  autoDays!: Table<AutoDay, string>;
  people!: Table<Person, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      days: 'date, updatedAt',
      events: 'id, date, updatedAt',
      meta: 'key',
    });
    // v2：新增汇入层 autoDays（其他 App 交换文件汇入的事实/参考值），与手动记录分开存
    this.version(2).stores({
      days: 'date, updatedAt',
      events: 'id, date, updatedAt',
      meta: 'key',
      autoDays: 'date',
    });
    // v3：新增通讯录 people（人物 + 自定义关系，只作故事 @ 提及与按人汇总）
    this.version(3).stores({
      days: 'date, updatedAt',
      events: 'id, date, updatedAt',
      meta: 'key',
      autoDays: 'date',
      people: 'id, name',
    });
  }
}

export let db = new LifeKlineDB();

/** 仅供测试：换一个独立数据库 */
export function switchDatabase(name: string): LifeKlineDB {
  db = new LifeKlineDB(name);
  return db;
}
