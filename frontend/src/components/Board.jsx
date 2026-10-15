import { useEffect, useState } from 'react';
import { fmtDate } from '../api';
import { START_H, END_H, HOUR_PX, hourLabel, worksOn, workRange } from '../lib/constants';

export default function Board({ staff, list, date, startH = START_H, endH = END_H, hourPx = HOUR_PX, halfLine = false, onCellClick, onBlockClick }) {
  const isToday = fmtDate(date) === fmtDate(new Date());
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    // 처음에 현재 시각(또는 정오) 부근이 보이게 스크롤
    const el = document.querySelector('.board');
    if (!el) return;
    const base = isToday ? new Date().getHours() : 12;
    el.scrollTop = Math.max(0, (base - 1 - startH) * hourPx);
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - startH * 60) / 60 * hourPx;
  const showNow = isToday && nowMin >= startH * 60 && nowMin <= endH * 60;
  const nowLabel = `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="board">
      <div className="board-grid"
        style={{ gridTemplateColumns: `var(--timecol, 80px) repeat(${staff.length || 1}, minmax(var(--colmin, 112px), 1fr))` }}>
        <div className="col-head corner" />
        {staff.map(s => (
          <div className="col-head" key={s.id}>
            {s.dotColor && <i className="dot" style={{ background: s.dotColor }} />}{s.name}
          </div>
        ))}
        <div className="time-col" style={{ height: (endH - startH) * hourPx }}>
          {Array.from({ length: endH - startH }, (_, i) => (
            <span className="time-label" key={i} style={{ top: (i + 1) * hourPx }}>{hourLabel(startH + i + 1)}</span>
          ))}
          {showNow && <span className="now-pill" style={{ top: nowTop }}>{nowLabel}</span>}
        </div>
        {staff.map(s => {
          // 휴무 요일은 칸 전체, 근무시간 밖은 위아래만 회색 + 클릭 막음
          const off = !worksOn(s, date.getDay());
          const [wo, wc] = workRange(s, startH * 60, endH * 60);
          const top = m => (m - startH * 60) / 60 * hourPx;
          return (
          <div className={'col' + (off ? ' off' : '')} key={s.id} style={{ height: (endH - startH) * hourPx }}
            onClick={e => {
              if (off) return;
              // 좌표를 px로 다루면 zoom 배율에서 단위가 섞인다 →
              // 같은 좌표계인 clientY와 rect로 "칸 안에서의 비율"을 구해 시간으로 환산
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientY - rect.top) / rect.height;
              const slot = startH * 60 + Math.floor(frac * (endH - startH) * 2) * 30;
              const min = Math.min(Math.max(slot, startH * 60), endH * 60 - 30);
              if (min < wo || min >= wc) return;
              onCellClick(s.id, min);
            }}>
            {Array.from({ length: endH - startH - 1 }, (_, i) => (
              <i className="hline" key={i} style={{ top: (i + 1) * hourPx }} />
            ))}
            {halfLine && Array.from({ length: endH - startH }, (_, i) => (
              <i className="hline half" key={'h' + i} style={{ top: i * hourPx + hourPx / 2 }} />
            ))}
            {off && <span className="off-label">휴무</span>}
            {!off && wo > startH * 60 && <i className="off-zone" style={{ top: 0, height: top(wo) }} />}
            {!off && wc < endH * 60 && <i className="off-zone" style={{ top: top(wc), bottom: 0 }} />}
            {list.filter(r => r.staffId === s.id).map(r => (
              <div className={'resv' + (r.done ? ' done' : '')} key={r.id}
                style={{ top: (r.startMin - startH * 60) / 60 * hourPx, height: r.durationMin / 60 * hourPx - 2 }}
                onClick={e => { e.stopPropagation(); onBlockClick(r); }}>
                <b>{r.done && <span className="resv-check" aria-label="완료">✓</span>}{r.title}</b>
                <span>{r.subtitle}</span>
              </div>
            ))}
            {showNow && <i className="now-line" style={{ top: nowTop }} />}
          </div>
          );
        })}
      </div>
    </div>
  );
}
