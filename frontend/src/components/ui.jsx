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

export function Field({ label, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
