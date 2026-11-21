import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deletePerson, savePerson, setAvatar } from '../lib/repo';
import { fileToAvatarDataUrl } from '../lib/avatar';
import { daysUntilAnnual, parseMentions, personContacts, prettyMonthDay, relatedDays, type RelatedDay } from '../lib/people';
import { RELATION_PRESETS, type Person } from '../lib/types';

const FROM_LABEL: Record<RelatedDay['from'], string> = {
  story: '故事',
  bestMoment: '最好时刻',
  worstMoment: '最差时刻',
  event: '事件',
};

/** 圆形头像：有照片显示照片，没有就显示名字首字（苹果通讯录同款兜底）。 */
function Avatar({ name, url, size }: { name: string; url?: string; size: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} data-testid="person-avatar" />;
  }
  return (
    <span className="rounded-full shrink-0 flex items-center justify-center font-medium select-none" style={{ width: size, height: size, background: 'rgb(var(--c-ink) / 0.12)', color: 'rgb(var(--c-ink) / 0.55)', fontSize: Math.round(size * 0.42) }} data-testid="person-avatar">
      {name.trim().charAt(0) || '?'}
    </span>
  );
}

function MentionText({ text, people }: { text: string; people: Person[] }) {
  const segs = parseMentions(text, people);
  return (
    <>
      {segs.map((s, i) => s.person
        ? <span key={i} className="font-medium text-[#007aff]">{s.text}</span>
        : <span key={i}>{s.text}</span>)}
    </>
  );
}

/**
 * 人物模块（v0.4.0 按所有者提供的苹果通讯录截图重排）：
 * 列表 = 一张分组卡逐行；详情 = 居中大名字 + 分组卡（标签小字在上、值在下）；
 * 编辑 = 顶部 ✕ / ✓ 圆形按钮 + 分组卡内无边框行输入。数据字段与逻辑不变。
 */
