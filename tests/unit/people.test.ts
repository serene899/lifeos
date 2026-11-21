import { describe, expect, it } from 'vitest';
import { activeMentionQuery, daysUntilAnnual, parseMentions, personContacts, prettyMonthDay, relatedDays, sanitizeAnniversaries, sanitizeContacts } from '../../src/lib/people';
import { buildExport, validateExportFile } from '../../src/lib/exporter';
import { emptyDay, type LifeEvent, type Person } from '../../src/lib/types';

const P = (name: string, relation = '朋友'): Person => ({
  id: `id-${name}`, name, relation, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', tz: 'Asia/Shanghai',
});

describe('@ 提及解析', () => {
  const people = [P('张'), P('张小明', '同事'), P('阿杰')];
  it('长名优先，不把 @张小明 拆成 @张', () => {
    const segs = parseMentions('下午跟 @张小明 去吃火锅', people);
    const hit = segs.find((s) => s.person);
    expect(hit?.person?.name).toBe('张小明');
    expect(segs.map((s) => s.text).join('')).toBe('下午跟 @张小明 去吃火锅');
  });
  it('不在通讯录的名字不高亮；邮箱样式的 @ 不误伤', () => {
    const segs = parseMentions('联系 a@b.com 或 @路人', people);
    expect(segs.every((s) => !s.person)).toBe(true);
  });
  it('一句里多个人都能识别', () => {
    const segs = parseMentions('@阿杰 和 @张小明 一起', people);
    expect(segs.filter((s) => s.person).map((s) => s.person!.name)).toEqual(['阿杰', '张小明']);
  });
});

describe('按人汇总相关的日子', () => {
  it('故事、最好/最差时刻、事件都能命中，按日期倒序', () => {
    const wang = P('张小明', '同事');
    const d1 = { ...emptyDay('2026-11-19', 'Asia/Shanghai'), story: '下午跟 @张小明 去吃火锅' };
    const d2 = { ...emptyDay('2026-11-20', 'Asia/Shanghai'), bestMoment: '和 @张小明 聊到一个好点子' };
    const d3 = { ...emptyDay('2026-11-21', 'Asia/Shanghai'), story: '自己待着' };
    const ev: LifeEvent = { id: 'e1', date: '2026-11-18', title: '聚餐', note: '和 @张小明', createdAt: 'x', updatedAt: 'x', tz: 'Asia/Shanghai' };
    const rel = relatedDays(wang, [d1, d2, d3], [ev]);
    expect(rel.map((r) => r.date)).toEqual(['2026-11-20', '2026-11-19', '2026-11-18']);
    expect(rel.map((r) => r.from)).toEqual(['bestMoment', 'story', 'event']);
  });
});

describe('输入中的 @ 查询', () => {
  it('光标在 @名字 中间时能取到查询词与起始位', () => {
    const t = '跟 @张 一起';
    const q = activeMentionQuery(t, 4);
    expect(q).toEqual({ query: '张', start: 2 });
  });
  it('@ 后面已有空格则不再是查询', () => {
    expect(activeMentionQuery('跟 @张小明 吃', 9)).toBeNull();
  });
  it('句首 @ 也算', () => {
    expect(activeMentionQuery('@阿', 2)).toEqual({ query: '阿', start: 0 });
  });
  it('紧贴汉字打 @ 也能触发（v0.4.1 修复：旧规则要求 @ 前是空格/标点，用户实测选不了人）', () => {
    expect(activeMentionQuery('下午跟@张', 5)).toEqual({ query: '张', start: 3 });
    expect(activeMentionQuery('下午跟@', 4)).toEqual({ query: '', start: 3 });
  });
  it('全角 ＠ 也能触发', () => {
    expect(activeMentionQuery('下午跟＠张', 5)).toEqual({ query: '张', start: 3 });
  });
  it('邮箱样式不触发（@ 前是英文字母）', () => {
    expect(activeMentionQuery('发到 abc@张', 8)).toBeNull();
  });
  it('全角 ＠ 写进故事也能解析与汇总', () => {
    const ps = [P('张小明', '同事'), P('阿杰')];
    const segs = parseMentions('下午跟＠张小明去吃火锅', ps);
    expect(segs.find((s) => s.person)?.person?.name).toBe('张小明');
    const day = { ...emptyDay('2026-11-20', 'Asia/Shanghai'), story: '跟＠阿杰 聊了很久' };
    const rel = relatedDays(P('阿杰'), [day], []);
    expect(rel).toHaveLength(1);
  });
});

