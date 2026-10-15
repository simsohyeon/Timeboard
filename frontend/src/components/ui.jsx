// 공용 UI 프리미티브 (토스 스타일) — 디자인 변경은 여기와 App.css의 토큰만 고치면 된다
import { useEffect, useRef, useState } from 'react';

export function Modal({ title, onClose, children, className = '' }) {
  return (
    <div className={`modal-wrap ${className}`}>
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

// 버튼 여러 개를 품는 필드 (label 대신 div — 칩/체크박스 묶음용)
export function FieldGroup({ label, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

export function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 아이콘만 있는 버튼 — label 은 접근성용 필수
export function IconButton({ label, danger = false, className = '', ...props }) {
  return (
    <button type="button" className={`icon-btn ${danger ? 'danger' : ''} ${className}`}
      aria-label={label} {...props} />
  );
}

// 포커스를 잃을 때 값이 바뀌었으면 onCommit — 이름/가격/연락처처럼 바로 저장하는 입력
// format: 값 → 표시 문자열, parse: 입력 문자열 → 값. value 가 바뀌면 입력을 새로 그린다
export function BlurInput({ value, onCommit, format = v => v ?? '', parse = v => v.trim(),
  multiline = false, className = '', ...props }) {
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <Tag key={String(value)} className={className} defaultValue={format(value)}
      onBlur={e => { const v = parse(e.target.value); if (v !== value) onCommit(v); }} {...props} />
  );
}

// 여러 개 고르는 칩 묶음 (요일, 시간 옵션 등)
export function ChipGroup({ options, selected, onToggle, className = '' }) {
  return (
    <div className={`chips ${className}`}>
      {options.map(o => {
        const on = selected.includes(o.value);
        return (
          <button key={o.value} type="button" className={'chip-tg' + (on ? ' on' : '')}
            aria-pressed={on} onClick={() => onToggle(o.value)}>{o.label}</button>
        );
      })}
    </div>
  );
}

export function Checkbox({ label, checked, onChange }) {
  return (
    <label className="chk">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// 색 점 — 올리거나 포커스하면 팔레트가 떠서 바로 고른다
export function ColorPicker({ value, palette, onChange, label = '색 바꾸기' }) {
  return (
    <div className="pal-wrap">
      <button type="button" className="dot-btn" aria-label={label}>
        <i className="dot" style={{ background: value || '#d1d6db' }} />
      </button>
      <div className="pal" role="group" aria-label="색 고르기">
        {palette.map(c => (
          <button key={c} type="button" className={'pal-c' + (c === value ? ' on' : '')}
            style={{ background: c }} aria-label={c} aria-pressed={c === value}
            onClick={() => c !== value && onChange(c)} />
        ))}
      </div>
    </div>
  );
}

// 드래그 손잡이 아이콘 (점 6개)
export function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="currentColor">
      {[3, 7, 11].flatMap(y => [4.5, 9.5].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
    </svg>
  );
}

// 드래그앤드롭 정렬 — 마우스·터치 공통(포인터 이벤트). 행에 data-sort-id, 손잡이에 handleProps(id).
// onDrop(새 id 순서) 후 부모가 items 를 새로 받을 때까지 바뀐 순서를 그대로 보여준다.
export function useDragSort(items, onDrop) {
  const [drag, setDrag] = useState(null); // { id: 끄는 중인 id | null(저장 대기), order: [id...] }
  const dragRef = useRef(drag); dragRef.current = drag;
  const itemsRef = useRef(items); itemsRef.current = items;
  const dropRef = useRef(onDrop); dropRef.current = onDrop;
  useEffect(() => setDrag(null), [items]);
  const ordered = drag ? drag.order.map(id => items.find(x => x.id === id)).filter(Boolean) : items;
  const dragging = drag?.id != null;

  // 이동/놓기는 window 에서 받는다 — 순서가 바뀌며 손잡이 DOM 이 옮겨져도 추적이 끊기지 않게
  useEffect(() => {
    if (!dragging) return;
    const move = e => {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-sort-id]');
      if (!over) return;
      setDrag(d => {
        if (d?.id == null || over.dataset.sortId === String(d.id)) return d;
        const to = d.order.findIndex(x => String(x) === over.dataset.sortId);
        if (to < 0) return d;
        const order = d.order.filter(x => x !== d.id);
        order.splice(to, 0, d.id);
        return { ...d, order };
      });
    };
    const up = () => {
      const d = dragRef.current;
      if (!d) return;
      const changed = d.order.some((x, i) => x !== itemsRef.current[i]?.id);
      if (changed) { setDrag({ id: null, order: d.order }); dropRef.current(d.order); }
      else setDrag(null);
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging]);

  const handleProps = id => ({
    onPointerDown: e => { e.preventDefault(); setDrag({ id, order: ordered.map(x => x.id) }); },
  });

  return { ordered, dragId: drag?.id ?? null, handleProps };
}

// 저장 상태 표시: { kind: 'idle' | 'dirty' | 'saving' | 'saved' | 'error', msg }
export function SaveStatus({ status }) {
  if (status.kind === 'error') return <span className="save-status err">{status.msg}</span>;
  const text = { dirty: '저장하지 않은 변경이 있어요', saving: '저장 중', saved: '저장됨' }[status.kind];
  if (!text) return <span className="save-status" />;
  return <span className={'save-status ' + status.kind}><i />{text}</span>;
}

// 편집 초안 — source(서버 값)가 바뀌면(저장 후 다시 불러오면) 초안도 새로 시작한다
export function useDraft(source) {
  const [base, setBase] = useState(source);
  const [draft, setDraft] = useState(source);
  if (source !== base) { setBase(source); setDraft(source); }
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  return { draft, setDraft, dirty, reset: () => setDraft(base) };
}

// 저장 실행 + 상태(저장 중/저장됨/오류) 관리
export function useSaver() {
  const [status, setStatus] = useState({ kind: 'idle' });
  const save = async (fn, after) => {
    setStatus({ kind: 'saving' });
    try { await fn(); setStatus({ kind: 'saved' }); after?.(); }
    catch (e) { setStatus({ kind: 'error', msg: e.message || String(e) }); }
  };
  const fail = msg => setStatus({ kind: 'error', msg });
  return { status, setStatus, save, fail };
}

// 화면 아래에 붙는 [취소] [저장] 바 — 바뀐 게 없으면 둘 다 비활성
export function FormBar({ dirty, status, onCancel, onSave }) {
  const saving = status.kind === 'saving';
  const shown = dirty && status.kind !== 'error' && !saving ? { kind: 'dirty' } : status;
  return (
    <div className="form-bar">
      <SaveStatus status={shown} />
      <div className="form-bar-btns">
        <Button onClick={onCancel} disabled={!dirty || saving}>취소</Button>
        <Button variant="primary" onClick={onSave} disabled={!dirty || saving}>{saving ? '저장 중…' : '저장'}</Button>
      </div>
    </div>
  );
}

// 커스텀 드롭다운 — 네이티브 select 대신 사용, 펼침 목록까지 같은 디자인
export function Select({ value, onChange, options, disabled = false }) {
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
      <button type="button" className="select-trigger" onClick={() => setOpen(o => !o)} disabled={disabled}
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
