import { useEffect, useState } from 'react';
import { DAYS } from '../lib/constants';

const TABS = [
  ['reserve', '예약'],
  ['pay', '결제'],
  ['settings', '설정'],
];

export default function TopBar({ tab, onTab }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const clock = `${now.getMonth() + 1}.${now.getDate()} (${DAYS[now.getDay()]}) ${now.getHours() < 12 ? '오전' : '오후'} ${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="topbar">
      <span className="tb-brand">타임보드</span>
      <nav className="tb-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => onTab(k)}>{label}</button>
        ))}
      </nav>
      <div className="tb-right">
        <span className="tb-clock">{clock}</span>
      </div>
    </div>
  );
}
