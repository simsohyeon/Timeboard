import { fmtDate } from '../api';
import { nowMinutes, staffNow } from '../lib/schedule';

// 보드 위 한 줄 요약: 예약 수 · 완료 수 · (오늘이면) 지금 시술 중 · 바로 가능한 사람
export default function DaySummary({ staff, list, date, openMin, closeMin }) {
  const isToday = fmtDate(date) === fmtDate(new Date());
  const done = list.filter(r => r.done).length;
  let busy = 0, free = [];
  if (isToday) {
    const nowMin = nowMinutes();
    for (const s of staff) {
      const st = staffNow(s, list, date, openMin, closeMin, nowMin);
      if (st.kind === 'busy') busy++;
      if (st.kind === 'free' && st.freeFor >= 30) free.push(s.name);
    }
  }
  return (
    <div className="day-sum">
      <span className="ds-chip">예약 <b>{list.length}</b>건</span>
      <span className="ds-chip">완료 <b>{done}</b>건</span>
      {isToday && busy > 0 && <span className="ds-chip busy"><i />지금 시술 중 {busy}명</span>}
      {isToday && <span className="ds-chip free"><i />{free.length ? `바로 가능 · ${free.join(', ')}` : '지금 바로 가능한 사람 없음'}</span>}
    </div>
  );
}
