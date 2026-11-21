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
import type { AutoScore, DayRecord, DimKey, DimState } from './types';
import { addDays, daysBetween, monthEnd, monthStart, weekStart } from './time';

export interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type DayBar =
  | { kind: 'candle'; date: string; ohlc: Ohlc }
  | { kind: 'point'; date: string; value: number; invalid?: boolean; auto?: AutoScore }
  | { kind: 'empty'; date: string };

/**
 * 把自动分并入日K：某天某维手动完全没记、且该天有自动分时，呈现为「自动点」（带依据）。
 * 手动只要记了任何一项，自动分就不出现——手动永远优先（所有者 2026-11-19 拍板）。
 * 周/月不在这里并点，而是由 aggregateBar 按「有效评分」口径统一聚合（v0.4.0 指令第七节）。
 */
export function mergeAutoPoints(
  bars: (DayBar | PeriodBar)[],
  autoScores: Map<string, Partial<Record<DimKey, AutoScore>>>,
  dim: DimKey,
): (DayBar | PeriodBar)[] {
  return bars.map((b) => {
    if (!('date' in b) || b.kind !== 'empty') return b;
    const auto = autoScores.get(b.date)?.[dim];
    if (!auto) return b;
    return { kind: 'point', date: b.date, value: auto.score, auto } satisfies DayBar;
  });
}

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
  /** 周期内有「有效评分」的天数（手动或自动，手动优先） */
  recordedDays: number;
  /** 其中评分来自自动分的天数 */
  autoDays: number;
  /** 周期总天数 */
  totalDays: number;
}

/**
 * 一天的「有效评分」（v0.4.0 所有者指令第七节口径）：手动记了就用手动的代表值
 * （晚间优先，与日K点位同口径；整根蜡烛日的代表值即收盘=晚间）；手动没记才用自动分。
 * 返回 null = 这天这个维度没有任何评分。
 */
export function effectiveValue(
  day: DayRecord | undefined,
  dim: DimKey,
  auto?: AutoScore,
): { value: number; source: 'manual' | 'auto' } | null {
  const s = day?.dims[dim];
  const v = s?.evening ?? s?.morning ?? s?.best ?? s?.worst;
  if (v !== undefined) return { value: v, source: 'manual' };
  if (auto) return { value: auto.score, source: 'auto' };
  return null;
}

/**
 * 周/月聚合（v0.4.0 改版口径，替代旧的「按 OHLC 字段拼」算法）：
 * 按周期内每天的「有效评分」聚合——开=第一条有效评分、收=最后一条、高=最高、低=最低；
 * 只有一条有效评分时给点，不强行生成蜡烛；没有就留空，绝不补造。
 * 这样自动分与手动分在同一口径下进入周/月K（修复旧版周/月不显示自动分的问题），手动仍优先。
 */
export function aggregateBar(
  days: DayRecord[],
  dim: DimKey,
  start: string,
  end: string,
  autoScores?: Map<string, Partial<Record<DimKey, AutoScore>>>,
): PeriodBar {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const totalDays = daysBetween(start, end) + 1;
  const entries: { value: number; source: 'manual' | 'auto' }[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) {
    const eff = effectiveValue(byDate.get(cur), dim, autoScores?.get(cur)?.[dim]);
    if (eff) entries.push(eff);
  }
  const recordedDays = entries.length;
  const autoDays = entries.filter((e) => e.source === 'auto').length;
  if (recordedDays === 0) return { kind: 'empty', start, end, recordedDays, autoDays, totalDays };
  if (recordedDays === 1) return { kind: 'point', start, end, value: entries[0]!.value, recordedDays, autoDays, totalDays };
  const values = entries.map((e) => e.value);
  const ohlc: Ohlc = {
    open: entries[0]!.value,
    close: entries[entries.length - 1]!.value,
    high: Math.max(...values),
    low: Math.min(...values),
  };
  return { kind: 'candle', start, end, ohlc, recordedDays, autoDays, totalDays };
}

export type Period = 'day' | 'week' | 'month';

export interface PeriodSeries {
  bars: (DayBar | PeriodBar)[];
}

/** 生成日/周/月序列。日序列逐日一格（含 empty 格，留空不填充）；周/月按自然周（周一起）/自然月切分。autoScores 只影响周/月聚合（日K的自动点由 mergeAutoPoints 并入）。 */
export function buildSeries(days: DayRecord[], dim: DimKey, period: Period, from: string, to: string, autoScores?: Map<string, Partial<Record<DimKey, AutoScore>>>): (DayBar | PeriodBar)[] {
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
      out.push(aggregateBar(days, dim, start, end, autoScores));
      start = addDays(start, 7);
    }
  } else {
    let start = monthStart(from);
    while (start <= to) {
      out.push(aggregateBar(days, dim, start, monthEnd(start), autoScores));
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
