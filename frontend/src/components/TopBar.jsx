import { useEffect, useState } from 'react';
import { DAYS } from '../lib/constants';

const TABS = [
  ['reserve', '예약'],
  ['now', '지금'],
  ['pay', '결제'],
  ['settings', '설정'],
];

export default function TopBar({ tab, onTab, shopName, locked, pinTabs = [], onLock }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const day = `${now.getMonth() + 1}.${now.getDate()} (${DAYS[now.getDay()]}) `;
  const time = `${now.getHours() < 12 ? '오전' : '오후'} ${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="topbar">
      <span className="tb-brand" title={shopName}>{shopName || '타임보드'}</span>
      <nav className="tb-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => onTab(k)}>
            {label}{locked && pinTabs.includes(k) && <LockIcon />}
          </button>
        ))}
      </nav>
      <div className="tb-right">
        {pinTabs.length > 0 && !locked && (
          <button type="button" className="tb-lock" onClick={onLock} title="결제·설정 다시 잠그기">
            <LockIcon open />잠그기
          </button>
        )}
        <span className="tb-clock"><span className="tb-clock-day">{day}</span>{time}</span>
      </div>
    </div>
  );
}

function LockIcon({ open = false }) {
  return (
    <svg className="lock-ic" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d={open ? 'M5.5 7V5a2.5 2.5 0 0 1 4.9-.7' : 'M5.5 7V5a2.5 2.5 0 0 1 5 0v2'} />
    </svg>
  );
}
