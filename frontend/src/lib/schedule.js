// 담당자 한 명의 하루 일정 계산 (빈 시간, 지금 상태, 가장 빠른 가능 시각)
import { worksOn, workRange } from './constants';

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
export const ceilTo = (m, step = 10) => Math.ceil(m / step) * step;
const endOf = r => r.startMin + r.durationMin;

// "1시간 30분" / "40분"
export const durLabel = m => {
  const h = Math.floor(m / 60), mm = m % 60;
  return [h && `${h}시간`, mm && `${mm}분`].filter(Boolean).join(' ') || '0분';
};

// 근무시간 [wo, wc] 안에서 예약이 없는 구간들 (from 이후만)
export function freeGaps(staffList, [wo, wc], from = wo) {
  const busy = [...staffList].sort((a, b) => a.startMin - b.startMin);
  const gaps = [];
  let t = Math.max(wo, from);
  for (const r of busy) {
    if (r.startMin > t) gaps.push([t, Math.min(r.startMin, wc)]);
    t = Math.max(t, endOf(r));
    if (t >= wc) break;
  }
  if (t < wc) gaps.push([t, wc]);
  return gaps.filter(([a, b]) => b > a);
}

// from 이후 dur분을 연달아 비울 수 있는 가장 빠른 시작 시각 (없으면 null)
export function earliestStart(staffList, range, from, dur) {
  const g = freeGaps(staffList, range, from).find(([a, b]) => b - a >= dur);
  return g ? g[0] : null;
}

// 지금 이 담당자의 상태
// kind: off(휴무) | before(출근 전) | after(퇴근) | busy(시술 중) | free(비어 있음)
export function staffNow(s, list, date, openMin, closeMin, nowMin) {
  const mine = list.filter(r => r.staffId === s.id).sort((a, b) => a.startMin - b.startMin);
  const range = workRange(s, openMin, closeMin);
  const [wo, wc] = range;
  const next = mine.find(r => !r.done && r.startMin > nowMin) || null;
  if (!worksOn(s, date.getDay())) return { kind: 'off', next: null, mine, range };
  if (nowMin < wo) return { kind: 'before', next, mine, range };
  if (nowMin >= wc) return { kind: 'after', next: null, mine, range };
  const current = mine.find(r => !r.done && r.startMin <= nowMin && nowMin < endOf(r));
  if (current) return { kind: 'busy', current, left: endOf(current) - nowMin, next, mine, range };
  // 이미 완료 처리한 예약이 아직 시간 안이면, 그 시간은 빈 걸로 본다
  const blocking = mine.filter(r => !r.done || r.startMin > nowMin);
  const until = freeGaps(blocking, range, nowMin)[0]?.[1] ?? nowMin;
  return { kind: 'free', freeFor: until - nowMin, until, next, mine, range };
}
