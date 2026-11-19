import type { DayRecord, LifeEvent } from './types';
import { addDays, deviceTz, nowUtc, todayKey, uuid } from './time';

/**
 * 虚构示例数据：全部 synthetic=true，与真实数据严格区分，可一键清除。
 * 只用正式事实四项；六维值有意留出缺失与不完整的日子，用来演示“留空 / 只画点 / 数据不足”。
 */
export function sampleData(): { days: DayRecord[]; events: LifeEvent[] } {
  const tz = deviceTz();
  const now = nowUtc();
  const t = todayKey();
  const mk = (offset: number, partial: Partial<DayRecord>): DayRecord => ({
    date: addDays(t, offset),
    dims: {},
    facts: {},
    synthetic: true,
    backfill: offset < 0,
    createdAt: now,
    updatedAt: now,
    tz,
    ...partial,
  });
  const days: DayRecord[] = [
    mk(-13, {
      dims: { health: { morning: 3, evening: 4, best: 5, worst: 2 }, emotion: { morning: 3, evening: 3, best: 4, worst: 2 }, work: { morning: 3, evening: 4, best: 4, worst: 3 } },
      facts: { sleepMinutes: 430, workMinutes: 390 },
      story: '示例：忙完手头的事，晚上散了步。',
      bestMoment: '示例：傍晚散步时状态最好',
      worstMoment: '示例：下午犯困时最差',
    }),
    mk(-12, {
      dims: { health: { evening: 3 }, learning: { evening: 4 } },
      facts: { studyMinutes: 45 },
      story: '示例：只记了晚间状态的一天，K线只画点，不画蜡烛。',
    }),
    // -11 故意不生成：缺失日，K线留空
    mk(-10, {
      dims: { finance: { morning: 3, evening: 3, best: 4, worst: 3 }, spirit: { morning: 4, evening: 5, best: 5, worst: 3 } },
      facts: { spendAmount: 86.5 },
      story: '示例：看完一部电影，想了很多。',
    }),
    mk(-6, {
      dims: { health: { morning: 2, evening: 3, best: 4, worst: 1 }, emotion: { morning: 2, evening: 2, best: 3, worst: 1 } },
      facts: { sleepMinutes: 300 },
      story: '示例：没睡好的一天。',
      worstMoment: '示例：凌晨醒来后一直睡不着',
    }),
    mk(-1, {
      dims: { work: { morning: 4, evening: 4, best: 5, worst: 3 }, learning: { morning: 3, evening: 4, best: 4, worst: 3 } },
      facts: { workMinutes: 420, studyMinutes: 30 },
    }),
    mk(0, {
      dims: { emotion: { morning: 3 } },
      story: '示例：今天刚开始，先记了早晨状态。',
    }),
  ];
  const events: LifeEvent[] = [
    { id: uuid(), date: addDays(t, -10), title: '示例事件：看了一部触动很大的电影', note: '只作时间轴标记，不评分', synthetic: true, createdAt: now, updatedAt: now, tz },
    { id: uuid(), date: addDays(t, -6), title: '示例事件：失眠', synthetic: true, createdAt: now, updatedAt: now, tz },
  ];
  return { days, events };
}
