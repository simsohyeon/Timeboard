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

// 바뀐 값 개수 — id 가 있는 목록은 id 로 맞춰 비교한다 (순서 바꾸기·삭제로 수가 부풀지 않게)
export function countChanges(a, b) {
  if (a === b) return 0;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return 1;
  if (Array.isArray(a) && Array.isArray(b)) {
    const byId = arr => (arr.every(x => x?.id !== undefined) ? Object.fromEntries(arr.map(x => [x.id, x])) : null);
    const ia = byId(a), ib = byId(b);
    if (ia && ib) return countChanges(ia, ib);
    return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
  }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((n, k) => n + countChanges(a[k], b[k]), 0);
}

// 편집 초안 — source(서버 값)가 바뀌면(저장 후 다시 불러오면) 초안도 새로 시작한다
export function useDraft(source) {
  const [base, setBase] = useState(source);
  const [draft, setDraft] = useState(source);
  if (source !== base) { setBase(source); setDraft(source); }
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  // 순서만 바뀌면 값 비교로는 0개라서 최소 1개로 센다
  const changes = dirty ? Math.max(1, countChanges(draft, base)) : 0;
  return { draft, setDraft, dirty, changes, reset: () => setDraft(base) };
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

// 바뀐 게 있을 때만 아래에 떠오르는 [되돌리기] [저장] 바. 저장 직후엔 '저장했어요'를 잠깐 보여준다
// status: { kind: 'idle' | 'saving' | 'saved' | 'error', msg }
export function FormBar({ dirty, changes, status, onCancel, onSave }) {
  const saving = status.kind === 'saving';
  if (status.kind === 'saved' && !dirty) return <div className="form-bar saved" role="status">저장했어요</div>;
  if (!dirty && !saving && status.kind !== 'error') return null;
  return (
    <div className="form-bar" role="region" aria-label="저장">
      {status.kind === 'error'
        ? <span className="form-bar-msg err" role="alert">{status.msg}</span>
        : <span className="form-bar-msg">저장하지 않은 변경 <b>{changes}개</b></span>}
      {(dirty || saving) && (<>
        <Button onClick={onCancel} disabled={saving}>되돌리기</Button>
        <Button variant="primary" onClick={onSave} disabled={saving}>{saving ? '저장 중…' : '저장'}</Button>
      </>)}
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
