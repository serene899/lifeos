import { describe, expect, it } from 'vitest';
import { aggregateBar, buildSeries, dayBar, validateDimState } from '../../src/lib/kline';
import type { AutoScore, DimKey } from '../../src/lib/types';
type AutoMap = Map<string, Partial<Record<DimKey, AutoScore>>>;
import { emptyDay, type DayRecord } from '../../src/lib/types';

function day(date: string, dims: DayRecord['dims']): DayRecord {
  return { ...emptyDay(date, 'Asia/Shanghai'), dims };
}

describe('日K 三态（规则 4、5）', () => {
  it('四值齐全且约束成立 → 标准蜡烛，OHLC 对应晨/最好/最差/晚', () => {
    const b = dayBar(day('2026-11-10', { health: { morning: 3, evening: 4, best: 5, worst: 2 } }), 'health');
    expect(b.kind).toBe('candle');
    if (b.kind === 'candle') expect(b.ohlc).toEqual({ open: 3, high: 5, low: 2, close: 4 });
  });
  it('只有晚间值 → 只画点，绝不生成蜡烛', () => {
    const b = dayBar(day('2026-11-10', { health: { evening: 3 } }), 'health');
    expect(b).toEqual({ kind: 'point', date: '2026-11-10', value: 3 });
  });
  it('只有晨间值 → 点取晨间值', () => {
    const b = dayBar(day('2026-11-10', { emotion: { morning: 2 } }), 'emotion');
    expect(b.kind).toBe('point');
    if (b.kind === 'point') expect(b.value).toBe(2);
  });
  it('没记录这一维 → empty（留空），不是 0', () => {
    const b = dayBar(day('2026-11-10', { health: { evening: 3 } }), 'work');
    expect(b.kind).toBe('empty');
  });
  it('整天没记录 → empty', () => {
    expect(dayBar(undefined, 'health').kind).toBe('empty');
  });
  it('四值齐全但约束不成立（最好低于晚间）→ 降级为点并标注 invalid，不修正不编造', () => {
    const b = dayBar(day('2026-11-10', { health: { morning: 3, evening: 4, best: 3, worst: 2 } }), 'health');
    expect(b.kind).toBe('point');
    if (b.kind === 'point') expect(b.invalid).toBe(true);
  });
  it('日序列中缺失日保持 empty 格，不用前一天的值填充', () => {
    const days = [day('2026-11-10', { health: { evening: 4 } }), day('2026-11-12', { health: { evening: 2 } })];
    const s = buildSeries(days, 'health', 'day', '2026-11-10', '2026-11-12');
    expect(s.map((x) => x.kind)).toEqual(['point', 'empty', 'point']);
  });
});

