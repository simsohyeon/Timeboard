// 담당자 한 명의 하루 일정 계산 (빈 시간, 지금 상태, 가장 빠른 가능 시각)
import { worksOn, workRange, isActiveOn } from './constants';
import { fmtDate } from '../api';

// ───── 영업일 ─────
// 마감이 자정을 넘으면(예: 새벽 3시 = 1620분) 자정~새벽 3시는 '전날 영업일'의 1440분 이후로 본다
let overnight = 0; // 자정 넘어 영업하는 분 (새벽 3시 마감 → 180)
export const setDayEnd = closeMin => { overnight = Math.max(0, (closeMin || 0) - 1440); };
export const bizNow = (d = new Date()) => {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= overnight) return { date: d, min: m };
  const y = new Date(d); y.setDate(y.getDate() - 1);
  return { date: y, min: m + 1440 };
};
export const nowMinutes = () => bizNow().min;          // 영업일 기준 지금 (분)
export const bizToday = () => fmtDate(bizNow().date);  // 영업일 기준 오늘 'YYYY-MM-DD'
export const ceilTo = (m, step = 10) => Math.ceil(m / step) * step;
const endOf = r => r.startMin + r.durationMin;

// "1시간 30분" / "40분"
export const durLabel = m => {
  const h = Math.floor(m / 60), mm = m % 60;
  return [h && `${h}시간`, mm && `${mm}분`].filter(Boolean).join(' ') || '0분';
};

// ───── 휴가 ─────
// 그 날 그 담당자의 휴가: full = 종일 휴가(없으면 null), parts = 시간 지정 휴가들 [{ a, b, leave }]
export function leaveOn(leaves, staffId, dateStr) {
  const mine = (leaves || []).filter(l => l.staffId === staffId && l.startDate <= dateStr && dateStr <= l.endDate);
  return {
    full: mine.find(l => l.startMin == null) ?? null,
    parts: mine.filter(l => l.startMin != null).map(l => ({ a: l.startMin, b: l.endMin, leave: l })),
  };
}
// 시간 지정 휴가를 예약처럼 "막힌 시간"으로 (빈 시간 계산에 같이 넣는다)
export const leaveBlocks = parts => parts.map(p => ({ startMin: p.a, durationMin: p.b - p.a, leave: true }));
// 예약 r이 휴가와 겹치나 (종일이면 무조건)
export const hitsLeave = (lv, start, dur) =>
  !!lv.full || lv.parts.some(p => start < p.b && p.a < start + dur);
export const leaveLabel = l =>
  (l.reason || '휴가') + (l.startMin != null ? ` ${short(l.startMin)}–${short(l.endMin)}` : '');
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

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
// kind: off(휴무) | leave(휴가·외출 중) | before(출근 전) | after(퇴근) | busy(시술 중) | free(비어 있음)
// blocks = 예약 + 시간 지정 휴가 (빈 시간 계산용)
export function staffNow(s, list, date, openMin, closeMin, nowMin, leaves = []) {
  const mine = list.filter(r => r.staffId === s.id).sort((a, b) => a.startMin - b.startMin);
  const range = workRange(s, openMin, closeMin);
  const [wo, wc] = range;
  const lv = leaveOn(leaves, s.id, fmtDate(date));
  const blocks = [...mine, ...leaveBlocks(lv.parts)];
  const next = mine.find(r => !r.done && r.startMin > nowMin) || null;
  if (!worksOn(s, date.getDay())) return { kind: 'off', next: null, mine, blocks, range, lv };
  if (lv.full) return { kind: 'leave', leave: lv.full, next, mine, blocks, range, lv };
  const base = { next, mine, blocks, range, lv };
  if (nowMin < wo) return { kind: 'before', ...base };
  if (nowMin >= wc) return { kind: 'after', ...base, next: null };
  const current = mine.find(r => !r.done && r.startMin <= nowMin && nowMin < endOf(r));
  if (current) return { kind: 'busy', current, left: endOf(current) - nowMin, ...base };
  const away = lv.parts.find(p => p.a <= nowMin && nowMin < p.b);
  if (away) return { kind: 'leave', leave: away.leave, until: away.b, ...base };
  // 이미 완료 처리한 예약이 아직 시간 안이면, 그 시간은 빈 걸로 본다
  const blocking = blocks.filter(r => !r.done || r.startMin > nowMin);
  const until = freeGaps(blocking, range, nowMin)[0]?.[1] ?? nowMin;
  return { kind: 'free', freeFor: until - nowMin, until, ...base };
}

// 휴가 때문에 옮겨야 하는 예약 r을 대신 맡을 수 있는 담당자들
// (그 날 재직·근무 요일·근무 시간 안, 휴가 아님, 다른 예약과 안 겹침)
export function altStaff(r, staff, allResv, leaves, openMin, closeMin) {
  const [y, m, d] = r.date.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const end = r.startMin + r.durationMin;
  return staff.filter(s => {
    if (s.id === r.staffId || !isActiveOn(s, r.date) || !worksOn(s, dow)) return false;
    const [wo, wc] = workRange(s, openMin, closeMin);
    if (r.startMin < wo || end > wc) return false;
    if (hitsLeave(leaveOn(leaves, s.id, r.date), r.startMin, r.durationMin)) return false;
    return !allResv.some(x => x.staffId === s.id && x.date === r.date && x.id !== r.id
      && x.startMin < end && r.startMin < x.startMin + x.durationMin);
  });
}
