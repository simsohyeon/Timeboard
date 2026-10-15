import { DAYS } from '../lib/constants';
import { Chevron } from './ui';

// 모바일에선 날짜를 누르면 달력이 펼쳐진다 (데스크톱은 왼쪽 사이드바 달력 사용)
export default function DateHeader({ date, count, countLabel = '총', onMove, calOpen = false, onDateClick }) {
  return (
    <div className="main-head">
      <button className="mh-arrow" onClick={() => onMove(-1)} aria-label="이전 날"><Chevron dir="left" /></button>
      <button type="button" className="mh-date" onClick={onDateClick} aria-expanded={calOpen}>
        <span className="mh-month">{date.getMonth() + 1}월 </span>{date.getDate()}일 ({DAYS[date.getDay()]})
        <span className="mh-caret"><Chevron dir={calOpen ? 'up' : 'down'} size={12} /></span>
      </button>
      <span className="mh-count">{countLabel} {count}건</span>
      <button className="mh-arrow" onClick={() => onMove(1)} aria-label="다음 날"><Chevron dir="right" /></button>
    </div>
  );
}