describe('周/月聚合（v0.4.0 有效评分口径）', () => {
  const days = [
    day('2026-11-09', { health: { morning: 3, best: 4, worst: 2 } }), // 周一：有效评分=晨间 3（无晚间时取晨间）
    day('2026-11-11', { health: { evening: 5, best: 5, worst: 3 } }), // 有效评分=晚间 5
    day('2026-11-13', { health: { evening: 2 } }), // 有效评分=晚间 2
  ];
  it('开=第一条有效评分，收=最后一条，高/低=极值，覆盖天数如实', () => {
    const b = aggregateBar(days, 'health', '2026-11-09', '2026-11-15');
    expect(b.kind).toBe('candle');
    expect(b.ohlc).toEqual({ open: 3, high: 5, low: 2, close: 2 });
    expect(b.recordedDays).toBe(3);
    expect(b.autoDays).toBe(0);
    expect(b.totalDays).toBe(7);
  });
  it('周期内只有一条有效评分 → 只给点，不强行生成蜡烛', () => {
    const ds = [day('2026-11-10', { health: { evening: 4, best: 5, worst: 3 } })];
    const b = aggregateBar(ds, 'health', '2026-11-09', '2026-11-15');
    expect(b.kind).toBe('point');
    if (b.kind === 'point') expect(b.value).toBe(4);
  });
  it('周期内完全无记录 → empty', () => {
    const b = aggregateBar(days, 'finance', '2026-11-09', '2026-11-15');
    expect(b.kind).toBe('empty');
    expect(b.recordedDays).toBe(0);
  });
  it('只有自动分的一周也能成蜡烛（修复旧版周/月不显示自动分）', () => {
    const auto: AutoMap = new Map([
      ['2026-11-09', { health: { score: 4, basis: '睡眠 7小时30分' } }],
      ['2026-11-11', { health: { score: 2, basis: '睡眠 5小时10分' } }],
      ['2026-11-13', { health: { score: 5, basis: '睡眠 8小时20分' } }],
    ]);
    const b = aggregateBar([], 'health', '2026-11-09', '2026-11-15', auto);
    expect(b.kind).toBe('candle');
    expect(b.ohlc).toEqual({ open: 4, high: 5, low: 2, close: 5 });
    expect(b.recordedDays).toBe(3);
    expect(b.autoDays).toBe(3);
  });
  it('手动与自动混合：手动优先，同日手动在则不用自动分', () => {
    const ds = [day('2026-11-10', { health: { evening: 3 } })];
    const auto: AutoMap = new Map([
      ['2026-11-10', { health: { score: 5, basis: '自动' } }],
      ['2026-11-12', { health: { score: 4, basis: '自动' } }],
    ]);
    const b = aggregateBar(ds, 'health', '2026-11-09', '2026-11-15', auto);
    expect(b.kind).toBe('candle');
    expect(b.ohlc).toEqual({ open: 3, high: 4, low: 3, close: 4 });
    expect(b.autoDays).toBe(1);
  });
  it('只有一条自动分 → 点，不是蜡烛', () => {
    const auto: AutoMap = new Map([['2026-11-10', { health: { score: 4, basis: '睡眠' } }]]);
    const b = aggregateBar([], 'health', '2026-11-09', '2026-11-15', auto);
    expect(b.kind).toBe('point');
    if (b.kind === 'point') expect(b.value).toBe(4);
    expect(b.autoDays).toBe(1);
  });
  it('周序列按周一切分，月序列按自然月切分', () => {
    const w = buildSeries(days, 'health', 'week', '2026-11-09', '2026-11-22');
    expect(w).toHaveLength(2);
    const m = buildSeries(days, 'health', 'month', '2026-11-01', '2026-11-30');
    expect(m).toHaveLength(1);
    if ('start' in m[0]) { expect(m[0].start).toBe('2026-11-01'); expect(m[0].end).toBe('2026-11-30'); }
  });
});

describe('表单校验（validateDimState）', () => {
  it('合法四值通过', () => {
    expect(validateDimState('健康', { morning: 3, evening: 4, best: 5, worst: 2 })).toEqual([]);
  });
  it('最好低于晚间 → 报错', () => {
    expect(validateDimState('健康', { evening: 4, best: 3 }).length).toBeGreaterThan(0);
  });
  it('最差高于晨间 → 报错', () => {
    expect(validateDimState('健康', { morning: 2, worst: 4 }).length).toBeGreaterThan(0);
  });
  it('超出 1~5 → 报错', () => {
    expect(validateDimState('健康', { evening: 9 as never }).length).toBeGreaterThan(0);
  });
  it('全空不报错（缺失合法）', () => {
    expect(validateDimState('健康', {})).toEqual([]);
  });
});

describe('维度隔离（规则 7）', () => {
  it('计算某一维时不混入其他维，更不存在六维平均入口', async () => {
    const d = day('2026-11-10', { health: { evening: 5 }, finance: { evening: 1 } });
    const b = dayBar(d, 'health');
    expect(b.kind).toBe('point');
    if (b.kind === 'point') expect(b.value).toBe(5); // 不是 (5+1)/2
    const mod = await import('../../src/lib/kline');
    expect(Object.keys(mod).some((k) => /average|overall|total/i.test(k))).toBe(false);
  });
});
