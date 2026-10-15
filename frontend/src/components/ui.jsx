// 공용 UI 프리미티브 (토스 스타일) — 디자인 변경은 여기와 App.css의 토큰만 고치면 된다
import { useEffect, useRef, useState } from 'react';

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Button({ variant = 'secondary', type = 'button', className = '', ...props }) {
  return <button type={type} className={`btn btn-${variant} ${className}`} {...props} />;
}

// 방향 있는 쉐브론 아이콘 — 화살표류는 전부 이걸 쓴다
export function Chevron({ dir = 'down', size = 14 }) {
  const rot = { down: 0, left: 90, right: -90, up: 180 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden
      style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Field({ label, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

// 커스텀 드롭다운 — 네이티브 select 대신 사용, 펼침 목록까지 같은 디자인
export function Select({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef(null);
  const listRef = useRef(null);
  const idx = options.findIndex(o => String(o.value) === String(value));
  const label = idx >= 0 ? options[idx].label : '';

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setHi(idx);
    requestAnimationFrame(() =>
      listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = o => { onChange(o.value); setOpen(false); };
  const onKey = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && hi >= 0) pick(options[hi]); else setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const n = Math.min(options.length - 1, Math.max(0, hi + (e.key === 'ArrowDown' ? 1 : -1)));
      setHi(n);
      listRef.current?.children[n]?.scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className={'select' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className="select-trigger" onClick={() => setOpen(o => !o)}
        onKeyDown={onKey} aria-haspopup="listbox" aria-expanded={open}>
        <span className="select-label">{label}</span>
        <Chevron size={12} />
      </button>
      {open && (
        <ul className="select-list" role="listbox" ref={listRef}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={i === idx}
              className={(i === idx ? 'on' : '') + (i === hi ? ' hi' : '')}
              onPointerDown={e => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseMove={() => hi !== i && setHi(i)}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
