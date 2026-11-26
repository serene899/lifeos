/**
 * @ 提及解析与按人汇总。
 *
 * 故事里的人物以「@名字」纯文本保存（不引入富文本结构，导出/备份就是普通文字，人也能读）。
 * 解析时按通讯录现有人名匹配（长名优先，避免「张」误匹配「张小明」的前缀问题——
 * 实际取最长匹配）。人物改名后，旧故事里的旧名字不再匹配，这是纯文本方案的已知取舍，
 * 人物详情页会提示「按现在的名字搜不到的日子，可能是改名前的旧提及」。
 */
import type { DayRecord, LifeEvent, Person } from './types';
import { daysBetween, todayKey } from './time';

/** 清洗自定义联系方式：去掉空条目、修剪空白；有内容没名称时名称兜底「其他」；最多 20 条。 */
export function sanitizeContacts(list: { label: string; value: string }[] | undefined): { label: string; value: string }[] | undefined {
  const out = (list ?? [])
    .map((c) => ({ label: c.label.trim(), value: c.value.trim() }))
    .filter((c) => c.value)
    .map((c) => ({ label: c.label || '其他', value: c.value }))
    .slice(0, 20);
  return out.length ? out : undefined;
}

/**
 * 一个人的全部联系方式条目：优先用 v0.4.1 的自定义条目 contacts；
 * 没有时把 v0.3.1 的旧固定字段折算成条目（顺序：手机/微信/抖音/INS/WhatsApp/邮箱/单位/住址），旧数据不丢。
 */
export function personContacts(p: Person): { label: string; value: string }[] {
  if (p.contacts && p.contacts.length) return p.contacts;
  const out: { label: string; value: string }[] = [];
  if (p.phone) out.push({ label: '手机', value: p.phone });
  if (p.wechat) out.push({ label: '微信', value: p.wechat });
  if (p.douyin) out.push({ label: '抖音', value: p.douyin });
  if (p.instagram) out.push({ label: 'Instagram', value: p.instagram });
  if (p.whatsapp) out.push({ label: 'WhatsApp', value: p.whatsapp });
  if (p.email) out.push({ label: '邮箱', value: p.email });
  if (p.org) out.push({ label: '单位', value: p.org });
  if (p.address) out.push({ label: '住址', value: p.address });
  return out;
}

/** 清洗纪念日列表：去掉空行、修剪空白（纯函数，供 repo 保存前调用）。 */
export function sanitizeAnniversaries(list: { label: string; date: string; lunar?: boolean }[] | undefined): { label: string; date: string; lunar?: boolean }[] | undefined {
  const out = (list ?? [])
    .map((a) => ({ label: a.label.trim(), date: a.date.trim(), ...(a.lunar ? { lunar: true } : {}) }))
    .filter((a) => a.label && /^\d{4}-\d{2}-\d{2}$/.test(a.date));
  return out.length ? out : undefined;
}

/* ---------- 农历（v0.4.2，所有者要求）：用系统自带 Intl 中国农历换算，不引第三方历表 ---------- */

let lunarFmt: Intl.DateTimeFormat | null | undefined;
const lunarCache = new Map<string, { month: number; day: number; leap: boolean } | null>();

/** 阳历日期 → 农历 {月, 日, 是否闰月}。环境不支持中国农历时返回 null，调用方回退阳历口径。 */
export function solarToLunar(d: Date): { month: number; day: number; leap: boolean } | null {
  if (lunarFmt === undefined) {
    try { lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' }); }
    catch { lunarFmt = null; }
  }
  if (!lunarFmt) return null;
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const hit = lunarCache.get(key);
  if (hit !== undefined) return hit;
  let out: { month: number; day: number; leap: boolean } | null = null;
  try {
    const parts = lunarFmt.formatToParts(d);
    const mv = parts.find((p) => p.type === 'month')?.value ?? '';
    const month = parseInt(mv, 10);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 30) out = { month, day, leap: mv.includes('bis') };
  } catch { out = null; }
  lunarCache.set(key, out);
  return out;
}

export const LUNAR_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const LUNAR_DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function lunarDayName(day: number): string {
  if (day < 10) return `初${LUNAR_DIGITS[day]}`;
  if (day === 10) return '初十';
  if (day < 20) return `十${LUNAR_DIGITS[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${LUNAR_DIGITS[day - 20]}`;
  return '三十';
}

/** 「腊月十五」式展示 */
export function prettyLunarDay(month: number, day: number): string {
  return `${LUNAR_MONTH_NAMES[month - 1] ?? `${month}月`}${lunarDayName(day)}`;
}

function localKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 下一次「月日纪念」落在哪个阳历日期（YYYY-MM-DD）。
 * lunar=true 时 dateStr 的月/日按农历解释：逐日往后找农历月日相同的一天（闰月年份取正月那次；
 * 农历三十遇到只有廿九的小月则顺延到下一年）。lunar=false 时与旧口径一致（2/29 平年按 3/1）。
 */
