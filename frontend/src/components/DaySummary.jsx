import { fmtDate } from '../api';
import { nowMinutes, bizToday, staffNow, leaveOn, hitsLeave } from '../lib/schedule';

// 보드 위 한 줄 요약: 예약 수 · 완료 수 · (오늘이면) 지금 시술 중 · 바로 가능한 사람
export default function DaySummary({ staff, list, leaves = [], date, openMin, closeMin }) {
  const isToday = fmtDate(date) === bizToday();
  const done = list.filter(r => r.done).length;
  let busy = 0, free = [];
  if (isToday) {
    const nowMin = nowMinutes();
    for (const s of staff) {
      const st = staffNow(s, list, date, openMin, closeMin, nowMin, leaves);
      if (st.kind === 'busy') busy++;
      if (st.kind === 'free' && st.freeFor >= 30) free.push(s.name);
    }
  }
  const dateStr = fmtDate(date);
  const onLeave = staff.filter(s => leaveOn(leaves, s.id, dateStr).full).map(s => s.name);
  const away = staff.filter(s => leaveOn(leaves, s.id, dateStr).parts.length).map(s => s.name);
  const clash = list.filter(r => !r.done && hitsLeave(leaveOn(leaves, r.staffId, dateStr), r.startMin, r.durationMin)).length;
  return (
    <div className="day-sum">
      <span className="ds-chip">예약 <b>{list.length}</b>건</span>
      <span className="ds-chip">완료 <b>{done}</b>건</span>
      {isToday && busy > 0 && <span className="ds-chip busy"><i />지금 시술 중 {busy}명</span>}
      {onLeave.length > 0 && <span className="ds-chip leave">휴가 · {onLeave.join(', ')}</span>}
      {away.length > 0 && <span className="ds-chip leave">외출·반차 · {away.join(', ')}</span>}
      {clash > 0 && <span className="ds-chip busy">⚠ 휴가와 겹친 예약 {clash}건</span>}
      {isToday && <span className="ds-chip free"><i />{free.length ? `바로 가능 · ${free.join(', ')}` : '지금 바로 가능한 사람 없음'}</span>}
    </div>
  );
}
