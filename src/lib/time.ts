/** 本地日期工具：一律用设备本地时区的日历日，不用 UTC 日期冒充本地日期。 */
export function deviceTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
}
export function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function todayKey(now = new Date()): string {
  return dayKeyOf(now);
}
/** 解析 YYYY-MM-DD 为本地 Date（正午，避免 DST 边界偏移） */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}
export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKeyOf(d);
}
/** 所在周的周一 */
export function weekStart(key: string): string {
  const d = parseDay(key);
  const dow = (d.getDay() + 6) % 7; // 周一=0
  return addDays(key, -dow);
}
export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}
export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}
export function nowUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
export function prettyDay(key: string): string {
  const d = parseDay(key);
  return `${key} 周${WEEKDAY[d.getDay()]}`;
}
