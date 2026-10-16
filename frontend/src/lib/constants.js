export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 보드 시간 범위와 1시간 픽셀 높이
export const START_H = 6;
export const END_H = 22;
export const HOUR_PX = 66;

// 메뉴 관리에서 고를 수 있는 시간(분) 옵션
export const DUR_OPTIONS = [30, 60, 90, 120, 150, 180];

// 담당자 구분색 팔레트
export const PALETTE = ['#4a90d9', '#e0923f', '#8470d8', '#4caf72', '#d4618f', '#3aa7b5'];

// 화면 표시 설정(글자 크기·밀도·다크 등)은 lib/display.js 참고

// 담당자 재직/근무 판정 (dateStr = 'YYYY-MM-DD', dow = 0~6)
export const isActiveOn = (s, dateStr) =>
  (!s.joinedOn || s.joinedOn <= dateStr) && (!s.leftOn || s.leftOn >= dateStr);
export const worksOn = (s, dow) => !s.workDays || s.workDays.includes(dow);
export const workRange = (s, openMin, closeMin) => [s.workOpenMin ?? openMin, s.workCloseMin ?? closeMin];

// 시간은 '영업일 0시 기준 분'. 자정을 넘는 영업(예: 새벽 3시 마감)은 24시 이후 = 1440분 이상으로 다룬다
export const ampmOf = h => (h >= 24 ? '새벽' : h < 12 ? '오전' : '오후');
export const hourLabel = h =>
  h >= 24 ? `새벽 ${h === 24 ? 12 : h - 24}:00` : h < 12 ? `오전 ${h}:00` : h === 12 ? `오후 12:00` : `오후 ${h - 12}:00`;

export const minLabel = m => {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${ampmOf(h)} ${((h + 11) % 12) + 1}:${mm}`;
};

// 이름에 '님'을 붙인다 — '사장님'처럼 이미 '님'으로 끝나면 그대로
export const nim = name => (name?.endsWith('님') ? name : `${name}님`);
