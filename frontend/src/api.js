// 백엔드 API 클라이언트 — 데이터 접근은 전부 이 파일을 거친다
const json = r => {
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.status === 204 ? null : r.json();
};

export const api = {
  staff: () => fetch('/api/staff').then(json),
  reservations: date => fetch(`/api/reservations?date=${date}`).then(json),
  reservationDates: () => fetch('/api/reservations/dates').then(json),
};

export const fmtDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
