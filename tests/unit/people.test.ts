import { describe, expect, it } from 'vitest';
import { activeMentionQuery, parseMentions, relatedDays } from '../../src/lib/people';
import { buildExport, validateExportFile } from '../../src/lib/exporter';
import { emptyDay, type LifeEvent, type Person } from '../../src/lib/types';

const P = (name: string, relation = '朋友'): Person => ({
  id: `id-${name}`, name, relation, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', tz: 'Asia/Shanghai',
});

describe('@ 提及解析', () => {
  const people = [P('王子'), P('王子怡', '同事'), P('阿杰')];
  it('长名优先，不把 @王子怡 拆成 @王子', () => {
    const segs = parseMentions('下午跟 @王子怡 去吃火锅', people);
    const hit = segs.find((s) => s.person);
    expect(hit?.person?.name).toBe('王子怡');
    expect(segs.map((s) => s.text).join('')).toBe('下午跟 @王子怡 去吃火锅');
  });
  it('不在通讯录的名字不高亮；邮箱样式的 @ 不误伤', () => {
    const segs = parseMentions('联系 a@b.com 或 @路人', people);
    expect(segs.every((s) => !s.person)).toBe(true);
  });
  it('一句里多个人都能识别', () => {
    const segs = parseMentions('@阿杰 和 @王子怡 一起', people);
    expect(segs.filter((s) => s.person).map((s) => s.person!.name)).toEqual(['阿杰', '王子怡']);
  });
});

describe('按人汇总相关的日子', () => {
  it('故事、最好/最差时刻、事件都能命中，按日期倒序', () => {
    const wang = P('王子怡', '同事');
    const d1 = { ...emptyDay('2026-11-19', 'Asia/Shanghai'), story: '下午跟 @王子怡 去吃火锅' };
    const d2 = { ...emptyDay('2026-11-20', 'Asia/Shanghai'), bestMoment: '和 @王子怡 聊到一个好点子' };
    const d3 = { ...emptyDay('2026-11-21', 'Asia/Shanghai'), story: '自己待着' };
    const ev: LifeEvent = { id: 'e1', date: '2026-11-18', title: '聚餐', note: '和 @王子怡', createdAt: 'x', updatedAt: 'x', tz: 'Asia/Shanghai' };
    const rel = relatedDays(wang, [d1, d2, d3], [ev]);
    expect(rel.map((r) => r.date)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18']);
    expect(rel.map((r) => r.from)).toEqual(['bestMoment', 'story', 'event']);
  });
});

describe('输入中的 @ 查询', () => {
  it('光标在 @名字 中间时能取到查询词与起始位', () => {
    const t = '跟 @王子 一起';
    const q = activeMentionQuery(t, 5);
    expect(q).toEqual({ query: '王子', start: 2 });
  });
  it('@ 后面已有空格则不再是查询', () => {
    expect(activeMentionQuery('跟 @王子怡 吃', 9)).toBeNull();
  });
  it('句首 @ 也算', () => {
    expect(activeMentionQuery('@阿', 2)).toEqual({ query: '阿', start: 0 });
  });
});

describe('导出带通讯录 + 旧文件兼容', () => {
  it('带 people 的导出校验和自洽、往返通过', async () => {
    const f = await buildExport([], [], [P('王子怡', '同事')]);
    expect(f.people).toHaveLength(1);
    expect(f.counts.people).toBe(1);
    const v = await validateExportFile(JSON.parse(JSON.stringify(f)));
    expect(v.errors).toEqual([]);
    expect(v.file?.people?.[0]?.name).toBe('王子怡');
  });
  it('旧版（无 people）导出仍按旧口径验得过', async () => {
    const f = await buildExport([], []);
    expect(f.people).toBeUndefined();
    const v = await validateExportFile(JSON.parse(JSON.stringify(f)));
    expect(v.errors).toEqual([]);
  });
  it('people 被篡改时校验和拦截', async () => {
    const f = await buildExport([], [], [P('王子怡', '同事')]);
    const raw = JSON.parse(JSON.stringify(f));
    raw.people[0].relation = '陌生人';
    const v = await validateExportFile(raw);
    expect(v.errors.join('')).toContain('校验和');
  });
});
