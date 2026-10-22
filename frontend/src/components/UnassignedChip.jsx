import { useEffect, useState } from 'react';
import { bizToday, nowMinutes } from '../lib/schedule';
import { Chevron } from './ui';

// 날짜 줄 오른쪽: 담당자 미정 예약 N건. 누르면 목록 → '담당자 고르기'로 그 예약 창을 열어 담당자를 고른다
// 오늘이면 30분 안으로 다가온 예약은 'N분 남음', 시작 시각이 지났으면 '시간 지남'
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

// 오늘 기준 남은 시간 표시 (null = 아직 여유)
export function urgencyOf(r, isToday, nowMin) {
  if (!isToday) return null;
  const left = r.startMin - nowMin;
  if (left < 0) return { cls: 'late', text: '시간 지남' };
  if (left <= 30) return { cls: 'soon', text: `${left}분 남음` };
  return null;
}

export default function UnassignedChip({ items, dateStr, open, onToggle, onClose, onPick }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!open) return;
    const esc = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!items.length) return null;

  const isToday = dateStr === bizToday();
  const nowMin = nowMinutes();
  const tags = items.map(r => urgencyOf(r, isToday, nowMin));
  const urgent = tags.find(t => t?.cls === 'late') ?? tags.find(Boolean);
  const summary = items.slice(0, 2).map(r => `${short(r.startMin)} ${r.title}`).join(' · ')
    + (items.length > 2 ? ` 외 ${items.length - 2}` : '');

  return (
    <div className="un-wrap">
      <button type="button" className={'un-chip' + (urgent ? ' ' + urgent.cls : '')} onClick={onToggle} aria-expanded={open}>
        <b><span className="un-long">담당자 </span>미정 {items.length}<span className="un-long">건</span></b>
        <span className="un-sum">{summary}</span>
        {urgent && <em className={'un-tag ' + urgent.cls}>{urgent.text}</em>}
        <Chevron dir={open ? 'up' : 'down'} size={12} />
      </button>
      {open && (<>
        <div className="un-scrim" onClick={onClose} />
        <div className="un-pop" role="dialog" aria-label="담당자 미정 예약">
          <div className="un-pop-h"><b>담당자 미정</b><small>{items.length}건 · 시간이 다가오면 담당자를 골라 주세요</small></div>
          {items.map((r, i) => (
            <div key={r.id} className={'un-row' + (tags[i] ? ' ' + tags[i].cls : '')}>
              <span className="un-row-t">
                <span><b>{short(r.startMin)} {r.title}</b>{tags[i] && <em className={'un-tag ' + tags[i].cls}>{tags[i].text}</em>}</span>
                <small>{r.subtitle}</small>
              </span>
              <button type="button" onClick={() => onPick(r)}>담당자 고르기</button>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}
