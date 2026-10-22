import { useEffect, useState } from 'react';
import { bizToday, nowMinutes } from '../lib/schedule';
import { Chevron } from './ui';

// 담당자 미정 예약 목록. 평소엔 보드의 흐린 카드(맡을 수 있는 사람 칸)로 정하고,
// 그 시간에 맡을 사람이 아무도 없는 예약(stuck)이 있을 때만 날짜 줄 오른쪽에 칩이 뜬다.
// 시간축의 '미정 n' 을 눌러도 이 목록이 열린다. 오늘이면 30분 안은 'N분 남음', 지났으면 '시간 지남'
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

// 오늘 기준 남은 시간 표시 (null = 아직 여유)
export function urgencyOf(r, isToday, nowMin) {
  if (!isToday) return null;
  const left = r.startMin - nowMin;
  if (left < 0) return { cls: 'late', text: '시간 지남' };
  if (left <= 30) return { cls: 'soon', text: `${left}분 남음` };
  return null;
}

export default function UnassignedChip({ items, stuck = items, dateStr, open, onToggle, onClose, onPick }) {
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
  const stuckTags = stuck.map(r => urgencyOf(r, isToday, nowMin));
  const urgent = stuckTags.find(t => t?.cls === 'late') ?? stuckTags.find(Boolean);
  const summary = stuck.slice(0, 2).map(r => `${short(r.startMin)} ${r.title}`).join(' · ')
    + (stuck.length > 2 ? ` 외 ${stuck.length - 2}` : '');
  const isStuck = r => stuck.some(x => x.id === r.id);

  return (
    <div className="un-wrap">
      {stuck.length > 0 && (
        <button type="button" className={'un-chip' + (urgent ? ' ' + urgent.cls : '')} onClick={onToggle} aria-expanded={open}>
          <b><span className="un-long">담당자 </span>미정 {stuck.length}<span className="un-long">건</span></b>
          <span className="un-sum">비는 사람 없음 · {summary}</span>
          {urgent && <em className={'un-tag ' + urgent.cls}>{urgent.text}</em>}
          <Chevron dir={open ? 'up' : 'down'} size={12} />
        </button>
      )}
      {open && (<>
        <div className="un-scrim" onClick={onClose} />
        <div className="un-pop" role="dialog" aria-label="담당자 미정 예약">
          <div className="un-pop-h"><b>담당자 미정</b><small>{items.length}건 · 보드에서 비는 사람 칸의 흐린 카드를 눌러도 돼요</small></div>
          {items.map((r, i) => (
            <div key={r.id} className={'un-row' + (tags[i] ? ' ' + tags[i].cls : '')}>
              <span className="un-row-t">
                <span><b>{short(r.startMin)} {r.title}</b>{tags[i] && <em className={'un-tag ' + tags[i].cls}>{tags[i].text}</em>}</span>
                {isStuck(r) && <small className="un-none">그 시간에 비는 사람이 없어요</small>}
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
