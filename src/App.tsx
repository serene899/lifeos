import { useState } from 'react';
import Home from './screens/Home';
import Record from './screens/Record';
import Data from './screens/Data';
import People from './screens/People';
import { todayKey } from './lib/time';

type Tab = 'home' | 'people';
type Overlay = { type: 'record'; date: string } | { type: 'settings' } | null;

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '⌂' },
  { key: 'people', label: '人物', icon: '人' },
];

/**
 * v0.4.0 产品结构（所有者改版指令）：底部只保留两个一级入口——首页（人生K线图）与人物。
 * 记录是首页的辅助操作（二级页，保存后回首页）；数据管理收进首页右上角的设置入口（二级页）。
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [recordDate, setRecordDate] = useState<string>(todayKey());

  const goRecord = (date: string) => {
    setRecordDate(date);
    setOverlay({ type: 'record', date });
  };
  const closeOverlay = () => setOverlay(null);

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 pt-5 pb-6">
        {overlay?.type === 'record' ? (
          <Record key={recordDate} date={recordDate} onDateChange={setRecordDate} onBack={closeOverlay} />
        ) : overlay?.type === 'settings' ? (
          <Data goRecord={goRecord} onBack={closeOverlay} />
        ) : tab === 'home' ? (
          <Home goRecord={goRecord} openSettings={() => setOverlay({ type: 'settings' })} />
        ) : (
          <People goRecord={goRecord} />
        )}
      </main>

      {!overlay && (
        <nav className="sticky bottom-0 safe-bottom border-t border-black/5 dark:border-white/10 bg-[rgb(var(--c-card))]/85 backdrop-blur-xl">
          <div className="relative max-w-[560px] mx-auto grid grid-cols-2">
            <span aria-hidden="true" className="nav-pill" style={{ transform: tab === 'people' ? 'translateX(calc(100% + 8px))' : 'translateX(0)' }} />
            {TABS.map((t) => (
              <button
                key={t.key}
                data-testid={`tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`relative py-2 flex flex-col items-center gap-0.5 text-[11px] ${tab === t.key ? 'text-[#007aff] font-medium' : 'text-[rgb(var(--c-ink))]/50'}`}
              >
                <span className="text-[19px] leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
