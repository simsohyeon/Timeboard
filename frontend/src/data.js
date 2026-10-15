// 목업 데이터 — 백엔드 API 연동 전까지 사용
export const STAFF = [
  { id: 1, name: '사장님', dot: '#4a90d9' },
  { id: 2, name: 'ㅇ', dot: '#4a90d9' },
  { id: 3, name: 'ㄱ', dot: '#4a90d9' },
  { id: 4, name: 'ㄷ', dot: '#4a90d9' },
  { id: 5, name: '미지정', dot: null },
];

// start: 분 단위 (0:00 기준), dur: 분
export const RESERVATIONS = {
  '2026-10-15': [
    { id: 1, staffId: 1, start: 12 * 60, dur: 60, title: '고객 등록 필요', sub: '타이60분' },
    { id: 2, staffId: 3, start: 14 * 60 + 30, dur: 90, title: '고객 등록 필요', sub: '타이90' },
    { id: 3, staffId: 5, start: 13 * 60, dur: 60, title: '고객 등록 필요', sub: '타이90' },
  ],
};

export const fmtDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