export function nextAnnualDate(dateStr: string, today: string = todayKey(), lunar = false): string | null {
  const m = /(?:^\d{4}-)?(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  if (!lunar) {
    const year = Number(today.slice(0, 4));
    const cand = `${year}-${m[1]}-${m[2]}`;
    return cand >= today ? cand : `${year + 1}-${m[1]}-${m[2]}`;
  }
  const month = Number(m[1]);
  const day = Number(m[2]);
  const [ty, tm, td] = today.split('-').map(Number);
  for (let i = 0; i < 400; i++) {
    const d = new Date(ty, tm - 1, td + i, 12);
    const l = solarToLunar(d);
    if (l && !l.leap && l.month === month && l.day === day) return localKey(d);
  }
  return null;
}

/**
 * 离下一次「月日纪念」（生日/纪念日）还有多少天：0=今天。
 * 入参接受 YYYY-MM-DD 或 MM-DD；lunar=true 时月/日按农历算。
 */
export function daysUntilAnnual(dateStr: string, today: string = todayKey(), lunar = false): number | null {
  const target = nextAnnualDate(dateStr, today, lunar);
  if (!target) return null;
  const diff = daysBetween(today, target);
  return Number.isFinite(diff) ? diff : null;
}

/** 「11月25日」式展示 */
export function prettyMonthDay(dateStr: string): string {
  const m = /(?:^\d{4}-)?(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

export interface Segment {
  text: string;
  person?: Person;
}

/** 把一段文字切成普通片段与 @人物 片段（供渲染高亮）。 */
export function parseMentions(text: string, people: Person[]): Segment[] {
  if (!text) return [];
  const names = [...people].filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return [{ text }];
  const out: Segment[] = [];
  let i = 0;
  let buf = '';
  while (i < text.length) {
    if (text[i] === '@' || text[i] === '＠') {
      const hit = names.find((p) => text.startsWith(p.name, i + 1));
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        out.push({ text: `${text[i]}${hit.name}`, person: hit });
        i += 1 + hit.name.length;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) out.push({ text: buf });
  return out;
}

/** 某段文字里提到了哪些人（去重）。 */
export function mentionedPeople(text: string | undefined, people: Person[]): Person[] {
  if (!text) return [];
  const seen = new Map<string, Person>();
  for (const seg of parseMentions(text, people)) if (seg.person) seen.set(seg.person.id, seg.person);
  return [...seen.values()];
}

export interface RelatedDay {
  date: string;
  /** 命中的原文片段来源：故事 / 最好时刻 / 最差时刻 / 事件 */
  from: 'story' | 'bestMoment' | 'worstMoment' | 'event';
  text: string;
}

/** 找出所有和某个人有关的日子（故事、最好/最差时刻、事件标题与备注），按日期倒序。 */
export function relatedDays(person: Person, days: DayRecord[], events: LifeEvent[]): RelatedDay[] {
  const token = `@${person.name}`;
  const tokenFull = `＠${person.name}`;
  const out: RelatedDay[] = [];
  const hit = (s: string | undefined) => !!s && (s.includes(token) || s.includes(tokenFull));
  for (const d of days) {
    if (hit(d.story)) out.push({ date: d.date, from: 'story', text: d.story! });
    if (hit(d.bestMoment)) out.push({ date: d.date, from: 'bestMoment', text: d.bestMoment! });
    if (hit(d.worstMoment)) out.push({ date: d.date, from: 'worstMoment', text: d.worstMoment! });
  }
  for (const e of events) {
    if (hit(e.title) || hit(e.note)) out.push({ date: e.date, from: 'event', text: e.note ? `${e.title}｜${e.note}` : e.title });
  }
  return out.sort((a, b) => (a.date > b.date ? -1 : 1));
}

/**
 * 输入框里正在打的 @ 查询：光标前最近一个未完成的 @xxx（无空格），没有则返回 null。
 * 触发规则（v0.4.1 放宽）：@ 前面可以是任何字符——中文里最自然的写法是「跟@某某」，
 * 旧规则要求 @ 前必须是空格/标点，导致选人条根本不弹（用户实测踩中）。
 * 唯一不触发的情形：@ 前是英文字母/数字/._%+-，那更像邮箱地址的一部分，不打扰。
 * 全角 ＠（中文输入法常见）同样触发，插入时统一写成半角 @。
 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const at = Math.max(before.lastIndexOf('@'), before.lastIndexOf('＠'));
  if (at < 0) return null;
  const query = before.slice(at + 1);
  if (query.length > 20 || /[\s@＠，。；、！？：:]/.test(query)) return null;
  const prev = at > 0 ? before[at - 1]! : '';
  if (/[A-Za-z0-9._%+-]/.test(prev)) return null;
  return { query, start: at };
}
