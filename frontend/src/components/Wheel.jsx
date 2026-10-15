import { useEffect, useRef } from 'react';

// 아이폰 알람처럼 위아래로 굴려 고르는 휠 한 줄.
// items: [{ value, label, cls? }] / 가운데 칸에 멈춘 항목이 선택된다. 눌러도 선택, 키보드 ↑↓도 된다.
export default function Wheel({ items, value, onChange, label }) {
  const ref = useRef(null);
  const timer = useRef(null);
  const first = useRef(true);
  const rolling = useRef(false); // 손가락으로 굴리는 중이면 밖에서 위치를 건드리지 않는다
  const idx = Math.max(0, items.findIndex(it => it.value === value));
  const itemH = () => ref.current?.querySelector('.wheel-item')?.offsetHeight || 40;

  // 값이 밖에서 바뀌면(다른 휠·버튼) 그 항목으로 굴려 둔다
  useEffect(() => {
    const el = ref.current;
    if (!el || rolling.current) return;
    const top = idx * itemH();
    if (Math.abs(el.scrollTop - top) > 2) el.scrollTo({ top, behavior: first.current ? 'auto' : 'smooth' });
    first.current = false;
  }, [idx, items.length]);

  // 굴리다 멈추면 가운데 항목을 선택
  const onScroll = () => {
    rolling.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      rolling.current = false;
      const el = ref.current;
      if (!el) return;
      const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / itemH())));
      if (items[i] && items[i].value !== value) onChange(items[i].value);
    }, 140);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const onKeyDown = e => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[idx + step];
    if (next) { rolling.current = false; onChange(next.value); }
  };

  return (
    <div className="wheel" ref={ref} onScroll={onScroll} onKeyDown={onKeyDown}
      role="listbox" aria-label={label} tabIndex={0}>
      <div className="wheel-pad" aria-hidden="true" />
      {items.map((it, i) => (
        <div key={it.value} role="option" aria-selected={i === idx}
          className={'wheel-item' + (i === idx ? ' on' : '') + (it.cls ? ' ' + it.cls : '')}
          onClick={() => { rolling.current = false; onChange(it.value); }}>
          {it.label}
        </div>
      ))}
      <div className="wheel-pad" aria-hidden="true" />
    </div>
  );
}
