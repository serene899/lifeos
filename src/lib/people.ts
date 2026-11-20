/**
 * @ 提及解析与按人汇总。
 *
 * 故事里的人物以「@名字」纯文本保存（不引入富文本结构，导出/备份就是普通文字，人也能读）。
 * 解析时按通讯录现有人名匹配（长名优先，避免「王子」误匹配「王子怡」的前缀问题反过来——
 * 实际取最长匹配）。人物改名后，旧故事里的旧名字不再匹配，这是纯文本方案的已知取舍，
 * 人物详情页会提示「按现在的名字搜不到的日子，可能是改名前的旧提及」。
 */
import type { DayRecord, LifeEvent, Person } from './types';

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
    if (text[i] === '@') {
      const hit = names.find((p) => text.startsWith(p.name, i + 1));
      if (hit) {
        if (buf) { out.push({ text: buf }); buf = ''; }
        out.push({ text: `@${hit.name}`, person: hit });
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
  const out: RelatedDay[] = [];
  const hit = (s: string | undefined) => !!s && s.includes(token);
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

/** 输入框里正在打的 @ 查询：光标前最近一个未完成的 @xxx（无空格），没有则返回 null。 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s，。；、！？（(])@([^\s@，。；、！？]{0,20})$/.exec(before);
  if (!m) return null;
  return { query: m[2]!, start: caret - m[2]!.length - 1 };
}