export default function People({ goRecord }: { goRecord: (date: string) => void }) {
  const people = useLiveQuery(() => db.people.toArray(), [], [] as Person[]);
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
  const avatarRows = useLiveQuery(() => db.avatars.toArray(), [], []);
  const avatarMap = useMemo(() => new Map((avatarRows ?? []).map((r) => [r.personId, r.dataUrl])), [avatarRows]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Person | 'new' | null>(null);
  const [msg, setMsg] = useState('');

  const sorted = useMemo(() => [...people].sort((a, b) => (a.name < b.name ? -1 : 1)), [people]);
  const visible = sorted.filter((p) => !query.trim() || p.name.includes(query.trim()) || p.relation.includes(query.trim()));
  const selected = sorted.find((p) => p.id === selectedId) ?? null;
  const relDays = useMemo(() => (selected ? relatedDays(selected, days ?? [], events ?? []) : []), [selected, days, events]);

  const onDelete = async (p: Person) => {
    if (!window.confirm(`删掉联系人「${p.name}」？已经写进故事里的 @${p.name} 文字不会被改动，只是不再算作提及。`)) return;
    await deletePerson(p.id);
    setSelectedId(null);
    setMsg(`已删除联系人「${p.name}」。`);
  };

  if (editing) {
    return <PersonForm
      initial={editing === 'new' ? undefined : editing}
      onCancel={() => setEditing(null)}
      onSaved={(p) => { setEditing(null); setSelectedId(p.id); setMsg(`已保存「${p.name}」。`); }}
    />;
  }

  if (selected) {
    // v0.4.1：联系方式改为自定义条目（旧固定字段经 personContacts 折算，展示与数据都不丢）
    const contactRows: { label: string; value: string; href?: string; hint?: string }[] = personContacts(selected).map((c) => {
      if (/手机|电话/.test(c.label) || /^\+?[\d\s\-()]{7,}$/.test(c.value)) {
        return { label: c.label, value: c.value, href: `tel:${c.value.replace(/[\s\-()]/g, '')}`, hint: '拨打 ›' };
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.value)) {
        return { label: c.label, value: c.value, href: `mailto:${c.value}`, hint: '写邮件 ›' };
      }
      return { label: c.label, value: c.value };
    });
    const dayCount = new Set(relDays.map((r) => r.date)).size;
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <button className="round-btn" onClick={() => setSelectedId(null)} aria-label="全部人物">‹</button>
          <button className="btn-ghost !rounded-full" onClick={() => setEditing(selected)} data-testid="person-edit">编辑</button>
        </div>

        <header className="text-center space-y-1 px-2">
          <div className="flex justify-center pb-1.5"><Avatar name={selected.name} url={avatarMap.get(selected.id)} size={92} /></div>
          <h1 className="text-[28px] font-bold tracking-tight">{selected.name}</h1>
          <p className="muted text-[15px]">{selected.relation || '还没写关系'}{selected.synthetic ? ' · 示例' : ''}</p>
          {selected.note && <p className="muted text-sm">{selected.note}</p>}
          <p className="muted text-[13px] pt-1">和 TA 有关的日子 {dayCount} 天 · 提及 {relDays.length} 处</p>
        </header>

        {relDays.length === 0 ? (
          <section className="card text-sm muted space-y-1">
            <p>还没有哪天的记录提到 TA。</p>
            <p>写故事时打 @{selected.name} 就能把那一天和 TA 关联起来，比如「下午跟 @{selected.name} 去吃火锅」。</p>
          </section>
        ) : (
          <section className="group">
            {relDays.map((r, i) => (
              <button key={`${r.date}-${r.from}-${i}`} className="grow w-full text-left block" onClick={() => goRecord(r.date)} data-testid="related-day">
                <p className="glabel">{r.date} · {FROM_LABEL[r.from]}</p>
                <p className="gvalue !text-[15px] leading-relaxed"><MentionText text={r.text} people={sorted} /></p>
              </button>
            ))}
          </section>
        )}

        {contactRows.length > 0 && (
          <section className="group" data-testid="contact-info">
            {contactRows.map((r, i) => {
              const inner = (
                <>
                  <p className="glabel">{r.label}</p>
                  <p className="gvalue flex items-baseline justify-between gap-3">
                    <span className="break-all">{r.value}</span>
                    {r.hint && <span className="text-[#007aff] text-sm shrink-0">{r.hint}</span>}
                  </p>
                </>
              );
              return r.href
                ? <a key={i} className="grow block" href={r.href}>{inner}</a>
                : <div key={i} className="grow">{inner}</div>;
            })}
          </section>
        )}

        {(selected.birthday || (selected.anniversaries && selected.anniversaries.length > 0)) && (
          <section className="group" data-testid="important-days">
            {selected.birthday && (() => {
              const d = daysUntilAnnual(selected.birthday);
              return (
                <div className="grow">
                  <p className="glabel">🎂 生日</p>
                  <p className="gvalue">{prettyMonthDay(selected.birthday)}{d !== null && <span className="text-[#007aff] font-medium"> · {d === 0 ? '就是今天！' : `还有 ${d} 天`}</span>}</p>
                </div>
              );
            })()}
            {(selected.anniversaries ?? []).map((a, i) => {
              const d = daysUntilAnnual(a.date);
              return (
                <div key={i} className="grow">
                  <p className="glabel">✦ {a.label}</p>
                  <p className="gvalue">{prettyMonthDay(a.date)}{d !== null && <span className="text-[#007aff] font-medium"> · {d === 0 ? '就是今天！' : `还有 ${d} 天`}</span>}</p>
                </div>
              );
            })}
          </section>
        )}

        <section className="group">
          <button className="grow w-full text-center text-[#ff3b30] text-[16px]" onClick={() => onDelete(selected)}>删除联系人</button>
        </section>
        <p className="text-xs muted px-2">提示：按现在的名字「{selected.name}」查找提及；如果改过名字，改名之前写下的旧名字提及不会出现在这里。生日和纪念日只在这里打开时显示，没有后台推送。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">人物</h1>
        <button className="round-btn" onClick={() => setEditing('new')} data-testid="add-person" aria-label="添加一个人">＋</button>
      </header>
      <p className="muted text-sm leading-relaxed -mt-2">写上「他是我的谁」。写故事时打 @ 就能提到 TA，点开一个人就能看到所有和 TA 有关的日子。人只是标记，不打分、不进六维。</p>
      {msg && <p className="text-sm text-[#007aff]">{msg}</p>}

      {sorted.length > 4 && (
        <input className="input" placeholder="搜名字或关系" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="people-search" />
      )}

      {sorted.length === 0 ? (
        <section className="card text-sm muted space-y-1">
          <p>通讯录还是空的。</p>
          <p>点右上角 ＋ 把常出现在你生活里的人加进来：家人、同事、朋友……关系随便写，「楼下咖啡店的老板」也行，生活里的关系本来就说不全。</p>
        </section>
      ) : (
        <section className="group">
          {visible.map((p) => {
            const rel = relatedDays(p, days ?? [], events ?? []);
            const dayCount = new Set(rel.map((r) => r.date)).size;
            const bday = p.birthday ? daysUntilAnnual(p.birthday) : null;
            return (
              <button key={p.id} className="grow w-full text-left block" onClick={() => setSelectedId(p.id)} data-testid={`person-${p.name}`}>
                <span className="flex items-center gap-3">
                  <Avatar name={p.name} url={avatarMap.get(p.id)} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="text-[17px] font-medium shrink-0">{p.name}</span>
                      <span className="muted text-sm truncate">{p.relation || '还没写关系'}{p.synthetic ? ' · 示例' : ''}</span>
                    </span>
                    {p.note && <span className="block text-sm muted mt-0.5 line-clamp-1">{p.note}</span>}
                  </span>
                  <span className="muted text-[13px] shrink-0">
                    {bday !== null && bday <= 30 ? `🎂 ${bday === 0 ? '今天生日' : `${bday} 天后`} · ` : ''}{dayCount > 0 ? `${dayCount} 天有关` : '还没被提到'}
                  </span>
                </span>
              </button>
            );
          })}
          {visible.length === 0 && <p className="grow text-sm muted">没有找到「{query}」。</p>}
        </section>
      )}
    </div>
  );
}

