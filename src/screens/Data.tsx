import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { APP_VERSION, EXPORT_FORMAT, hasAnyData } from '../lib/types';
import { allDays, allEvents, allPeople, applyImport, clearAll, clearAutoDays, mergeAutoDays, setMeta } from '../lib/repo';
import { buildExport, buildMarkdown, exportFileName, previewOf, validateExportFile, type ExportFile, type ImportPreview } from '../lib/exporter';
import { parseExchange, type ExchangePreview } from '../lib/exchange';
import { sampleData } from '../lib/sample';
import { todayKey } from '../lib/time';

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const SOURCE_LABEL: Record<string, string> = {
  'lifeos.shike': '生息',
  'lifeos.money-where': '钱在哪',
  'lifeos.yueji': '阅迹',
};

export default function Data({ goRecord }: { goRecord: (date: string) => void }) {
  const days = useLiveQuery(() => db.days.toArray(), [], []);
  const autoDays = useLiveQuery(() => db.autoDays.toArray(), [], []);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<{ file: ExportFile; preview: ImportPreview } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [exPending, setExPending] = useState<ExchangePreview | null>(null);
  const [exError, setExError] = useState('');
  const exFileRef = useRef<HTMLInputElement>(null);

  const onPickExchange = async (file: File) => {
    setExError('');
    setExPending(null);
    try {
      setExPending(parseExchange(await file.text()));
    } catch (e) {
      setExError(e instanceof Error ? e.message : '文件解析失败');
    }
  };
  const doExchangeImport = async () => {
    if (!exPending) return;
    await mergeAutoDays(exPending.days);
    setMsg(`已收下 ${SOURCE_LABEL[exPending.sourceApp] ?? exPending.sourceApp} 的数据：${exPending.days.length} 天（${exPending.dateFrom ?? ''} ~ ${exPending.dateTo ?? ''}）。到 K线 页能看到自动分（橙色菱形）。`);
    setExPending(null);
  };
  const onClearAuto = async () => {
    if (!window.confirm('清除全部汇入数据？手动记录不会动。之后重新从其他 App 导出再导入即可恢复。')) return;
    await clearAutoDays();
    setMsg('汇入数据已清除，手动记录未动。');
  };

  const sortedDays = [...(days ?? [])].sort((a, b) => (a.date > b.date ? -1 : 1));

  const onExportJson = async () => {
    const f = await buildExport(await allDays(), await allEvents(), await allPeople());
    download(exportFileName(todayKey()), JSON.stringify(f, null, 2), 'application/json');
    await setMeta('lastExportAt', new Date().toISOString());
    setMsg(`已导出 ${f.counts.total} 条（格式 ${EXPORT_FORMAT}，含校验和）。请把文件存到你自己掌控的位置，如 iCloud 文件。`);
  };
  const onExportMd = async () => {
    const md = buildMarkdown(await allDays(), await allEvents(), await allPeople());
    download(`lifeos-export-v1_${todayKey()}.md`, md, 'text/markdown');
    setMsg('已导出可读版 Markdown。即使将来系统失效，这份文件人也能直接读。');
  };
  const onPickFile = async (file: File) => {
    setImportErrors([]);
    setPending(null);
    try {
      const raw = JSON.parse(await file.text());
      const { errors, file: valid } = await validateExportFile(raw);
      if (errors.length || !valid) { setImportErrors(errors.length ? errors : ['文件校验未通过']); return; }
      setPending({ file: valid, preview: previewOf(valid) });
    } catch {
      setImportErrors(['文件不是有效的 JSON']);
    }
  };
  const doImport = async (mode: 'merge' | 'overwrite') => {
    if (!pending) return;
    if (mode === 'overwrite') {
      // 覆盖前自动导出当前数据留底，避免误操作无可挽回
      const cur = await buildExport(await allDays(), await allEvents(), await allPeople());
      if (cur.counts.total > 0) download(`lifeos-覆盖前自动备份_${todayKey()}.json`, JSON.stringify(cur, null, 2), 'application/json');
      if (!window.confirm('将先下载一份当前数据的自动备份，然后清空并恢复为导入文件的内容。继续？')) return;
    }
    await applyImport(pending.file, mode);
    setPending(null);
    setMsg(mode === 'merge' ? '合并导入完成。' : '覆盖恢复完成。');
  };
  const onSample = async () => {
    const s = sampleData();
    await db.days.bulkPut(s.days);
    await db.events.bulkPut(s.events);
    await db.people.bulkPut(s.people);
    setMsg('已载入虚构示例数据（全部带「示例」标记）。到 K线 页把健康、情绪维度切到日K能看到蜡烛、点和留空的区别；「人物」页能看到示例联系人和 @ 提及。');
  };
  const onClearSynthetic = async () => {
    const ds = (await allDays()).filter((d) => d.synthetic);
    const es = (await allEvents()).filter((e) => e.synthetic);
    const ps = (await allPeople()).filter((p) => p.synthetic);
    await db.days.bulkDelete(ds.map((d) => d.date));
    await db.events.bulkDelete(es.map((e) => e.id));
    await db.people.bulkDelete(ps.map((p) => p.id));
    setMsg(`已清除示例数据 ${ds.length + es.length + ps.length} 条，真实数据未动。`);
  };
  const onClearAll = async () => {
    if (!window.confirm('清空全部数据？强烈建议先导出备份。此操作不可恢复。')) return;
    if (!window.confirm('再次确认：真的要清空全部日记录和事件吗？')) return;
    await clearAll();
    setMsg('全部数据已清空。');
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[26px] font-bold">数据</h1>
        <p className="muted text-sm mt-1">数据只存在这台设备的浏览器本地（IndexedDB），没有服务器。导出备份是你自己的责任，也是唯一的恢复手段。</p>
      </header>

      <section className="card space-y-2.5" data-testid="exchange-inbox">
        <h2 className="font-semibold">收数据 · 从其他 App 汇入</h2>
        <p className="text-sm muted">在生息、钱在哪、阅迹里点「发到人生K线图 / 导出给人生K线图」生成交换文件，存到「文件」App 后，回到这里选进来。数据会按日期自动落位，并按试行标准算出自动分（健康、财务、学习、精神生活）；你手动记的分永远优先。</p>
        <input ref={exFileRef} type="file" accept="application/json,.json" className="hidden" data-testid="exchange-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickExchange(f); e.target.value = ''; }} />
        <button className="btn-primary w-full" onClick={() => exFileRef.current?.click()} data-testid="exchange-pick">选择交换文件…</button>
        {exError && <p className="text-sm text-[#ff3b30]" data-testid="exchange-error">{exError}</p>}
        {exPending && (
          <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.06] p-3 text-sm space-y-2" data-testid="exchange-preview">
            <p>来自「{SOURCE_LABEL[exPending.sourceApp] ?? exPending.sourceApp}」：共 {exPending.recordCount} 条记录，汇成 {exPending.days.length} 天
              {exPending.dateFrom ? `（${exPending.dateFrom} ~ ${exPending.dateTo}）` : ''}
              {exPending.skipped ? `；${exPending.skipped} 条暂不支持，已跳过` : ''}。</p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={doExchangeImport} data-testid="exchange-apply">收下这些数据</button>
              <button className="btn-ghost" onClick={() => setExPending(null)}>取消</button>
            </div>
          </div>
        )}
        <p className="text-sm muted">已汇入 {(autoDays ?? []).length} 天的数据{(autoDays ?? []).length > 0 && (
          <> · <button className="underline" onClick={onClearAuto}>清除汇入数据</button></>
        )}</p>
      </section>

      <section className="card space-y-2.5">
        <h2 className="font-semibold">导出与恢复</h2>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={onExportJson} data-testid="export-json">导出 JSON（{EXPORT_FORMAT}）</button>
          <button className="btn-ghost" onClick={onExportMd} data-testid="export-md">导出可读版</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="import-file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.target.value = ''; }} />
        <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>导入备份文件…</button>
        {importErrors.length > 0 && (
          <div className="text-sm text-[#ff3b30] space-y-1" data-testid="import-errors">
            <p className="font-medium">这个文件没有导入，原因：</p>
            {importErrors.slice(0, 6).map((e) => <p key={e}>· {e}</p>)}
          </div>
        )}
        {pending && (
          <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.06] p-3 text-sm space-y-2" data-testid="import-preview">
            <p>预览：日记录 {pending.preview.days} 条，事件 {pending.preview.events} 条{pending.preview.people ? `，联系人 ${pending.preview.people} 位` : ''}
              {pending.preview.dateFrom ? `，范围 ${pending.preview.dateFrom} ~ ${pending.preview.dateTo}` : ''}
              {pending.preview.exportedAt ? `，导出于 ${pending.preview.exportedAt.slice(0, 10)}` : ''}。校验和已通过。</p>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={() => doImport('merge')} data-testid="import-merge">合并导入</button>
              <button className="btn-ghost btn-danger" onClick={() => doImport('overwrite')} data-testid="import-overwrite">覆盖恢复</button>
              <button className="btn-ghost" onClick={() => setPending(null)}>取消</button>
            </div>
          </div>
        )}
        {msg && <p className="text-sm text-[#007aff]" data-testid="data-msg">{msg}</p>}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">历史记录（{sortedDays.length} 天）</h2>
        <div className="space-y-1.5" data-testid="history-list">
          {sortedDays.length === 0 && <p className="muted text-sm">还没有日记录。</p>}
          {sortedDays.map((d) => (
            <button key={d.date} className="w-full text-left text-sm flex justify-between gap-2 py-1.5 border-b border-black/5 dark:border-white/10 last:border-0" onClick={() => goRecord(d.date)}>
              <span className="font-medium shrink-0">{d.date}{d.backfill ? ' · 补记' : ''}{d.synthetic ? ' · 示例' : ''}</span>
              <span className="muted truncate">{hasAnyData(d) ? (d.story ?? '（无故事文字）') : '（空）'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-2.5 text-sm">
        <h2 className="font-semibold text-base">示例与清空</h2>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onSample} data-testid="load-sample">载入示例数据</button>
          <button className="btn-ghost flex-1" onClick={onClearSynthetic}>清除示例数据</button>
        </div>
        <button className="btn-ghost btn-danger w-full" onClick={onClearAll}>清空全部数据</button>
      </section>

      <section className="card text-sm space-y-2 muted">
        <h2 className="font-semibold text-base text-[rgb(var(--c-ink))]">存储与规则说明</h2>
        <p>· 存储：IndexedDB（数据库名 lifeos-kline），按日期存日记录、按 id 存事件；已请求浏览器持久化存储，但 Safari 在空间不足等情况下仍可能清除网站数据，所以请每月导出一次。</p>
        <p>· 备份：JSON（{EXPORT_FORMAT}，含条数与 SHA-256 校验和）用于完整恢复；Markdown 用于人工阅读。恢复流程为校验 → 预览 → 合并或覆盖，覆盖前自动下载当前数据备份。</p>
        <p>· 规则：六维不合成总分；缺失留空不当 0；四值不全不画蜡烛；正式事实只有睡眠、学习、工作分钟与支出四项。</p>
        <p>· 自动分（2026-11-19 所有者拍板）：健康、财务、学习、精神生活四维可由汇入事实按试行锚点自动打分，图上以橙色菱形 + 依据标明；工作、情绪无数据来源，只能手动；手动分永远覆盖自动分。试行锚点用满 21 天后复核。</p>
        <p>· 待确认（保持待确认，不定稿）：① 1~5 评分锚点，须实际使用 21 天后确认；② V0.3.3 中另一项待确认规则，本版不擅自定稿，相关位置均按最保守口径实现。</p>
        <p>· 版本：App v{APP_VERSION} · 规格 V0.3.3 · 导出格式 {EXPORT_FORMAT}</p>
      </section>
    </div>
  );
}
