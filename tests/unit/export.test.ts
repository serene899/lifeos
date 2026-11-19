import { describe, expect, it } from 'vitest';
import { buildExport, buildMarkdown, validateExportFile } from '../../src/lib/exporter';
import { applyImport, allDays, allEvents, saveDay, saveEvent } from '../../src/lib/repo';
import { emptyDay } from '../../src/lib/types';

async function seed() {
  const d = emptyDay('2026-11-10', 'Asia/Shanghai');
  d.dims = { health: { morning: 3, evening: 4, best: 5, worst: 2 } };
  d.facts = { sleepMinutes: 420, spendAmount: 35.5 };
  d.story = '测试故事';
  await saveDay(d);
  await saveEvent({ date: '2026-11-10', title: '测试事件' });
}

describe('lifeos-export-v1 导出', () => {
  it('格式名、条数、校验和齐全', async () => {
    await seed();
    const f = await buildExport(await allDays(), await allEvents());
    expect(f.format).toBe('lifeos-export-v1');
    expect(f.counts).toEqual({ days: 1, events: 1, total: 2 });
    expect(f.checksum.value).toMatch(/^[0-9a-f]{64}$/);
  });
  it('导出→校验通过；篡改任一数值后校验和不符被拒', async () => {
    await seed();
    const f = await buildExport(await allDays(), await allEvents());
    expect((await validateExportFile(f)).errors).toEqual([]);
    const tampered = JSON.parse(JSON.stringify(f));
    tampered.days[0].facts.sleepMinutes = 999;
    const res = await validateExportFile(tampered);
    expect(res.errors.join()).toContain('校验和');
  });
  it('格式名不对直接拒绝', async () => {
    const res = await validateExportFile({ format: 'other-v9', days: [], events: [] });
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.file).toBeUndefined();
  });
  it('运动分钟等非正式事实字段混入 → 拒绝导入（规则 8、9）', async () => {
    await seed();
    const f = await buildExport(await allDays(), await allEvents());
    const bad = JSON.parse(JSON.stringify(f));
    bad.days[0].facts.exerciseMinutes = 30;
    bad.checksum.value = 'x'; // 即使校验和先不论，白名单也必须拦下
    const res = await validateExportFile(bad);
    expect(res.errors.join()).toContain('exerciseMinutes');
  });
  it('第七维混入 → 拒绝导入（规则 2）', async () => {
    await seed();
    const f = await buildExport(await allDays(), await allEvents());
    const bad = JSON.parse(JSON.stringify(f));
    bad.days[0].dims.relationship = { evening: 3 };
    const res = await validateExportFile(bad);
    expect(res.errors.join()).toContain('relationship');
  });
  it('导出→清空→导入恢复，条数与内容一致（恢复链路）', async () => {
    await seed();
    const f = await buildExport(await allDays(), await allEvents());
    const { db } = await import('../../src/lib/db');
    await db.days.clear();
    await db.events.clear();
    await applyImport(f, 'overwrite');
    const days = await allDays();
    const events = await allEvents();
    expect(days).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(days[0].story).toBe('测试故事');
    expect(days[0].facts.sleepMinutes).toBe(420);
  });
  it('合并导入不清空已有数据，同日以导入为准', async () => {
    await seed();
    const other = emptyDay('2026-11-11', 'Asia/Shanghai');
    other.story = '另一天';
    const f = await buildExport([other], []);
    await applyImport(f, 'merge');
    expect(await allDays()).toHaveLength(2);
  });
  it('Markdown 导出含故事原文与事实，且不出现总分字样', async () => {
    await seed();
    const md = buildMarkdown(await allDays(), await allEvents());
    expect(md).toContain('测试故事');
    expect(md).toContain('睡眠 420 分钟');
    expect(md).not.toContain('总分');
  });
});

describe('repo CRUD 与持久化结构', () => {
  it('保存后按日期可读回，编辑保留 createdAt、更新 updatedAt', async () => {
    const d = emptyDay('2026-11-10', 'Asia/Shanghai');
    d.story = '第一版';
    const a = await saveDay(d);
    const b = await saveDay({ ...a, story: '第二版' });
    expect(b.createdAt).toBe(a.createdAt);
    expect(b.story).toBe('第二版');
    expect((await allDays())[0].story).toBe('第二版');
  });
  it('过去日期的记录自动标记补记', async () => {
    const d = emptyDay('2020-01-01', 'Asia/Shanghai');
    const saved = await saveDay(d);
    expect(saved.backfill).toBe(true);
  });
  it('事件可增删改，且事件不带任何评分/维度字段', async () => {
    const ev = await saveEvent({ date: '2026-11-10', title: '搬家' });
    expect(Object.keys(ev)).not.toContain('dimension');
    expect(Object.keys(ev)).not.toContain('score');
    const { deleteEvent } = await import('../../src/lib/repo');
    await deleteEvent(ev.id);
    expect(await allEvents()).toHaveLength(0);
  });
});
