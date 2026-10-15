// 화면 표시 설정 — 기기(브라우저)별 localStorage 저장
export const BASE_FONT = 14; // 기본 폰트(px). zoom = fontPx / BASE_FONT
export const FONT_SIZES = [13, 14, 15, 16, 18];
export const DENSITIES = [
  { label: '좁게', v: 48 },
  { label: '보통', v: 66 },
  { label: '넓게', v: 88 },
];

const KEY = 'tb-display';
export const DEFAULT_DISPLAY = {
  fontPx: BASE_FONT,
  hourPx: 66,       // 보드 1시간 높이
  hidePrice: false, // 예약 화면에서 금액 숨김 (손님 모드)
  dark: false,
  halfLine: false,  // 30분 보조선
  keepAwake: false, // 화면 항상 켜기 (wake lock)
};

export const loadDisplay = () => {
  try { return { ...DEFAULT_DISPLAY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULT_DISPLAY }; }
};

export const saveDisplay = d => {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 실패해도 적용은 */ }
};