function PersonForm({ initial, onCancel, onSaved }: {
  initial?: Person;
  onCancel: () => void;
  onSaved: (p: Person) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [relation, setRelation] = useState(initial?.relation ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  // v0.4.1：联系方式改为自定义条目（名称+内容自由增删）；旧固定字段打开编辑时自动折算成条目
  const [entries, setEntries] = useState<{ label: string; value: string }[]>(() => (initial ? personContacts(initial) : []));
  const [birthday, setBirthday] = useState(initial?.birthday ?? '');
  const [annivs, setAnnivs] = useState<{ label: string; date: string }[]>(initial?.anniversaries ?? []);
  // v0.4.0：联系方式/重要日子收进折叠区，表单先只突出姓名、关系、备注；已有值时默认展开，不丢数据
  const [moreOpen, setMoreOpen] = useState<boolean>(() => !!initial && !!(
    (initial.contacts && initial.contacts.length > 0) ||
    initial.phone || initial.wechat || initial.douyin || initial.instagram || initial.whatsapp ||
    initial.email || initial.address || initial.org || initial.birthday || (initial.anniversaries && initial.anniversaries.length > 0)
  ));
  const [err, setErr] = useState('');

  // 头像（v0.4.1）：undefined=没改动，null=删除，string=新照片
  const existingAvatar = useLiveQuery(() => (initial ? db.avatars.get(initial.id) : undefined), [initial?.id]);
  const [avatarDraft, setAvatarDraft] = useState<string | null | undefined>(undefined);
  const shownAvatar = avatarDraft !== undefined ? (avatarDraft ?? undefined) : existingAvatar?.dataUrl;
  const onPickAvatar = async (f: File | undefined) => {
    if (!f) return;
    try { setAvatarDraft(await fileToAvatarDataUrl(f)); }
    catch { setErr('这张图片读不了，换一张试试。'); }
  };

  const onSave = async () => {
    if (!name.trim()) { setErr('名字不能为空。'); return; }
    // 旧固定字段不再单独传：内容已折算进 contacts 条目，savePerson 全量保存后旧字段自然清掉（数据不丢）
    const p = await savePerson({
      id: initial?.id, name, relation, note,
      contacts: entries,
      birthday, anniversaries: annivs,
    });
    if (avatarDraft !== undefined) await setAvatar(p.id, avatarDraft ?? undefined);
    onSaved(p);
  };

  const row = (label: string, value: string, set: (v: string) => void, placeholder: string, testid: string, type: string = 'text') => (
    <label className="grow block">
      <span className="glabel">{label}</span>
      <input type={type} className="input-plain" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} data-testid={testid} />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="round-btn" onClick={onCancel} aria-label="取消">✕</button>
        <span className="font-semibold">{initial ? '编辑联系人' : '添加一个人'}</span>
        <button className="round-btn !text-[#007aff] font-bold" onClick={onSave} data-testid="person-save" aria-label="保存">✓</button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Avatar name={name || '新朋友'} url={shownAvatar} size={84} />
        <div className="flex items-center gap-3">
          <label className="btn-ghost !rounded-full cursor-pointer">
            {shownAvatar ? '更换照片' : '添加照片'}
            <input type="file" accept="image/*" className="hidden" data-testid="avatar-file" onChange={(e) => { void onPickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {shownAvatar && <button type="button" className="text-[#ff3b30] text-sm" onClick={() => setAvatarDraft(null)}>删除照片</button>}
        </div>
        <p className="text-xs muted">放一张 TA 的照片，一眼就认出是谁。照片只存这台手机（会进你自己的备份）。</p>
      </div>

      <p className="muted text-sm leading-relaxed">关系用你自己的话写就行，不用套分类。下面全是选填，知道多少填多少。</p>

      <section className="group">
        {row('名字', name, setName, '比如：张三', 'person-name')}
        {row('他是我的谁（关系）', relation, setRelation, '比如：同事 / 高中同学 / 姐姐 / 楼下店主…', 'person-relation')}
        <div className="grow flex flex-wrap gap-1.5">
          {RELATION_PRESETS.map((r) => (
            <button key={r} type="button" className="chip" onClick={() => setRelation(r)}>{r}</button>
          ))}
        </div>
        {row('备注（可选）', note, setNote, '在哪认识的，随便写', 'person-note')}
      </section>

      <button type="button" className="w-full text-left text-[15px] text-[#007aff] px-1" onClick={() => setMoreOpen(!moreOpen)} data-testid="person-more-toggle">
        {moreOpen ? '▾' : '▸'} 更多信息：联系方式、生日、纪念日（选填）
      </button>

      {moreOpen && (
      <>
      <section className="group">
        {entries.map((c, i) => (
          <div key={i} className="grow flex items-center gap-2.5">
            <button type="button" aria-label="删除这一项" className="w-6 h-6 rounded-full bg-[#ff3b30] text-white shrink-0 flex items-center justify-center text-[16px] leading-none pb-0.5" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>−</button>
            <input className="input-plain !w-[84px] shrink-0 !text-[#007aff]" value={c.label} onChange={(e) => setEntries(entries.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="名称" data-testid={`contact-label-${i}`} />
            <input className="input-plain flex-1" value={c.value} onChange={(e) => setEntries(entries.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="账号 / 号码 / 地址" data-testid={`contact-value-${i}`} />
          </div>
        ))}
        <button type="button" className="grow w-full text-left text-[#007aff] text-[15px]" onClick={() => setEntries([...entries, { label: '', value: '' }])} data-testid="add-contact">＋ 添加一项（名称自己起）</button>
        <div className="grow flex flex-wrap gap-1.5 items-center">
          <span className="text-[13px] muted mr-0.5">常用：</span>
          {['手机', '微信', 'QQ', '邮箱', '抖音', 'Instagram', 'WhatsApp', 'X', '小红书'].map((l) => (
            <button key={l} type="button" className="chip" onClick={() => setEntries([...entries, { label: l, value: '' }])}>{l}</button>
          ))}
        </div>
        <p className="grow text-xs muted">联系方式想记什么就加什么、名称自己起，不用把每个平台都填一遍。手机号填了之后，详情页能点一下直接拨打。</p>
      </section>

      <section className="group">
        <label className="grow block">
          <span className="glabel">🎂 TA 的生日</span>
          <input type="date" className="input-plain" value={birthday} onChange={(e) => setBirthday(e.target.value)} data-testid="person-birthday" />
        </label>
        {annivs.map((a, i) => (
          <div key={i}>
            <label className="grow block">
              <span className="glabel">纪念日名称</span>
              <input className="input-plain" value={a.label} onChange={(e) => setAnnivs(annivs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="比如：第一次一起吃饭" />
            </label>
            <label className="grow block">
              <span className="glabel">纪念日日期</span>
              <input type="date" className="input-plain" value={a.date} onChange={(e) => setAnnivs(annivs.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            </label>
            <button type="button" className="grow w-full text-left text-[#ff3b30] text-[15px]" onClick={() => setAnnivs(annivs.filter((_, j) => j !== i))}>删除这个纪念日</button>
          </div>
        ))}
        <button type="button" className="grow w-full text-left text-[#007aff] text-[15px]" onClick={() => setAnnivs([...annivs, { label: '', date: '' }])} data-testid="add-anniversary">＋ 加一个纪念日</button>
      </section>
      <p className="text-xs muted px-2">生日和纪念日会显示「还有 X 天」（按月日每年循环）。这些都是别人的个人信息，只存这台手机，不会进给其他 App 的文件；但会进你自己导出的备份，导出时留意。</p>
      </>
      )}

      {err && <p className="text-sm text-[#ff3b30] px-1">{err}</p>}
    </div>
  );
}
