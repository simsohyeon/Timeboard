import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../api';
import MiniCalendar from './MiniCalendar';

const POP_W = 280; // 펼침 달력 폭 — 오른쪽이 모자라면 오른쪽 기준으로 연다

// 'YYYY-MM-DD' ↔ Date (UTC 해석으로 하루 밀리지 않게 로컬 날짜로 만든다)
const toDate = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const label = s => toDate(s)?.toLocaleDateString('ko-KR'); // "2026. 10. 15." — 폰의 좁은 칸에서도 안 잘리게

// 날짜 고르기 — 네이티브 date 입력 대신 사용 (기기마다 모양이 달라서). value/onChange 는 'YYYY-MM-DD' | null
export default function DatePicker({ value, onChange, placeholder = '선택 안 함', clearable = true, ...props }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = () => {
    const r = ref.current.getBoundingClientRect();
    // 글자 크게(zoom)일 때는 달력도 그만큼 넓어진다
    const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
    setAlignRight(r.left + POP_W * scale > document.documentElement.clientWidth - 8);
    setOpen(o => !o);
  };

  return (
    <div className={'select datepick' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className="select-trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} {...props}>
        <span className={'select-label' + (value ? '' : ' placeholder')}>{value ? label(value) : placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
          <rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className={'datepick-pop' + (alignRight ? ' right' : '')} role="dialog" aria-label="날짜 고르기">
          <MiniCalendar selected={toDate(value)} onSelect={d => { onChange(fmtDate(d)); setOpen(false); }} />
          {clearable && value && (
            <button type="button" className="datepick-clear" onClick={() => { onChange(null); setOpen(false); }}>
              날짜 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
