import { useEffect, useState } from 'react';
import { fmtDate } from '../api';
import { START_H, END_H, HOUR_PX, hourLabel } from '../lib/constants';

export default function Board({ staff, list, date, startH = START_H, endH = END_H, onCellClick, onBlockClick }) {
  const isToday = fmtDate(date) === fmtDate(new Date());
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    // 처음에 현재 시각(또는 정오) 부근이 보이게 스크롤
    const el = document.querySelector('.board');
    if (!el) return;
    const base = isToday ? new Date().getHours() : 12;
    el.scrollTop = Math.max(0, (base - 1 - startH) * HOUR_PX);
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - startH * 60) / 60 * HOUR_PX;
  const showNow = isToday && nowMin >= startH * 60 && nowMin <= endH * 60;
  const nowLabel = `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="board">
      <div className="board-grid" style={{ gridTemplateColumns: `64px repeat(${staff.length || 1}, 1fr)` }}>
        <div className="col-head corner" />
        {staff.map(s => (
          <div className="col-head" key={s.id}>
            {s.dotColor && <i className="dot" style={{ background: s.dotColor }} />}{s.name}
          </div>
        ))}
        <div className="time-col" style={{ height: (endH - startH) * HOUR_PX }}>
          {Array.from({ length: endH - startH }, (_, i) => (
            <span className="time-label" key={i} style={{ top: (i + 1) * HOUR_PX }}>{hourLabel(startH + i + 1)}</span>
          ))}
          {showNow && <span className="now-pill" style={{ top: nowTop }}>{nowLabel}</span>}
        </div>
        {staff.map(s => (
          <div className="col" key={s.id} style={{ height: (endH - startH) * HOUR_PX }}
            onClick={e => {
              const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
              onCellClick(s.id, startH * 60 + Math.floor(y / (HOUR_PX / 2)) * 30);
            }}>
            {Array.from({ length: endH - startH - 1 }, (_, i) => (
              <i className="hline" key={i} style={{ top: (i + 1) * HOUR_PX }} />
            ))}
            {list.filter(r => r.staffId === s.id).map(r => (
              <div className="resv" key={r.id} style={{ top: (r.startMin - startH * 60) / 60 * HOUR_PX, height: r.durationMin / 60 * HOUR_PX - 2 }}
                onClick={e => { e.stopPropagation(); onBlockClick(r); }}>
                <b>{r.title}</b>
                <span>{r.subtitle}</span>
              </div>
            ))}
            {showNow && <i className="now-line" style={{ top: nowTop }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
