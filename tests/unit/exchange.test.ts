import { describe, expect, it } from 'vitest';
import { parseExchange } from '../../src/lib/exchange';
import { computeAutoScores, scoreFinance, scoreHealth } from '../../src/lib/autoscore';
import { dayBar, mergeAutoPoints } from '../../src/lib/kline';
import { emptyDay, type AutoDay } from '../../src/lib/types';

const manifest = (sourceApp: string) => ({
  format: 'lifeos-exchange', protocolVersion: '0.1.2', sourceApp, synthetic: false,
  scoringPolicy: 'facts-never-produce-scores',
});
const rec = (over: Record<string, unknown>) => ({
  sourceRecordId: Math.random().toString(36).slice(2), op: 'write',
  occurredAt: '2026-11-18T04:00:00Z', tz: 'Asia/Shanghai', sourceUpdatedAt: '2026-11-18T05:00:00Z', ...over,
});

describe('parseExchange：三方交换文件按日聚合', () => {
  it('生息：sleepMinutes 落正式事实、sleepQuality 感受落 refs、运动落 refs', () => {
    const text = JSON.stringify({
      manifest: manifest('lifeos.shike'),
      records: [
        rec({ layer: 'fact', data: { metricKey: 'sleepMinutes', value: 450, unit: 'min', attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'feeling', data: { aspect: 'sleepQuality', scale: '1-5', value: 4, attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'fact', data: { metricKey: 'x-exercise-minutes', value: 25, unit: 'min', attributes: { localDate: '2026-11-18' } } }),
      ],
    });
    const p = parseExchange(text);
    expect(p.sourceApp).toBe('lifeos.shike');
    expect(p.days).toHaveLength(1);
    expect(p.days[0]!.facts.sleepMinutes).toBe(450);
    expect(p.days[0]!.refs.sleepQuality).toBe(4);
    expect(p.days[0]!.refs.exerciseMinutes).toBe(25);
  });

  it('钱在哪：同日多笔 spendAmount 累加；资产快照只取 CNY', () => {
    const text = JSON.stringify({
      manifest: manifest('lifeos.money-where'),
      records: [
        rec({ layer: 'fact', data: { metricKey: 'spendAmount', value: 30, currency: 'CNY', attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'fact', data: { metricKey: 'spendAmount', value: 12.5, currency: 'CNY', attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'fact', data: { metricKey: 'x-asset-snapshot-amount', value: 1000, currency: 'CNY', attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'fact', data: { metricKey: 'x-asset-snapshot-amount', value: 50, currency: 'USD', attributes: { localDate: '2026-11-18' } } }),
      ],
    });
    const p = parseExchange(text);
    expect(p.days[0]!.facts.spendAmount).toBeCloseTo(42.5);
    expect(p.days[0]!.refs.assetSnapshotCny).toBe(1000);
  });

  it('阅迹：阅读分钟与文化活动标志', () => {
    const text = JSON.stringify({
      manifest: manifest('lifeos.yueji'),
      records: [
        rec({ layer: 'fact', data: { metricKey: 'x-reading-minutes', value: 40, attributes: { localDate: '2026-11-18' } } }),
        rec({ layer: 'fact', data: { metricKey: 'x-culture-activity', value: 1, attributes: { localDate: '2026-11-18', hasFeeling: true, finished: false } } }),
      ],
    });
    const p = parseExchange(text);
    expect(p.days[0]!.refs.readingMinutes).toBe(40);
    expect(p.days[0]!.refs.cultureHasFeeling).toBe(true);
    expect(p.days[0]!.refs.cultureFinished).toBeFalsy();
  });

  it('void 抵消同 id 的 write；非交换文件报错', () => {
    const id = 'abc123';
    const text = JSON.stringify({
      manifest: manifest('lifeos.shike'),
      records: [
        { ...rec({ layer: 'fact', data: { metricKey: 'sleepMinutes', value: 400, attributes: { localDate: '2026-11-18' } } }), sourceRecordId: id },
        { ...rec({ op: 'void' }), sourceRecordId: id, data: undefined },
      ],
    });
    expect(parseExchange(text).days).toHaveLength(0);
    expect(() => parseExchange(JSON.stringify({ manifest: { format: 'lifeos-export-v1' }, records: [] }))).toThrow();
    expect(() => parseExchange('not json')).toThrow();
  });
});

describe('autoscore：试行锚点', () => {
  const day = (over: Partial<AutoDay>): AutoDay => ({ date: '2026-11-18', facts: {}, refs: {}, sources: ['x'], updatedAt: '', ...over });
  it('健康：睡眠 7h30 → 4 分；叠加质量自评取中', () => {
    expect(scoreHealth(day({ facts: { sleepMinutes: 450 } }))?.score).toBe(4);
    expect(scoreHealth(day({ facts: { sleepMinutes: 450 }, refs: { sleepQuality: 5 } }))?.score).toBe(5); // (4+5)/2=4.5→5? round=5
    expect(scoreHealth(day({ facts: { sleepMinutes: 200 } }))?.score).toBe(1);
  });
  it('财务：只有昨日资产才出分；+1% 以上 5 分；只有支出不出分', () => {
    expect(scoreFinance(day({ refs: { assetSnapshotCny: 1010 } }), 1000)?.score).toBe(5);
    expect(scoreFinance(day({ refs: { assetSnapshotCny: 999 } }), 1000)?.score).toBe(3);
    expect(scoreFinance(day({ refs: { assetSnapshotCny: 900 } }), 1000)?.score).toBe(1);
    expect(scoreFinance(day({ facts: { spendAmount: 500 } }), undefined)).toBeUndefined();
  });
  it('整体：work / emotion 永远没有自动分', () => {
    const m = computeAutoScores([
      day({ date: '2026-11-17', refs: { assetSnapshotCny: 1000 } }),
      day({ date: '2026-11-18', facts: { sleepMinutes: 500 }, refs: { assetSnapshotCny: 1005, readingMinutes: 100, cultureFinished: true } }),
    ]);
    const s = m.get('2026-11-18')!;
    expect(s.health?.score).toBe(5);
    expect(s.finance?.score).toBe(4); // +0.5%
    expect(s.learning?.score).toBe(5);
    expect(s.spirit?.score).toBe(5);
    expect(s.work).toBeUndefined();
    expect(s.emotion).toBeUndefined();
    expect(m.get('2026-11-17')).toBeUndefined(); // 第一天无昨日资产、无其他数据 → 不出分
  });
});

describe('mergeAutoPoints：手动优先', () => {
  it('手动没记才出现自动点；手动记了就以手动为准', () => {
    const manual = emptyDay('2026-11-18', 'Asia/Shanghai');
    manual.dims = { health: { evening: 2 } };
    const bars = [dayBar(undefined, 'health'), dayBar(manual, 'health')];
    // 第一条构造 empty：用一个不存在的日期
    const emptyBar = { kind: 'empty' as const, date: '2026-11-17' };
    const scores = new Map([
      ['2026-11-17', { health: { score: 4 as const, basis: '睡眠 7小时30分' } }],
      ['2026-11-18', { health: { score: 5 as const, basis: '睡眠 8小时20分' } }],
    ]);
    const merged = mergeAutoPoints([emptyBar, bars[1]!], scores, 'health');
    expect(merged[0]).toMatchObject({ kind: 'point', value: 4 });
    expect(merged[1]).toMatchObject({ kind: 'point', value: 2 });
    expect((merged[1] as { auto?: unknown }).auto).toBeUndefined();
  });
});
