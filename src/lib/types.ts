/**
 * 人生K线图 · 数据类型
 * 规格依据：V0.3.3 终审规格（所有者 2026-11-19 下达的 12 条规则）。
 * 核心定位：记录真实人生，而不是评判人生。
 */
export const APP_VERSION = '0.3.0';
export const EXPORT_FORMAT = 'lifeos-export-v1' as const;

/** 六个维度，且只有六个。关系与生活事件不是维度，只进时间轴（规则 2、3）。 */
export type DimKey = 'finance' | 'work' | 'health' | 'learning' | 'emotion' | 'spirit';
export const DIM_KEYS: DimKey[] = ['finance', 'work', 'health', 'learning', 'emotion', 'spirit'];
export const DIM_LABEL: Record<DimKey, string> = {
  finance: '财务',
  work: '工作',
  health: '健康',
  learning: '学习',
  emotion: '情绪',
  spirit: '精神生活',
};
/** 六维边界（定义冻结草案 v1，只记本维度的事，不重复计分） */
export const DIM_HINT: Record<DimKey, string> = {
  finance: '资产变化、收入支出、财务安全感；不记工作努力本身',
  work: '时长、产出、压力、职业进展；不记由工作得到的收入金额',
  health: '睡眠、身体感受、精力；不记心情好坏本身',
  learning: '学习时长、掌握程度、阅读与技能进展；不记长期人生意义',
  emotion: '当天心情、焦虑、平静、愉悦；不记对人生方向的判断',
  spirit: '意义感、阅读影视的触动、独处与自然；不记一时的开心难过',
};

/** 主观状态值 1~5。锚点为候选规则，须经 21 天实际使用后才能确认（规则 10，保持待确认）。 */
export type Level = 1 | 2 | 3 | 4 | 5;
export const ANCHOR_CANDIDATE: Record<Level, string> = {
  1: '明显不适 / 难以正常生活',
  2: '状态较差',
  3: '正常、能维持',
  4: '状态较好',
  5: '精力充沛、明显高于平时',
};

/**
 * 某一维度某一天的主观 OHLC（规则 6）：
 * - morning = Open：当天早晨主观状态
 * - evening = Close：当天结束主观状态
 * - best = High：当天真实经历的最好状态
 * - worst = Low：当天真实经历的最差状态
 * 全部可选。缺失就是缺失，存 undefined，绝不当 0（规则 5）。
 */
export interface DimState {
  morning?: Level;
  evening?: Level;
  best?: Level;
  worst?: Level;
}

/**
 * 正式事实指标只有这四个（规则 8）。
 * 运动分钟、餐食次数、资产快照、模拟盈亏等不得进入正式事实层（规则 9），
 * 因此本类型里根本没有那些字段——它们只以参考值（refs）存在于汇入层 AutoDay。
 * 注：2026-11-19 所有者明确拍板「自动打分」：汇入的事实可按试行锚点生成自动分用于呈现
 * （见 autoscore.ts），手动分永远可覆盖自动分。此决定覆盖规则 9 中「不得进入评分」的旧口径，
 * 仅限本 App 内部呈现；三个来源 App 的导出仍只送事实、不送分。
 */
export interface DayFacts {
  sleepMinutes?: number;
  studyMinutes?: number;
  workMinutes?: number;
  spendAmount?: number;
}
export const FACT_KEYS: (keyof DayFacts)[] = ['sleepMinutes', 'studyMinutes', 'workMinutes', 'spendAmount'];
export const FACT_LABEL: Record<keyof DayFacts, string> = {
  sleepMinutes: '睡眠（分钟）',
  studyMinutes: '学习（分钟）',
  workMinutes: '工作（分钟）',
  spendAmount: '支出（元）',
};

export interface DayRecord {
  /** 本地日期 YYYY-MM-DD，同时是主键：一天一条 */
  date: string;
  dims: Partial<Record<DimKey, DimState>>;
  facts: DayFacts;
  /** 今天的故事（原文保留，不压缩成分数） */
  story?: string;
  /** 最好时刻发生了什么（对应 High，必须能点开看到文字） */
  bestMoment?: string;
  /** 最差时刻发生了什么（对应 Low） */
  worstMoment?: string;
  /** 是否为补记（创建时日期早于今天） */
  backfill?: boolean;
  /** 虚构示例数据标记，永不与真实数据混淆 */
  synthetic?: boolean;
  createdAt: string;
  updatedAt: string;
  tz: string;
}

/**
 * 通讯录人物（所有者 2026-11-21 提出）：记录生活里的人和「他是我的谁」。
 * 关系是自由文本（同学/朋友/同事/家人/自定义…），因为生活里的关系没法穷举。
 * 人物只用于在故事里 @ 提及、并按人汇总相关的日子——不是维度、不评分（规则 3 的本意）。
 */
export interface Person {
  id: string;
  /** 名字，如「王子怡」；故事里以 @名字 提及 */
  name: string;
  /** 他是我的谁：自由文本，如「同事」「高中同学」「姐姐」 */
  relation: string;
  /** 备注（可选）：在哪认识的、公司/学校等，随便写 */
  note?: string;
  synthetic?: boolean;
  createdAt: string;
  updatedAt: string;
  tz: string;
}

/** 关系快捷选项（只是输入快捷方式，永远可以自己打字写别的） */
export const RELATION_PRESETS = ['朋友', '同事', '同学', '家人', '亲戚', '店里客人', '网友'];

/** 时间轴事件：只作标记，不带维度、不带评分（规则 3） */
export interface LifeEvent {
  id: string;
  date: string;
  title: string;
  note?: string;
  synthetic?: boolean;
  createdAt: string;
  updatedAt: string;
  tz: string;
}

export function emptyDay(date: string, tz: string): DayRecord {
  const now = new Date().toISOString();
  return { date, dims: {}, facts: {}, createdAt: now, updatedAt: now, tz };
}

/**
 * 从其他 LIFEOS App（钱在哪 / 生息 / 阅迹）经 lifeos-exchange 文件汇入的一天数据。
 * 与手动 DayRecord 分开存：汇入层提供事实与参考值，自动分由 autoscore.ts 按试行锚点现算，
 * 不落库为「分数事实」；手动记录永远优先（手动分覆盖自动分）。
 */
export interface AutoDay {
  date: string;
  /** 正式事实（白名单四项中实际收到的部分） */
  facts: Partial<DayFacts>;
  /** 参考值（x- 扩展与感受层，永不冒充正式事实） */
  refs: {
    exerciseMinutes?: number;
    mealCount?: number;
    readingMinutes?: number;
    incomeAmount?: number;
    assetSnapshotCny?: number;
    sleepQuality?: Level;
    bodyState?: Level;
    energy?: Level;
    fatigue?: Level;
    cultureSessions?: number;
    cultureHasFeeling?: boolean;
    cultureHasQuote?: boolean;
    cultureFinished?: boolean;
  };
  /** 来源 App 列表（如 lifeos.shike、lifeos.money-where、lifeos.yueji） */
  sources: string[];
  updatedAt: string;
}

/** 自动分结果：分数 + 一句人话依据（依据必须展示，不做黑箱分） */
export interface AutoScore {
  score: Level;
  basis: string;
}

export function hasAnyData(d: DayRecord): boolean {
  const dims = Object.values(d.dims).some(
    (s) => s && (s.morning !== undefined || s.evening !== undefined || s.best !== undefined || s.worst !== undefined),
  );
  const facts = FACT_KEYS.some((k) => d.facts[k] !== undefined);
  return dims || facts || !!(d.story || d.bestMoment || d.worstMoment);
}
