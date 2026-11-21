import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deletePerson, savePerson } from '../lib/repo';
import { daysUntilAnnual, parseMentions, prettyMonthDay, relatedDays, type RelatedDay } from '../lib/people';
import { RELATION_PRESETS, type Person } from '../lib/types';

const FROM_LABEL: Record<RelatedDay['from'], string> = {
  story: '故事',
  bestMoment: '最好时刻',
  worstMoment: '最差时刻',
  event: '事件',
};

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

export default function People({ goRecord }: { goRecord: (date: string) => void }) {
  const people = useLiveQuery(() => db.people.toArray(), [], [] as Person[]);
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const events = useLiveQuery(() => db.events.toArray(), [], []);
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
    return (
      <div className="space-y-4">
        <button className="text-sm text-[#007aff]" onClick={() => setSelectedId(null)}>← 全部人物</button>
        <section className="card space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <span className="chip">{selected.relation || '还没写关系'}</span>
            {selected.synthetic && <span className="chip">示例</span>}
          </div>
          {selected.note && <p className="text-sm muted">{selected.note}</p>}
          <p className="text-sm muted">和 TA 有关的日子：{new Set(relDays.map((r) => r.date)).size} 天 · 提及 {relDays.length} 处</p>
          <div className="flex gap-2 pt-1">
            <button className="btn-ghost flex-1" onClick={() => setEditing(selected)} data-testid="person-edit">编辑</button>
            <button className="btn-ghost flex-1 text-[#ff3b30]" onClick={() => onDelete(selected)}>删除联系人</button>
          </div>
        </section>

        {(selected.phone || selected.wechat || selected.douyin || selected.instagram || selected.whatsapp || selected.email || selected.address || selected.org) && (
          <section className="card space-y-2" data-testid="contact-info">
            <h2 className="font-semibold text-[15px]">联系方式</h2>
            {selected.phone && (
              <p className="text-[15px] flex justify-between gap-3"><span className="muted">手机</span><a className="text-[#007aff] font-medium" href={`tel:${selected.phone}`}>{selected.phone} · 拨打</a></p>
            )}
            {selected.wechat && <p className="text-[15px] flex justify-between gap-3"><span className="muted">微信</span><span className="text-right break-all">{selected.wechat}</span></p>}
            {selected.douyin && <p className="text-[15px] flex justify-between gap-3"><span className="muted">抖音</span><span className="text-right break-all">{selected.douyin}</span></p>}
            {selected.instagram && <p className="text-[15px] flex justify-between gap-3"><span className="muted">Instagram</span><span className="text-right break-all">{selected.instagram}</span></p>}
            {selected.whatsapp && <p className="text-[15px] flex justify-between gap-3"><span className="muted">WhatsApp</span><span className="text-right break-all">{selected.whatsapp}</span></p>}
            {selected.email && <p className="text-[15px] flex justify-between gap-3"><span className="muted">邮箱</span><a className="text-[#007aff] text-right break-all" href={`mailto:${selected.email}`}>{selected.email}</a></p>}
            {selected.org && <p className="text-[15px] flex justify-between gap-3"><span className="muted">公司/学校</span><span className="text-right">{selected.org}</span></p>}
            {selected.address && <p className="text-[15px] flex justify-between gap-3"><span className="muted">住址</span><span className="text-right">{selected.address}</span></p>}
          </section>
        )}

        {(selected.birthday || (selected.anniversaries && selected.anniversaries.length > 0)) && (
          <section className="card space-y-2" data-testid="important-days">
            <h2 className="font-semibold text-[15px]">重要日子</h2>
            {selected.birthday && (() => {
              const d = daysUntilAnnual(selected.birthday);
              return (
                <p className="text-[15px] flex justify-between gap-3">
                  <span className="muted">🎂 生日</span>
                  <span>{prettyMonthDay(selected.birthday)}{d !== null && <span className="text-[#007aff] font-medium"> · {d === 0 ? '就是今天！' : `还有 ${d} 天`}</span>}</span>
                </p>
              );
            })()}
            {(selected.anniversaries ?? []).map((a, i) => {
              const d = daysUntilAnnual(a.date);
              return (
                <p key={i} className="text-[15px] flex justify-between gap-3">
                  <span className="muted">✦ {a.label}</span>
                  <span>{prettyMonthDay(a.date)}{d !== null && <span className="text-[#007aff] font-medium"> · {d === 0 ? '就是今天！' : `还有 ${d} 天`}</span>}</span>
                </p>
              );
            })}
            <p className="text-xs muted">临近天数按月日算，每年循环；这里只在你打开时显示，没有后台推送。</p>
          </section>
        )}
        {relDays.length === 0 ? (
          <section className="card text-sm muted space-y-1">
            <p>还没有哪天的记录提到 TA。</p>
            <p>写故事时打 @{selected.name} 就能把那一天和 TA 关联起来，比如「下午跟 @{selected.name} 去吃火锅」。</p>
          </section>
        ) : (
          <div className="space-y-2">
            {relDays.map((r, i) => (
              <button key={`${r.date}-${r.from}-${i}`} className="card w-full text-left space-y-1" onClick={() => goRecord(r.date)} data-testid="related-day">
                <p className="text-sm"><span className="font-medium">{r.date}</span> <span className="muted">· {FROM_LABEL[r.from]}</span></p>
                <p className="text-[15px] leading-relaxed"><MentionText text={r.text} people={sorted} /></p>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs muted">提示：按现在的名字「{selected.name}」查找提及；如果改过名字，改名之前写下的旧名字提及不会出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">人物</h1>
        <p className="muted text-[15px] mt-1 leading-relaxed">把生活里的人记下来，写上「他是我的谁」。写故事时打 @ 就能提到 TA，之后点开一个人，就能看到所有和 TA 有关的日子。人只是标记，不打分、不进六维。</p>
      </header>

      <button className="btn-primary w-full" onClick={() => setEditing('new')} data-testid="add-person">＋ 添加一个人</button>
      {msg && <p className="text-sm text-[#007aff]">{msg}</p>}

      {sorted.length > 4 && (
        <input className="input" placeholder="搜名字或关系" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="people-search" />
      )}

      {sorted.length === 0 ? (
        <section className="card text-sm muted space-y-1">
          <p>通讯录还是空的。</p>
          <p>先把常出现在你生活里的人加进来：家人、同事、朋友……关系随便写，「楼下咖啡店的老板」也行，生活里的关系本来就说不全。</p>
        </section>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => {
            const rel = relatedDays(p, days ?? [], events ?? []);
            const dayCount = new Set(rel.map((r) => r.date)).size;
            const bday = p.birthday ? daysUntilAnnual(p.birthday) : null;
            return (
              <button key={p.id} className="card w-full text-left" onClick={() => setSelectedId(p.id)} data-testid={`person-${p.name}`}>
                <span className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[17px] font-semibold">{p.name}</span>
                  <span className="chip">{p.relation || '还没写关系'}</span>
                  {p.synthetic && <span className="chip">示例</span>}
                  {bday !== null && bday <= 30 && <span className="chip">🎂 {bday === 0 ? '今天生日' : `${bday} 天后生日`}</span>}
                  <span className="muted text-sm ml-auto">{dayCount > 0 ? `${dayCount} 天有关` : '还没被提到'}</span>
                </span>
                {p.note && <span className="block text-sm muted mt-1">{p.note}</span>}
              </button>
            );
          })}
          {visible.length === 0 && <p className="text-sm muted">没有找到「{query}」。</p>}
        </div>
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
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [wechat, setWechat] = useState(initial?.wechat ?? '');
  const [douyin, setDouyin] = useState(initial?.douyin ?? '');
  const [instagram, setInstagram] = useState(initial?.instagram ?? '');
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [birthday, setBirthday] = useState(initial?.birthday ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [org, setOrg] = useState(initial?.org ?? '');
  const [annivs, setAnnivs] = useState<{ label: string; date: string }[]>(initial?.anniversaries ?? []);
  const [err, setErr] = useState('');

  const onSave = async () => {
    if (!name.trim()) { setErr('名字不能为空。'); return; }
    const p = await savePerson({
      id: initial?.id, name, relation, note,
      phone, wechat, douyin, instagram, whatsapp, email,
      birthday, anniversaries: annivs, address, org,
    });
    onSaved(p);
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, testid: string, type: string = 'text') => (
    <label className="block">
      <span className="text-sm muted">{label}</span>
      <input type={type} className="input mt-1" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} data-testid={testid} />
    </label>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[28px] font-bold">{initial ? '编辑联系人' : '添加一个人'}</h1>
        <p className="muted text-[15px] mt-1">关系用你自己的话写就行，不用套分类。下面全是选填，知道多少填多少。</p>
      </header>
      <section className="card space-y-3">
        {field('名字', name, setName, '比如：张三', 'person-name')}
        {field('他是我的谁（关系）', relation, setRelation, '比如：同事 / 高中同学 / 姐姐 / 楼下店主…', 'person-relation')}
        <div className="flex flex-wrap gap-1.5">
          {RELATION_PRESETS.map((r) => (
            <button key={r} type="button" className="chip" onClick={() => setRelation(r)}>{r}</button>
          ))}
        </div>
        {field('备注（可选）', note, setNote, '在哪认识的，随便写', 'person-note')}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-[15px]">联系方式（选填）</h2>
        {field('手机号', phone, setPhone, '填了之后详情页能点一下直接拨打', 'person-phone', 'tel')}
        {field('微信号', wechat, setWechat, '微信号 / 手机号', 'person-wechat')}
        {field('抖音号', douyin, setDouyin, '抖音号', 'person-douyin')}
        {field('Instagram', instagram, setInstagram, '@用户名', 'person-instagram')}
        {field('WhatsApp', whatsapp, setWhatsapp, '号码（含国家码）', 'person-whatsapp')}
        {field('邮箱', email, setEmail, '邮箱地址', 'person-email', 'email')}
        {field('公司 / 学校', org, setOrg, '在哪上班 / 上学', 'person-org')}
        {field('住址', address, setAddress, '大概到小区就行，不用精确门牌', 'person-address')}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold text-[15px]">重要日子（选填）</h2>
        <label className="block">
          <span className="text-sm muted">🎂 TA 的生日</span>
          <input type="date" className="input mt-1" value={birthday} onChange={(e) => setBirthday(e.target.value)} data-testid="person-birthday" />
        </label>
        {annivs.map((a, i) => (
          <div key={i} className="flex gap-2 items-end">
            <label className="block flex-1">
              <span className="text-sm muted">纪念日名称</span>
              <input className="input mt-1" value={a.label} onChange={(e) => setAnnivs(annivs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="比如：第一次一起吃饭" />
            </label>
            <label className="block w-[150px]">
              <span className="text-sm muted">日期</span>
              <input type="date" className="input mt-1" value={a.date} onChange={(e) => setAnnivs(annivs.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
            </label>
            <button type="button" className="btn-ghost !px-3 text-[#ff3b30]" onClick={() => setAnnivs(annivs.filter((_, j) => j !== i))}>删</button>
          </div>
        ))}
        <button type="button" className="text-[#007aff] text-[15px]" onClick={() => setAnnivs([...annivs, { label: '', date: '' }])} data-testid="add-anniversary">＋ 加一个纪念日</button>
        <p className="text-xs muted">生日和纪念日会显示「还有 X 天」（按月日每年循环）。这些都是别人的个人信息，只存这台手机，不会进给其他 App 的文件；但会进你自己导出的备份，导出时留意。</p>
      </section>

      {err && <p className="text-sm text-[#ff3b30]">{err}</p>}
      <div className="flex gap-2 pb-2">
        <button className="btn-primary flex-1" onClick={onSave} data-testid="person-save">保存</button>
        <button className="btn-ghost flex-1" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
