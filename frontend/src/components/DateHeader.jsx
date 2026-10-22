import { DAYS } from '../lib/constants';
import { Chevron } from './ui';

// 모바일에선 날짜를 누르면 달력이 펼쳐진다 (데스크톱은 왼쪽 사이드바 달력 사용)
// 데스크톱·태블릿 가로: 왼쪽 달력을 접을 수 있고, 접으면 모바일처럼 날짜를 눌러 달력을 편다
export default function DateHeader({ date, count, countLabel = '총', onMove, calOpen = false, onDateClick, sideHidden = false, onToggleSide, extra = null }) {
  return (
    <div className="main-head">
      {onToggleSide && (
        <button type="button" className="mh-side" onClick={onToggleSide}
          aria-label={sideHidden ? '왼쪽 달력 펴기' : '왼쪽 달력 접기'} title={sideHidden ? '달력 펴기' : '달력 접기'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" />
            <path d={sideHidden ? 'M13 10l2 2-2 2' : 'M15 10l-2 2 2 2'} />
          </svg>
        </button>
      )}
      <button className="mh-arrow" onClick={() => onMove(-1)} aria-label="이전 날"><Chevron dir="left" /></button>
      <button type="button" className="mh-date" onClick={onDateClick} aria-expanded={calOpen}>
        <span className="mh-month">{date.getMonth() + 1}월 </span>{date.getDate()}일 ({DAYS[date.getDay()]})
        <span className="mh-caret"><Chevron dir={calOpen ? 'up' : 'down'} size={12} /></span>
      </button>
      <span className="mh-count">{countLabel} {count}건</span>
      <button className="mh-arrow" onClick={() => onMove(1)} aria-label="다음 날"><Chevron dir="right" /></button>
      {extra}
    </div>
  );
}
