import { useState } from 'react';
import Overview from './screens/Overview';
import Record from './screens/Record';
import Kline from './screens/Kline';
import Timeline from './screens/Timeline';
import People from './screens/People';
import Data from './screens/Data';
import { todayKey } from './lib/time';

type Tab = 'overview' | 'record' | 'kline' | 'timeline' | 'people' | 'data';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: '总览', icon: '◐' },
  { key: 'record', label: '记录', icon: '✎' },
  { key: 'kline', label: 'K线', icon: '∿' },
  { key: 'timeline', label: '时间轴', icon: '◆' },
  { key: 'people', label: '人物', icon: '人' },
  { key: 'data', label: '数据', icon: '⤓' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [recordDate, setRecordDate] = useState(todayKey());

  const goRecord = (date: string) => { setRecordDate(date); setTab('record'); };

  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 w-full max-w-[560px] mx-auto px-4 pt-5 pb-28">
        {tab === 'overview' && <Overview goRecord={goRecord} goKline={() => setTab('kline')} />}
        {tab === 'record' && <Record key={recordDate} date={recordDate} onDateChange={setRecordDate} />}
        {tab === 'kline' && <Kline goRecord={goRecord} />}
        {tab === 'timeline' && <Timeline goRecord={goRecord} />}
        {tab === 'people' && <People goRecord={goRecord} />}
        {tab === 'data' && <Data goRecord={goRecord} />}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-20 safe-bottom" style={{ background: 'rgb(var(--c-card) / 0.92)', backdropFilter: 'blur(14px)', borderTop: '1px solid rgb(var(--c-ink) / 0.08)' }}>
        <div className="max-w-[560px] mx-auto grid grid-cols-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className="py-2 flex flex-col items-center gap-0.5"
              style={{ color: tab === t.key ? '#007aff' : 'rgb(var(--c-ink) / 0.55)' }}
            >
              <span className="text-[17px] leading-none">{t.icon}</span>
              <span className="text-[11px] font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
