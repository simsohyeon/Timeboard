export const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 보드 시간 범위와 1시간 픽셀 높이
export const START_H = 6;
export const END_H = 22;
export const HOUR_PX = 66;

// 메뉴 관리에서 고를 수 있는 시간(분) 옵션
export const DUR_OPTIONS = [30, 60, 90, 120, 150, 180];

// 담당자 구분색 팔레트
export const PALETTE = ['#4a90d9', '#e0923f', '#8470d8', '#4caf72', '#d4618f', '#3aa7b5'];

export const hourLabel = h =>
  h < 12 ? `오전 ${h}:00` : h === 12 ? `오후 12:00` : `오후 ${h - 12}:00`;

export const minLabel = m => {
  const h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
  return `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${mm}`;
};
