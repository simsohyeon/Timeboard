import { DAYS } from '../lib/constants';
import { Chevron } from './ui';

export default function DateHeader({ date, count, onMove }) {
  return (
    <div className="main-head">
      <button className="mh-arrow" onClick={() => onMove(-1)} aria-label="이전 날"><Chevron dir="left" /></button>
      <span className="mh-date">{date.getDate()}일 ({DAYS[date.getDay()]})</span>
      <span className="mh-count">총 {count}건</span>
      <button className="mh-arrow" onClick={() => onMove(1)} aria-label="다음 날"><Chevron dir="right" /></button>
    </div>
  );
}
