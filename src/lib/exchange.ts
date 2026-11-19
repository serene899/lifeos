/**
 * lifeos-exchange 交换文件解析（协议草案 v0.1.2，钱在哪 / 生息 / 阅迹三方共用）。
 *
 * 只做结构校验与按日聚合，不校验 contentHash / 文件校验和：
 * 交换文件的完整性由来源 App 在导出时保证；本 App 收到后按「事实汇入」处理，
 * 汇入层与手动记录分开存（AutoDay），随时可整层清除，不污染手动数据。
 *
 * 聚合口径：
 * - 本地日期优先取 data.attributes.localDate，否则按 occurredAt + tz 换算。
 * - op='void' 的记录在本文件内抵消同 sourceRecordId 的 write。
 * - sleepMinutes / studyMinutes 同日多条取 sourceUpdatedAt 最新的一条（睡眠一晚一条，不累加防重复计）。
 * - spendAmount / x-income-amount / x-exercise-minutes / x-meal-logged / x-reading-minutes 同日累加。
 * - x-asset-snapshot-amount 只取 CNY 的一条作为当日总资产参考（多币种不混加）。
 * - 感受层（layer='feeling'，来自生息的 1~5 数值感受与阅迹）按 aspect 落 refs，同日取最新。
 */
import type { AutoDay, Level } from './types';
import { nowUtc } from './time';

const isDateKey = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export interface ExchangePreview {
  sourceApp: string;
  protocolVersion?: string;
  exportedAt?: string;
  recordCount: number;
  days: AutoDay[];
  dateFrom?: string;
  dateTo?: string;
  skipped: number;
}

interface RawRecord {
  sourceApp?: string;
  sourceRecordId?: string;
  sourceUpdatedAt?: string;
  op?: string;
  occurredAt?: string;
  tz?: string;
  layer?: string;
  data?: {
    metricKey?: string;
    value?: number;
    currency?: string;
    aspect?: string;
    attributes?: Record<string, unknown>;
  };
}

function localDateOf(occurredAt: string, tz: string | undefined): string | undefined {
  const t = Date.parse(occurredAt);
  if (Number.isNaN(t)) return undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(t));
    const g = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const key = `${g('year')}-${g('month')}-${g('day')}`;
    return isDateKey(key) ? key : undefined;
  } catch {
    return undefined;
  }
}

const asLevel = (v: unknown): Level | undefined =>
  typeof v === 'number' && v >= 1 && v <= 5 ? (Math.round(v) as Level) : undefined;

export function parseExchange(text: string): ExchangePreview {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error('文件不是合法 JSON');
  }
  const file = root as { manifest?: Record<string, unknown>; records?: RawRecord[] };
  if (!file || typeof file !== 'object' || !file.manifest || file.manifest.format !== 'lifeos-exchange') {
    throw new Error('这不是 LIFEOS 交换文件（需要钱在哪 / 生息 / 阅迹导出的 lifeos-exchange 文件，不是备份文件）');
  }
  if (!Array.isArray(file.records)) throw new Error('交换文件缺少 records');
  const sourceApp = String(file.manifest.sourceApp ?? 'unknown');

  const voidIds = new Set<string>();
  for (const r of file.records) if (r.op === 'void' && r.sourceRecordId) voidIds.add(r.sourceRecordId);

  const byDate = new Map<string, AutoDay>();
  const sleepStamp = new Map<string, string>();
  const studyStamp = new Map<string, string>();
  const feelingStamp = new Map<string, string>();
  let skipped = 0;

  const day = (date: string): AutoDay => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, facts: {}, refs: {}, sources: [sourceApp], updatedAt: nowUtc() };
      byDate.set(date, d);
    }
    return d;
  };

  for (const r of file.records) {
    if (r.op !== 'write' || !r.data) continue;
    if (r.sourceRecordId && voidIds.has(r.sourceRecordId)) continue;
    const attrs = (r.data.attributes ?? {}) as Record<string, unknown>;
    const localDate = typeof attrs.localDate === 'string' && isDateKey(attrs.localDate)
      ? attrs.localDate
      : r.occurredAt ? localDateOf(r.occurredAt, r.tz) : undefined;
    if (!localDate) { skipped++; continue; }
    const d = day(localDate);
    const v = r.data.value;
    const stamp = r.sourceUpdatedAt ?? '';

    if (r.layer === 'feeling') {
      const lv = asLevel(v);
      if (lv === undefined) { skipped++; continue; }
      const key = `${localDate}:${r.data.aspect}`;
      if (stamp < (feelingStamp.get(key) ?? '')) continue;
      feelingStamp.set(key, stamp);
      if (r.data.aspect === 'sleepQuality') d.refs.sleepQuality = lv;
      else if (r.data.aspect === 'bodyState') d.refs.bodyState = lv;
      else if (r.data.aspect === 'energy') d.refs.energy = lv;
      else if (r.data.aspect === 'fatigue') d.refs.fatigue = lv;
      continue;
    }

    switch (r.data.metricKey) {
      case 'sleepMinutes':
        if (typeof v !== 'number') { skipped++; break; }
        if (stamp < (sleepStamp.get(localDate) ?? '')) break;
        sleepStamp.set(localDate, stamp);
        d.facts.sleepMinutes = v;
        break;
      case 'studyMinutes':
        if (typeof v !== 'number') { skipped++; break; }
        if (stamp < (studyStamp.get(localDate) ?? '')) break;
        studyStamp.set(localDate, stamp);
        d.facts.studyMinutes = v;
        break;
      case 'spendAmount':
        if (typeof v !== 'number' || (r.data.currency && r.data.currency !== 'CNY')) { skipped++; break; }
        d.facts.spendAmount = (d.facts.spendAmount ?? 0) + v;
        break;
      case 'x-income-amount':
        if (typeof v !== 'number') { skipped++; break; }
        d.refs.incomeAmount = (d.refs.incomeAmount ?? 0) + v;
        break;
      case 'x-asset-snapshot-amount':
        if (typeof v !== 'number' || r.data.currency !== 'CNY') break;
        d.refs.assetSnapshotCny = v;
        break;
      case 'x-exercise-minutes':
        if (typeof v === 'number') d.refs.exerciseMinutes = (d.refs.exerciseMinutes ?? 0) + v;
        break;
      case 'x-meal-logged':
        if (typeof v === 'number') d.refs.mealCount = (d.refs.mealCount ?? 0) + v;
        break;
      case 'x-reading-minutes':
        if (typeof v === 'number') d.refs.readingMinutes = (d.refs.readingMinutes ?? 0) + v;
        break;
      case 'x-culture-activity':
        if (typeof v === 'number') {
          d.refs.cultureSessions = (d.refs.cultureSessions ?? 0) + v;
          if (attrs.hasFeeling === true) d.refs.cultureHasFeeling = true;
          if (attrs.hasQuote === true) d.refs.cultureHasQuote = true;
          if (attrs.finished === true) d.refs.cultureFinished = true;
        }
        break;
      default:
        // 未知 metricKey：不落库，计数为跳过（协议扩展时在此登记）
        skipped++;
    }
  }

  const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    sourceApp,
    protocolVersion: typeof file.manifest.protocolVersion === 'string' ? file.manifest.protocolVersion : undefined,
    exportedAt: typeof file.manifest.exportedAt === 'string' ? file.manifest.exportedAt : undefined,
    recordCount: file.records.length,
    days,
    dateFrom: days[0]?.date,
    dateTo: days[days.length - 1]?.date,
    skipped,
  };
}
