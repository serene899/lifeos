/**
 * 导出 / 导入 —— 格式 lifeos-export-v1（规则 11）。
 * - JSON：完整恢复用。含 format、appVersion、exportedAt、timezone、counts、SHA-256 校验和。
 * - Markdown：人类可读备份，系统失效时人还能直接读自己的记录。
 * - 导入：先校验（格式名、校验和、字段白名单），再预览，最后才写入；覆盖模式由调用方先自动导出当前数据留底。
 * - 事实字段白名单：只有 sleepMinutes / studyMinutes / workMinutes / spendAmount（规则 8、9）。
 *   导入文件里出现白名单之外的事实字段（如 exerciseMinutes、mealCount、assetSnapshot、simPnl）一律拒绝该文件，
 *   不静默吞掉，更不写入事实层。
 */
import { canonicalize, sha256Hex } from './canonical';
import { APP_VERSION, DIM_KEYS, DIM_LABEL, FACT_KEYS, type DayRecord, type LifeEvent, type Person } from './types';
import { deviceTz, nowUtc } from './time';

export interface ExportFile {
  format: 'lifeos-export-v1';
  app: 'lifeos';
  appVersion: string;
  exportedAt: string;
  timezone: string;
  counts: { days: number; events: number; total: number; people?: number };
  checksum: { alg: 'SHA-256'; canonicalization: 'canonical-json-sorted-keys'; value: string };
  days: DayRecord[];
  events: LifeEvent[];
  /** 通讯录（v0.3.0 起，可选）：旧版导出文件没有这个字段，导入照常兼容 */
  people?: Person[];
}

const FORBIDDEN_FACT_KEYS = ['exerciseMinutes', 'mealCount', 'mealLogged', 'assetSnapshot', 'assetAmount', 'simPnl', 'simulatedPnl', 'steps', 'calories'];

export async function buildExport(days: DayRecord[], events: LifeEvent[], people: Person[] = []): Promise<ExportFile> {
  const ds = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const es = [...events].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
  const ps = [...people].sort((a, b) => (a.name < b.name ? -1 : 1));
  // 校验和口径：没有通讯录时与 v0.2.x 完全一致（旧文件照常验得过）；有通讯录时把 people 一并纳入
  const value = await sha256Hex(canonicalize(ps.length ? { days: ds, events: es, people: ps } : { days: ds, events: es }));
  return {
    format: 'lifeos-export-v1',
    app: 'lifeos',
    appVersion: APP_VERSION,
    exportedAt: nowUtc(),
    timezone: deviceTz(),
    counts: { days: ds.length, events: es.length, total: ds.length + es.length + ps.length, ...(ps.length ? { people: ps.length } : {}) },
    checksum: { alg: 'SHA-256', canonicalization: 'canonical-json-sorted-keys', value },
    days: ds,
    events: es,
    ...(ps.length ? { people: ps } : {}),
  };
}

export function exportFileName(localDate: string): string {
  return `lifeos-export-v1_${localDate}.json`;
}

export interface ImportPreview {
  days: number;
  events: number;
  people: number;
  dateFrom?: string;
  dateTo?: string;
  exportedAt?: string;
  synthetic: boolean;
}

/** 校验一份导入文件。返回错误数组（空=通过）。这是导入的第一道门，未通过绝不写入。 */
export async function validateExportFile(raw: unknown): Promise<{ errors: string[]; file?: ExportFile }> {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { errors: ['文件不是有效的 JSON 对象'] };
  const f = raw as Partial<ExportFile>;
  if (f.format !== 'lifeos-export-v1') errors.push(`格式不是 lifeos-export-v1（实际：${String(f.format ?? '缺失')}）`);
  if (!Array.isArray(f.days) || !Array.isArray(f.events)) {
    errors.push('缺少 days / events 数组');
    return { errors };
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const seenDates = new Set<string>();
  for (const d of f.days as DayRecord[]) {
    if (!dateRe.test(d.date ?? '')) { errors.push(`有一条日记录日期不合法：${String(d.date)}`); continue; }
    if (seenDates.has(d.date)) errors.push(`日期重复：${d.date}`);
    seenDates.add(d.date);
    if (!d.dims || typeof d.dims !== 'object') { errors.push(`${d.date}：缺少 dims`); continue; }
    for (const k of Object.keys(d.dims)) {
      if (!(DIM_KEYS as string[]).includes(k)) errors.push(`${d.date}：出现六维之外的维度「${k}」，拒绝导入`);
    }
    const facts = (d.facts ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(facts)) {
      if (!(FACT_KEYS as string[]).includes(k)) {
        errors.push(`${d.date}：事实字段「${k}」不在正式事实白名单内，拒绝导入`);
      }
      if (FORBIDDEN_FACT_KEYS.includes(k)) errors.push(`${d.date}：事实字段「${k}」被规格明确禁止进入事实层`);
    }
    for (const s of Object.values(d.dims)) {
      if (!s) continue;
      for (const v of [s.morning, s.evening, s.best, s.worst]) {
        if (v !== undefined && (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 5)) {
          errors.push(`${d.date}：状态值必须是 1~5 整数`);
        }
      }
    }
  }
  for (const e of f.events as LifeEvent[]) {
    if (!e.id || !dateRe.test(e.date ?? '') || typeof e.title !== 'string') errors.push('有一条事件缺少 id / 日期 / 标题');
  }
  if (f.people !== undefined) {
    if (!Array.isArray(f.people)) errors.push('people 不是数组');
    else for (const p of f.people as Person[]) {
      if (!p.id || typeof p.name !== 'string' || !p.name.trim()) errors.push('通讯录里有一条缺少 id / 名字');
    }
  }
  if (f.counts && (f.counts.days !== f.days.length || f.counts.events !== f.events.length)) {
    errors.push('counts 与实际条数不符');
  }
  if (f.counts?.people !== undefined && Array.isArray(f.people) && f.counts.people !== f.people.length) {
    errors.push('counts.people 与实际人数不符');
  }
  if (!errors.length && f.checksum?.value) {
    const ds = [...(f.days as DayRecord[])].sort((a, b) => (a.date < b.date ? -1 : 1));
    const es = [...(f.events as LifeEvent[])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1));
    const ps = [...((f.people ?? []) as Person[])].sort((a, b) => (a.name < b.name ? -1 : 1));
    const value = await sha256Hex(canonicalize(ps.length ? { days: ds, events: es, people: ps } : { days: ds, events: es }));
    if (value !== f.checksum.value) errors.push('校验和不符，文件可能被改动或损坏');
  }
  if (errors.length) return { errors };
  return { errors, file: f as ExportFile };
}

