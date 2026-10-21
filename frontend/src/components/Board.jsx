import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtDate } from '../api';
import { START_H, END_H, HOUR_PX, hourLabel, worksOn, workRange } from '../lib/constants';
import { freeGaps, durLabel, nowMinutes, bizToday, ceilTo, staffNow, leaveOn, leaveBlocks, hitsLeave, leaveLabel } from '../lib/schedule';

// 예약 보드: 가로 = 담당자, 세로 = 시간.
// 30분 이상 빈 시간은 점선 칸으로 보여 주고, 누르면 그 시각으로 바로 예약 등록.
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

// 시간이 겹치는 예약은 칸을 나눠 나란히: { id: [몇 번째 줄, 묶음의 줄 수, 오른쪽으로 넓힐 수 있는 줄 수] }
// 옆 줄이 그 시간에 비어 있으면 그만큼 넓게 (4건이 잠깐 겹쳐도 나머지 시간엔 넓게 보이게)
function lanesOf(rs) {
  const out = {};
  const sorted = [...rs].sort((a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin || a.id - b.id);
  let group = [], ends = [], groupEnd = -1;
  const overlap = (a, b) => a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin;
  const flush = () => {
    const n = ends.length;
    for (const r of group) {
      const lane = out[r.id][0];
      let span = 1;
      while (lane + span < n && !group.some(o => out[o.id][0] === lane + span && overlap(o, r))) span++;
      out[r.id] = [lane, n, span];
    }
    group = []; ends = [];
  };
  for (const r of sorted) {
    if (r.startMin >= groupEnd) flush();
    let lane = ends.findIndex(e => e <= r.startMin);
    if (lane < 0) { lane = ends.length; ends.push(0); }
    ends[lane] = r.startMin + r.durationMin;
    groupEnd = Math.max(groupEnd, ends[lane]);
    out[r.id] = [lane];
    group.push(r);
  }
  flush();
  return out;
}
const laneStyle = ([i, n, span] = [0, 1, 1]) => (n > 1 && span < n
  ? { left: `calc(4px + (100% - 8px) * ${i} / ${n})`, width: `calc((100% - 8px) * ${span} / ${n} - 2px)`, right: 'auto' }
  : n > 1 ? { left: `calc(4px + (100% - 8px) * ${i} / ${n})`, right: '4px' } : {});
// 한 칸의 1/3 이하로 좁으면 손님 이름만 크게 (메뉴·시간 줄은 숨김)
const isNarrow = ([, n, span] = [0, 1, 1]) => n / span >= 3;

export default function Board({ staff, list, date, startH = START_H, endH = END_H, hourPx: wantPx = HOUR_PX, halfLine = false, leaves = [], onCellClick, onBlockClick, onReorder }) {
  // 영업시간이 짧아 보드가 화면보다 짧으면 1시간 높이를 늘려 화면을 꽉 채운다 (아래가 비지 않게)
  const boardRef = useRef(null);
  const [fillPx, setFillPx] = useState(0);
  useEffect(() => {
    const el = boardRef.current;
    if (!el || !window.ResizeObserver) return;
    const measure = () => {
      const head = el.querySelector('.col-head')?.offsetHeight ?? 0;
      setFillPx(Math.floor((el.clientHeight - head) / Math.max(1, endH - startH)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    window.addEventListener('resize', measure);
    const late = setTimeout(measure, 500); // 글꼴·설정을 불러온 뒤 한 번 더
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); clearTimeout(late); };
  }, [startH, endH]);
  const hourPx = Math.max(wantPx, fillPx);

  // 담당자 순서 바꾸기: 머리글을 길게 누른 뒤 좌우로 끌어 놓는다 (터치·마우스 공통)
  // 누르는 동안 머리글이 파랗게 차오름 → 들리면 이름표가 손가락을 따라오고, 다른 칸은 흐려지고, 칸이 미끄러지며 자리를 바꿈
  // → 놓으면 옮긴 칸이 반짝하고 '순서를 바꿨어요'
  const [drag, setDrag] = useState(null); // { id: 끄는 담당자, order: [id...] }
  const [pressId, setPressId] = useState(null); // 길게 누르는 중
  const [moved, setMoved] = useState(null);     // 방금 옮긴 담당자
  const [toast, setToast] = useState('');
  const ghostRef = useRef(null);
  const ghostAt = useRef({ x: 0, y: 0 });
  const idsKey = staff.map(s => s.id).join();
  useEffect(() => setDrag(null), [idsKey]);
  const cols = drag ? drag.order.map(id => staff.find(s => s.id === id)).filter(Boolean) : staff;
  // 글자 크기 설정(zoom) 안에서는 화면 좌표를 배율로 나눠야 손가락 위치와 맞는다
  const zoomK = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const ghostTransform = () => { const k = zoomK(); return `translate(${ghostAt.current.x / k}px, ${ghostAt.current.y / k}px) translate(-50%, -135%)`; };
  const showToast = msg => { setToast(msg); clearTimeout(showToast.t); showToast.t = setTimeout(() => setToast(''), 1800); };
  const startPress = (e, id) => {
    if (!onReorder || staff.length < 2 || e.button > 0) return;
    const x0 = e.clientX, y0 = e.clientY;
    let order = null; // 길게 눌러 끌기가 시작되면 [id...]
    setPressId(id);
    const timer = setTimeout(() => {
      order = staff.map(s => s.id);
      ghostAt.current = { x: x0, y: y0 };
      navigator.vibrate?.(15);
      setPressId(null);
      setDrag({ id, order });
    }, 400);
    const move = ev => {
      if (!order) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) end(); return; } // 그냥 쓸어 넘김
      ev.preventDefault();
      ghostAt.current = { x: ev.clientX, y: ev.clientY };
      if (ghostRef.current) ghostRef.current.style.transform = ghostTransform();
      const board = boardRef.current;
      const r = board.getBoundingClientRect();
      if (ev.clientX > r.right - 40) board.scrollLeft += 12;              // 화면 끝으로 끌면 옆으로 넘김
      else if (ev.clientX < r.left + 120) board.scrollLeft -= 12;
      // 몇 번째 칸 위인지는 칸 위치로 (화면이 바뀐 순서를 아직 안 그렸어도 맞게)
      const slots = [...board.querySelectorAll('.col-head[data-sid]')].map(h => h.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      const to = slots.findIndex(b => ev.clientX >= b.left && ev.clientX < b.right);
      if (to < 0 || order[to] === id) return;
      order = order.filter(x => x !== id);
      order.splice(to, 0, id);
      navigator.vibrate?.(8);
      setDrag({ id, order });
    };
    const end = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', end);
      setPressId(null);
      if (order) setDrag(null);
      order = null;
    };
    const drop = () => {
      const done = order;
      end();
      if (done && done.some((x, i) => x !== staff[i]?.id)) {
        setDrag({ id: null, order: done });                                 // 저장되는 동안 바뀐 순서 유지
        setMoved(id);
        setTimeout(() => setMoved(m => (m === id ? null : m)), 1300);
        Promise.resolve(onReorder(done))
          .then(ok => ok !== false && showToast('순서를 바꿨어요'))
          .finally(() => setDrag(null));
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', end);
  };
  // 칸이 자리를 바꿀 때 미끄러지듯 (바뀌기 전 위치에서 새 위치로 옮겨 가는 애니메이션)
  const lastLeft = useRef({});
  const wasDragging = useRef(false);
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const animate = !!drag || wasDragging.current;
    wasDragging.current = !!drag;
    const base = board.getBoundingClientRect().left - board.scrollLeft;
    const k = zoomK();
    const next = {};
    board.querySelectorAll('[data-sid]').forEach(el => {
      const key = (el.classList.contains('col-head') ? 'h' : 'c') + el.dataset.sid;
      const left = el.getBoundingClientRect().left - base;
      next[key] = left;
      const was = lastLeft.current[key];
      if (!animate || was == null || Math.abs(was - left) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateX(${(was - left) / k}px)`;
      requestAnimationFrame(() => { el.style.transition = 'transform .2s ease'; el.style.transform = ''; });
    });
    lastLeft.current = next;
  });
  const dateStr = fmtDate(date);
  const isToday = dateStr === bizToday();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    // 처음에(그리고 운영시간을 불러온 뒤에) 현재 시각(또는 정오) 부근이 보이게 스크롤
    const el = document.querySelector('.board');
    if (!el) return;
    const base = isToday ? Math.floor(nowMinutes() / 60) : 12;
    el.scrollTop = Math.max(0, (base - 1 - startH) * hourPx);
  }, [startH, endH]);

  const open = startH * 60, close = endH * 60;
  const top = m => (m - open) / 60 * hourPx;
  const nowMin = nowMinutes();
  const nowTop = top(nowMin);
  const showNow = isToday && nowMin >= open && nowMin <= close;

  // 담당자 머리글 아래 한 줄 상태 (오늘만)
  const status = s => {
    if (!isToday) return null;
    const st = staffNow(s, list, date, open, close, nowMin, leaves);
    if (st.kind === 'busy') return <small className="ch-busy">시술 중 · {short(st.current.startMin + st.current.durationMin)} 끝</small>;
    if (st.kind === 'free') return <small className="ch-free">비어 있음{st.next ? ` · 다음 ${short(st.next.startMin)}` : ''}</small>;
    if (st.kind === 'before') return <small>{short(st.range[0])} 출근</small>;
    if (st.kind === 'after') return <small>퇴근</small>;
    if (st.kind === 'leave') return <small className="ch-leave">{leaveLabel(st.leave)}</small>;
    return null;
  };

  return (
    <div className={'board' + (drag?.id ? ' sorting' : '')} ref={boardRef}>
      <div className="board-grid"
        style={{ gridTemplateColumns: `var(--timecol, 80px) repeat(${cols.length || 1}, minmax(var(--colmin, 120px), 1fr))` }}>
        <div className="col-head corner" />
        {cols.map(s => (
          <div key={s.id} data-sid={s.id} className={'col-head' + (onReorder ? ' sortable' : '') + (drag?.id === s.id ? ' dragging' : '') + (pressId === s.id ? ' pressing' : '') + (moved === s.id ? ' moved' : '')}
            title={onReorder ? '길게 눌러 끌면 순서를 바꿀 수 있어요' : undefined}
            onPointerDown={e => startPress(e, s.id)} onContextMenu={e => onReorder && e.preventDefault()}>
            <i className="avatar" style={{ '--c': s.dotColor || 'var(--blue)' }}>{s.name.slice(0, 1)}</i>
            <span className="ch-text">
              <b>{s.name}</b>
              {!worksOn(s, date.getDay()) ? <small>휴무</small>
                : leaveOn(leaves, s.id, dateStr).full ? <small className="ch-leave">{leaveLabel(leaveOn(leaves, s.id, dateStr).full)}</small>
                : status(s)}
            </span>
          </div>
        ))}
        <div className="time-col" style={{ minHeight: (endH - startH) * hourPx }}>
          {Array.from({ length: endH - startH }, (_, i) => (
            <span className="time-label" key={i} style={{ top: (i + 1) * hourPx }}>{hourLabel(startH + i + 1)}</span>
          ))}
          {showNow && <span className="now-pill" style={{ top: nowTop }}>{short(nowMin)}</span>}
        </div>
        {cols.map(s => {
          // 휴무 요일·종일 휴가는 칸 전체, 근무시간 밖·시간 지정 휴가는 그 부분만 빗금 + 클릭 막음
          const lv = leaveOn(leaves, s.id, dateStr);
          const off = !worksOn(s, date.getDay()) || !!lv.full;
          const [wo, wc] = workRange(s, open, close);
          const mine = list.filter(r => r.staffId === s.id);
          const lanes = lanesOf(mine);
          const dayOff = !worksOn(s, date.getDay());
          // 오늘이면 지금 이후의 빈 시간만
          const from = isToday ? Math.max(wo, ceilTo(nowMin)) : wo;
          const gaps = off ? [] : freeGaps([...mine, ...leaveBlocks(lv.parts)], [wo, wc], from).filter(([a, b]) => b - a >= 30);
          return (
          <div className={'col' + (off ? ' off' : '') + (drag?.id === s.id ? ' dragging' : '') + (moved === s.id ? ' moved' : '')} key={s.id} data-sid={s.id} style={{ minHeight: (endH - startH) * hourPx }}
            onClick={e => {
              if (off) return;
              // 좌표를 px로 다루면 zoom 배율에서 단위가 섞인다 →
              // 같은 좌표계인 clientY와 rect로 "칸 안에서의 비율"을 구해 시간으로 환산
              // (칸이 화면 끝까지 늘어나 있어도 맞게: 화면 좌표 → 칸 안 CSS px → 30분 단위)
              const rect = e.currentTarget.getBoundingClientRect();
              const y = (e.clientY - rect.top) * (e.currentTarget.offsetHeight / rect.height);
              const slot = open + Math.floor(y / (hourPx / 2)) * 30;
              const min = Math.min(Math.max(slot, open), close - 30);
              if (min < wo || min >= wc || lv.parts.some(p => p.a <= min && min < p.b)) return;
              onCellClick(s.id, min);
            }}>
            {Array.from({ length: endH - startH - 1 }, (_, i) => (
              <i className="hline" key={i} style={{ top: (i + 1) * hourPx }} />
            ))}
            {halfLine && Array.from({ length: endH - startH }, (_, i) => (
              <i className="hline half" key={'h' + i} style={{ top: i * hourPx + hourPx / 2 }} />
            ))}
            {off && <span className={'off-label' + (lv.full ? ' leave' : '')}>{lv.full ? leaveLabel(lv.full) : '휴무'}</span>}
            {!off && lv.parts.map(p => (
              <div key={p.leave.id} className="leave-zone" style={{ top: top(p.a), height: top(p.b) - top(p.a) }}>
                <span>{leaveLabel(p.leave)}</span>
              </div>
            ))}
            {!off && wo > open && <i className="off-zone" style={{ top: 0, height: top(wo) }} />}
            {!off && wc < close && <i className="off-zone" style={{ top: top(wc), bottom: 0 }} />}
            {gaps.map(([a, b]) => {
              const h = top(b) - top(a);
              const avail = isToday && a <= ceilTo(nowMin);
              return (
                <button key={a} type="button" className={'gap' + (avail ? ' avail' : '')}
                  style={{ top: top(a) + 3, height: h - 6 }}
                  aria-label={`${s.name} ${short(a)}부터 빈 ${durLabel(b - a)} 예약하기`}
                  onClick={e => { e.stopPropagation(); onCellClick(s.id, a); }}>
                  {h >= 44 ? <>+ {avail ? '지금 가능 · ' : '빈 '}{durLabel(b - a)}</> : h >= 26 ? '+' : null}
                </button>
              );
            })}
            {mine.map(r => {
              const live = showNow && !r.done && r.startMin <= nowMin && nowMin < r.startMin + r.durationMin;
              const h = r.durationMin / 60 * hourPx - 3;
              // 담당자 휴가·휴무와 겹친 예약: 다른 담당자로 옮기거나 손님께 연락해야 함
              const why = r.done ? '' : hitsLeave(lv, r.startMin, r.durationMin) ? '담당자 휴가' : dayOff ? '담당자 휴무' : '';
              const warn = why ? ' warn' : '';
              const pos = { top: top(r.startMin) + 1, height: h, '--c': s.dotColor || 'var(--blue)', ...laneStyle(lanes[r.id]) };
              if (h < 56) return ( // 짧은 예약(30분 등)은 한 줄로
                <button type="button" key={r.id}
                  className={'resv short' + (r.done ? ' done' : '') + (live ? ' live' : '') + warn + (isNarrow(lanes[r.id]) ? ' narrow' : '')}
                  style={pos} title={why || undefined}
                  onClick={e => { e.stopPropagation(); onBlockClick(r); }}>
                  <small>{r.done && '✓ '}{warn && '⚠ '}<i className="t">{short(r.startMin)}</i></small><b><i className="nm">{r.title}</i>{r.choice && <em className="choice-tag">초이스</em>}</b>
                </button>
              );
              return (
                <button type="button" key={r.id}
                  className={'resv' + (r.done ? ' done' : '') + (live ? ' live' : '') + warn + (isNarrow(lanes[r.id]) ? ' narrow' : '') + (h < 80 ? ' compact' : '')}
                  style={pos}
                  onClick={e => { e.stopPropagation(); onBlockClick(r); }}>
                  <small>{r.done ? '✓ 완료 · ' : why ? `⚠ ${why} · ` : live ? '진행 중 · ' : ''}{short(r.startMin)}–{short(r.startMin + r.durationMin)}</small>
                  <b><i className="nm">{r.title}</i>{r.choice && <em className="choice-tag">초이스</em>}</b>
                  <span>{r.subtitle}</span>
                </button>
              );
            })}
            {showNow && <i className="now-line" style={{ top: nowTop }} />}
          </div>
          );
        })}
      </div>
      {drag?.id && (() => {
        const g = staff.find(s => s.id === drag.id);
        return g && (
          <div ref={ghostRef} className="drag-ghost" style={{ transform: ghostTransform() }} aria-hidden>
            <i className="avatar" style={{ '--c': g.dotColor || 'var(--blue)' }}>{g.name.slice(0, 1)}</i>
            <b>{g.name}</b>
            <small>좌우로 옮겨 놓으세요</small>
          </div>
        );
      })()}
      {toast && <div className="board-toast" role="status">{toast}</div>}
    </div>
  );
}
