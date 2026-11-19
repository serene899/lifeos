/**
 * 自动打分引擎（所有者 2026-11-19 拍板：能自动的自动打分，工作/情绪手点，手动可覆盖）。
 *
 * 原则：
 * - 只对有数据来源的四个维度出分：健康（生息）、财务（钱在哪）、学习与精神生活（阅迹）。
 *   工作、情绪没有任何 App 在记，机器变不出来，永远不出自动分。
 * - 每个自动分都带一句人话依据（basis），界面必须展示，不做黑箱分。
 * - 锚点是「试行标准」，图上标注「自动分 · 试行」；用满 21 天后与所有者一起复核调整
 *   （接续 V0.3.3 规则 10 的 21 天确认机制，形式从「确认主观锚点」变为「复核自动锚点」）。
 * - 自动分只用于呈现（K线点位 / 总览），不写回手动 DayRecord；手动分存在时永远以手动为准。
 */
import type { AutoDay, AutoScore, DimKey, Level } from './types';

const clamp = (n: number): Level => Math.min(5, Math.max(1, Math.round(n))) as Level;
export const fmtMinutes = (m: number): string =>
  m >= 60 ? `${Math.floor(m / 60)}小时${m % 60 ? `${Math.round(m % 60)}分` : ''}` : `${Math.round(m)}分钟`;

/** 试行锚点：睡眠时长（分钟）→ 分 */
export const SLEEP_BANDS: [number, Level][] = [[480, 5], [420, 4], [360, 3], [300, 2], [0, 1]];
/** 试行锚点：学习/阅读时长（分钟）→ 分 */
export const STUDY_BANDS: [number, Level][] = [[90, 5], [60, 4], [30, 3], [10, 2], [1, 1]];

function band(bands: [number, Level][], v: number): Level {
  for (const [min, s] of bands) if (v >= min) return s;
  return 1;
}

export function scoreHealth(a: AutoDay): AutoScore | undefined {
  const sleep = a.facts.sleepMinutes;
  const q = a.refs.sleepQuality;
  if (sleep !== undefined && sleep > 0) {
    const base = band(SLEEP_BANDS, sleep);
    if (q !== undefined) {
      return { score: clamp((base + q) / 2), basis: `睡眠 ${fmtMinutes(sleep)}，睡眠质量自评 ${q} 分` };
    }
    return { score: base, basis: `睡眠 ${fmtMinutes(sleep)}` };
  }
  if (q !== undefined) return { score: q, basis: `睡眠质量自评 ${q} 分（无睡眠时长数据）` };
  if (a.refs.bodyState !== undefined) return { score: a.refs.bodyState, basis: `生息身体感受自评 ${a.refs.bodyState} 分` };
  return undefined;
}

export function scoreFinance(a: AutoDay, prevAssetCny: number | undefined): AutoScore | undefined {
  const cur = a.refs.assetSnapshotCny;
  if (cur !== undefined && prevAssetCny !== undefined && prevAssetCny > 0) {
    const pct = ((cur - prevAssetCny) / prevAssetCny) * 100;
    const score: Level = pct >= 1 ? 5 : pct >= 0.2 ? 4 : pct > -0.2 ? 3 : pct > -1 ? 2 : 1;
    return { score, basis: `总资产较昨日 ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` };
  }
  return undefined; // 只有支出、没有资产变化时不硬判：支出多不等于财务差
}

export function scoreLearning(a: AutoDay): AutoScore | undefined {
  const m = a.facts.studyMinutes ?? a.refs.readingMinutes;
  if (m === undefined || m <= 0) return undefined;
  const fromReading = a.facts.studyMinutes === undefined;
  return { score: band(STUDY_BANDS, m), basis: `${fromReading ? '阅读' : '学习'} ${fmtMinutes(m)}` };
}

export function scoreSpirit(a: AutoDay): AutoScore | undefined {
  if (a.refs.cultureFinished) return { score: 5, basis: '读完 / 看完了一部作品' };
  if (a.refs.cultureHasFeeling || a.refs.cultureHasQuote) {
    return { score: 4, basis: a.refs.cultureHasFeeling ? '阅读/观影并写了感受' : '阅读/观影并留了摘句' };
  }
  if ((a.refs.cultureSessions ?? 0) > 0) return { score: 3, basis: '有阅读 / 观影记录' };
  return undefined;
}

/**
 * 给一整段日期算自动分。财务分需要「昨日总资产」，故按日期顺序整体计算。
 * 返回 Map<date, Partial<Record<DimKey, AutoScore>>>；work / emotion 永远不在其中。
 */
export function computeAutoScores(autoDays: AutoDay[]): Map<string, Partial<Record<DimKey, AutoScore>>> {
  const sorted = [...autoDays].sort((x, y) => (x.date < y.date ? -1 : 1));
  const out = new Map<string, Partial<Record<DimKey, AutoScore>>>();
  let prevAsset: number | undefined;
  for (const a of sorted) {
    const scores: Partial<Record<DimKey, AutoScore>> = {};
    const h = scoreHealth(a); if (h) scores.health = h;
    const f = scoreFinance(a, prevAsset); if (f) scores.finance = f;
    const l = scoreLearning(a); if (l) scores.learning = l;
    const s = scoreSpirit(a); if (s) scores.spirit = s;
    if (Object.keys(scores).length) out.set(a.date, scores);
    if (a.refs.assetSnapshotCny !== undefined) prevAsset = a.refs.assetSnapshotCny;
  }
  return out;
}