export function previewOf(file: ExportFile): ImportPreview {
  const dates = file.days.map((d) => d.date).sort();
  return {
    days: file.days.length,
    events: file.events.length,
    people: file.people?.length ?? 0,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
    exportedAt: file.exportedAt,
    synthetic: file.days.length > 0 && file.days.every((d) => d.synthetic === true),
  };
}

/** 人类可读 Markdown 导出：按日期列出六维、事实与原文故事 */
export function buildMarkdown(days: DayRecord[], events: LifeEvent[], people: Person[] = []): string {
  const ds = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  const evByDate = new Map<string, LifeEvent[]>();
  for (const e of events) {
    const arr = evByDate.get(e.date) ?? [];
    arr.push(e);
    evByDate.set(e.date, arr);
  }
  const lines: string[] = ['# 人生K线图 · 记录导出（lifeos-export-v1）', '', `导出条数：日记录 ${ds.length} 条，事件 ${events.length} 条`, ''];
  for (const d of ds) {
    lines.push(`## ${d.date}${d.backfill ? '（补记）' : ''}${d.synthetic ? '（示例数据）' : ''}`, '');
    for (const k of DIM_KEYS) {
      const s = d.dims[k];
      if (!s) continue;
      const parts: string[] = [];
      if (s.morning !== undefined) parts.push(`晨 ${s.morning}`);
      if (s.evening !== undefined) parts.push(`晚 ${s.evening}`);
      if (s.best !== undefined) parts.push(`最好 ${s.best}`);
      if (s.worst !== undefined) parts.push(`最差 ${s.worst}`);
      if (parts.length) lines.push(`- ${DIM_LABEL[k]}：${parts.join(' · ')}`);
    }
    const f = d.facts;
    const fp: string[] = [];
    if (f.sleepMinutes !== undefined) fp.push(`睡眠 ${f.sleepMinutes} 分钟`);
    if (f.studyMinutes !== undefined) fp.push(`学习 ${f.studyMinutes} 分钟`);
    if (f.workMinutes !== undefined) fp.push(`工作 ${f.workMinutes} 分钟`);
    if (f.spendAmount !== undefined) fp.push(`支出 ${f.spendAmount} 元`);
    if (fp.length) lines.push(`- 事实：${fp.join(' · ')}`);
    if (d.bestMoment) lines.push(`- 最好时刻：${d.bestMoment}`);
    if (d.worstMoment) lines.push(`- 最差时刻：${d.worstMoment}`);
    if (d.story) lines.push(`- 今日故事：${d.story}`);
    for (const e of evByDate.get(d.date) ?? []) lines.push(`- 事件：${e.title}${e.note ? ` —— ${e.note}` : ''}`);
    lines.push('');
  }
  const orphan = events.filter((e) => !ds.some((d) => d.date === e.date));
  if (orphan.length) {
    lines.push('## 只有事件、没有日记录的日期', '');
    for (const e of orphan.sort((a, b) => (a.date < b.date ? -1 : 1))) lines.push(`- ${e.date}：${e.title}${e.note ? ` —— ${e.note}` : ''}`);
  }
  if (people.length) {
    lines.push('', '## 通讯录', '');
    for (const p of [...people].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const extra: string[] = [];
      if (p.phone) extra.push(`手机 ${p.phone}`);
      if (p.wechat) extra.push(`微信 ${p.wechat}`);
      if (p.birthday) extra.push(`生日 ${p.birthday}`);
      if (p.anniversaries?.length) extra.push(p.anniversaries.map((a) => `${a.label} ${a.date}`).join('；'));
      lines.push(`- ${p.name}（${p.relation || '未填关系'}）${p.note ? `：${p.note}` : ''}${extra.length ? `｜${extra.join(' · ')}` : ''}`);
    }
  }
  return lines.join('\n');
}
