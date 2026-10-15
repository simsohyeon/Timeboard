export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 보드 시간 범위와 1시간 픽셀 높이
export const START_H = 6;
export const END_H = 22;
export const HOUR_PX = 66;

// 메뉴 관리에서 고를 수 있는 시간(분) 옵션
export const DUR_OPTIONS = [30, 60, 90, 120, 150, 180];

// 담당자 구분색 팔레트
export const PALETTE = ['#4a90d9', '#e0923f', '#8470d8', '#4caf72', '#d4618f', '#3aa7b5'];

// 화면 글자 크기 — 기기(브라우저)별 저장, body zoom으로 전체 적용
export const SCALES = [
  { label: '작게', v: 0.9 },
  { label: '보통', v: 1 },
  { label: '크게', v: 1.15 },
  { label: '아주 크게', v: 1.3 },
];
export const getScale = () => {
  try { return Number(localStorage.getItem('tb-scale')) || 1; } catch { return 1; }
};
export const applyScale = v => {
  try { localStorage.setItem('tb-scale', String(v)); } catch { /* 저장 못 해도 적용은 한다 */ }
  document.body.style.zoom = v;
};

export const hourLabel = h =>
  h < 12 ? `오전 ${h}:00` : h === 12 ? `오후 12:00` : `오후 ${h - 12}:00`;

export const minLabel = m => {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${mm}`;
};