describe('自定义联系方式条目（v0.4.1）', () => {
  it('清洗：去空条目、修剪空白、无名称兜底「其他」', () => {
    expect(sanitizeContacts([
      { label: ' 微信 ', value: ' wx_1 ' },
      { label: '', value: '' },
      { label: '', value: '只有内容' },
    ])).toEqual([
      { label: '微信', value: 'wx_1' },
      { label: '其他', value: '只有内容' },
    ]);
    expect(sanitizeContacts([])).toBeUndefined();
    expect(sanitizeContacts(undefined)).toBeUndefined();
  });
  it('旧固定字段折算成条目，顺序稳定', () => {
    const p = { ...P('张三'), phone: '138', wechat: 'wx', instagram: 'ins', email: 'a@b.co', org: '某公司' };
    expect(personContacts(p)).toEqual([
      { label: '手机', value: '138' },
      { label: '微信', value: 'wx' },
      { label: 'Instagram', value: 'ins' },
      { label: '邮箱', value: 'a@b.co' },
      { label: '单位', value: '某公司' },
    ]);
  });
  it('有 contacts 时以 contacts 为准，不再读旧字段', () => {
    const p = { ...P('张三'), phone: '138', contacts: [{ label: 'QQ', value: '12345' }] };
    expect(personContacts(p)).toEqual([{ label: 'QQ', value: '12345' }]);
  });
});

describe('导出带通讯录 + 旧文件兼容', () => {
  it('带 people 的导出校验和自洽、往返通过', async () => {
    const f = await buildExport([], [], [P('张小明', '同事')]);
    expect(f.people).toHaveLength(1);
    expect(f.counts.people).toBe(1);
    const v = await validateExportFile(JSON.parse(JSON.stringify(f)));
    expect(v.errors).toEqual([]);
    expect(v.file?.people?.[0]?.name).toBe('张小明');
  });
  it('旧版（无 people）导出仍按旧口径验得过', async () => {
    const f = await buildExport([], []);
    expect(f.people).toBeUndefined();
    const v = await validateExportFile(JSON.parse(JSON.stringify(f)));
    expect(v.errors).toEqual([]);
  });
  it('people 被篡改时校验和拦截', async () => {
    const f = await buildExport([], [], [P('张小明', '同事')]);
    const raw = JSON.parse(JSON.stringify(f));
    raw.people[0].relation = '陌生人';
    const v = await validateExportFile(raw);
    expect(v.errors.join('')).toContain('校验和');
  });
  it('联系方式与纪念日字段随导出完整往返', async () => {
    const p: Person = {
      ...P('张小明', '同事'), phone: '13800000000', wechat: 'zhangxm', instagram: '@zhangxm',
      birthday: '1995-11-25', anniversaries: [{ label: '第一次一起吃饭', date: '2025-11-19' }], address: '某小区', org: '某公司',
    };
    const f = await buildExport([], [], [p]);
    const v = await validateExportFile(JSON.parse(JSON.stringify(f)));
    expect(v.errors).toEqual([]);
    expect(v.file?.people?.[0]).toMatchObject({ phone: '13800000000', wechat: 'zhangxm', birthday: '1995-11-25' });
    expect(v.file?.people?.[0]?.anniversaries).toEqual([{ label: '第一次一起吃饭', date: '2025-11-19' }]);
  });
});

describe('生日 / 纪念日临近天数', () => {
  it('按月日算下一次，跨年自动顺延', () => {
    expect(daysUntilAnnual('1995-11-25', '2026-11-21')).toBe(4);
    expect(daysUntilAnnual('2000-11-21', '2026-11-21')).toBe(0);
    expect(daysUntilAnnual('1990-01-05', '2026-11-21')).toBe(45);
    expect(daysUntilAnnual('12-31', '2026-11-21')).toBe(40);
    expect(daysUntilAnnual('乱写', '2026-11-21')).toBeNull();
  });
  it('纪念日清洗：空行与坏日期被去掉', () => {
    expect(sanitizeAnniversaries([
      { label: ' 第一次吃饭 ', date: '2025-11-19' },
      { label: '', date: '2025-01-01' },
      { label: '坏日期', date: '19/11' },
    ])).toEqual([{ label: '第一次吃饭', date: '2025-11-19' }]);
    expect(sanitizeAnniversaries([])).toBeUndefined();
  });
  it('月日展示', () => {
    expect(prettyMonthDay('1995-11-25')).toBe('11月25日');
    expect(prettyMonthDay('01-05')).toBe('1月5日');
  });
});
