// 공용 UI 프리미티브 (토스 스타일) — 디자인 변경은 여기와 App.css의 토큰만 고치면 된다

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
