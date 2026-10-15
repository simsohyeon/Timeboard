import { useEffect, useState } from 'react';
import { DAYS } from '../lib/constants';

export default function TopBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  const clock = `${now.getMonth() + 1}.${now.getDate()} (${DAYS[now.getDay()]}) ${now.getHours() < 12 ? '오전' : '오후'} ${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="topbar">
      <span className="tb-brand">타임보드</span>
      <div className="tb-right">
        <span className="tb-clock">{clock}</span>
      </div>
    </div>
  );
}
