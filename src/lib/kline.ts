/**
 * 人生K线计算 —— 严格按 V0.3.3 规则：
 * - 规则 4：日K没有真实开高低收时，不得强行生成标准蜡烛 → 只有四值齐全且约束成立才给 candle；
 *   只有部分值时给 point（取 Close 优先，其次 Open）；完全没值给 null（留空）。
 * - 规则 5：缺失留空，绝不当 0，也不用前一天的值填充。
 * - 规则 6：Open=晨间、Close=晚间、High=最好、Low=最差。
 * - 规则 7：本模块只按单个维度计算，永远不计算六维平均，更不生成“人生整体”蜡烛。
 * - 约束：High ≥ max(Open, Close)，Low ≤ min(Open, Close)。约束不成立的数据不修正、不编造，
 *   降级为 point 并标注 invalid，避免假精确。
 */
import type { DayRecord, DimKey, DimState } from './types';
import { addDays, daysBetween, monthEnd, monthStart, weekStart } from './time';

export interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type DayBar =
  | { kind: 'candle'; date: string; ohlc: Ohlc }
  | { kind: 'point'; date: string; value: number; invalid?: boolean }
  | { kind: 'empty'; date: string };

function isValidOhlc(s: DimState): Ohlc | null {
  if (s.morning === undefined || s.evening === undefined || s.best === undefined || s.worst === undefined) return null;
  const o = { open: s.morning, high: s.best, low: s.worst, close: s.evening };
  if (o.high < Math.max(o.open, o.close) || o.low > Math.min(o.open, o.close) || o.high < o.low) return null;
  return o;
}
function hasViolation(s: DimState): boolean {
  if (s.morning === undefined || s.evening === undefined || s.best === undefined || s.worst === undefined) return false;
  return isValidOhlc(s) === null;
}

/** 某一天某维度的展示条：candle / point / empty 三态，绝不伪造 */
export function dayBar(day: DayRecord | undefined, dim: DimKey): DayBar {
  if (!day) return { kind: 'empty', date: '' };
  const s = day.dims[dim];
  if (!s) return { kind: 'empty', date: day.date };
  const ohlc = isValidOhlc(s);
  if (ohlc) return { kind: 'candle', date: day.date, ohlc };
  const value = s.evening ?? s.morning ?? s.best ?? s.worst;
  if (value === undefined) return { kind: 'empty', date: day.date };
  return { kind: 'point', date: day.date, value, invalid: hasViolation(s) || undefined };
}

export interface PeriodBar {
  kind: 'candle' | 'point' | 'empty';
  /** 周期起始日 */
  start: string;
  /** 周期结束日 */
  end: string;
  ohlc?: Ohlc;
  value?: number;
  /** 有该维度任一主观值的天数 */
  recordedDays: number;
  /** 周期总天数 */
  totalDays: number;
}

/**
 * 周/月聚合：Open=周期内第一个有晨间值的日子的晨间值；Close=最后一个有晚间值的日子的晚间值；
 * High=所有最好值的最大值；Low=所有最差值的最小值。四者缺一就不给蜡烛（规则 4 在聚合层同样成立）。
 */
export function aggregateBar(days: DayRecord[], dim: DimKey, start: string, end: string): PeriodBar {
  const inRange = days
    .filter((d) => d.date >= start && d.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const totalDays = daysBetween(start, end) + 1;
  let recordedDays = 0;
  let open: number | undefined;
  let close: number | undefined;
  let high: number | undefined;
  let low: number | undefined;
  for (const d of inRange) {
    const s = d.dims[dim];
    if (!s) continue;
    if (s.morning === undefined && s.evening === undefined && s.best === undefined && s.worst === undefined) continue;
    recordedDays++;
    if (open === undefined && s.morning !== undefined) open = s.morning;
    if (s.evening !== undefined) close = s.evening;
    if (s.best !== undefined) high = high === undefined ? s.best : Math.max(high, s.best);
    if (s.worst !== undefined) low = low === undefined ? s.worst : Math.min(low, s.worst);
  }
  if (recordedDays === 0) return { kind: 'empty', start, end, recordedDays, totalDays };
  if (open !== undefined && close !== undefined && high !== undefined && low !== undefined) {
    const ohlc = { open, high, low, close };
    if (high >= Math.max(open, close) && low <= Math.min(open, close)) {
      return { kind: 'candle', start, end, ohlc, recordedDays, totalDays };
    }
  }
  const value = close ?? open;
  if (value !== undefined) return { kind: 'point', start, end, value, recordedDays, totalDays };
  return { kind: 'empty', start, end, recordedDays, totalDays };
}

export type Period = 'day' | 'week' | 'month';

export interface PeriodSeries {
  bars: (DayBar | PeriodBar)[];
}

/** 生成日/周/月序列。日序列逐日一格（含 empty 格，留空不填充）；周/月按自然周（周一起）/自然月切分。 */
export function buildSeries(days: DayRecord[], dim: DimKey, period: Period, from: string, to: string): (DayBar | PeriodBar)[] {
  if (period === 'day') {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const out: DayBar[] = [];
    for (let cur = from; cur <= to; cur = addDays(cur, 1)) {
      const bar = dayBar(byDate.get(cur), dim);
      out.push(bar.kind === 'empty' ? { kind: 'empty', date: cur } : bar);
    }
    return out;
  }
  const out: PeriodBar[] = [];
  if (period === 'week') {
    let start = weekStart(from);
    while (start <= to) {
      const end = addDays(start, 6);
      out.push(aggregateBar(days, dim, start, end));
      start = addDays(start, 7);
    }
  } else {
    let start = monthStart(from);
    while (start <= to) {
      out.push(aggregateBar(days, dim, start, monthEnd(start)));
      start = monthStart(addDays(monthEnd(start), 1));
    }
  }
  return out;
}

/** 表单保存前校验：单维度的 OHLC 约束。返回错误文案数组（空=通过）。 */
export function validateDimState(dimLabel: string, s: DimState): string[] {
  const errs: string[] = [];
  const vals = [s.morning, s.evening, s.best, s.worst].filter((v) => v !== undefined) as number[];
  if (vals.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) errs.push(`${dimLabel}：状态值必须是 1~5 的整数`);
  if (s.best !== undefined && s.worst !== undefined && s.best < s.worst) errs.push(`${dimLabel}：最好状态不能低于最差状态`);
  if (s.best !== undefined && s.morning !== undefined && s.best < s.morning) errs.push(`${dimLabel}：最好状态不能低于早晨状态`);
  if (s.best !== undefined && s.evening !== undefined && s.best < s.evening) errs.push(`${dimLabel}：最好状态不能低于晚间状态`);
  if (s.worst !== undefined && s.morning !== undefined && s.worst > s.morning) errs.push(`${dimLabel}：最差状态不能高于早晨状态`);
  if (s.worst !== undefined && s.evening !== undefined && s.worst > s.evening) errs.push(`${dimLabel}：最差状态不能高于晚间状态`);
  return errs;
}
