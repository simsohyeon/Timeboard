import { useEffect, useRef, useState } from 'react';
import { fmtDate } from '../api';
import { START_H, END_H, HOUR_PX, DAYS, hourLabel, worksOn, workRange } from '../lib/constants';
import { freeGaps, durLabel, nowMinutes, bizToday, ceilTo, staffNow, leaveOn, leaveBlocks, hitsLeave, leaveLabel, canTake, groupUnassigned } from '../lib/schedule';

// 예약 보드: 가로 = 담당자, 세로 = 시간.
// 30분 이상 빈 시간은 점선 칸으로 보여 주고, 누르면 그 시각으로 바로 예약 등록.
// 받침에 따라 조사: josa('휴무', '로', '으로') → '휴무로', josa('개인 사정', '을', '를') 처럼 (받침 있음, 없음)
const josa = (w, withJong, noJong) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  const jong = c >= 0 && c < 11172 ? c % 28 : 0;
  if (withJong === '으로') return w + (jong && jong !== 8 ? '으로' : '로');   // ㄹ 받침은 '로'
  return w + (jong ? withJong : noJong);
};
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

export default function Board({ staff, list, date, startH = START_H, endH = END_H, hourPx: wantPx = HOUR_PX, halfLine = false, leaves = [], onCellClick, onBlockClick, onReorder, onDayOff, onCancelLeave, onUnassigned, onAssign }) {
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

  // 담당자 머리글: 짧게 누르기(또는 우클릭) = 그날 휴무 메뉴, 길게 눌러 끌기 = 순서 바꾸기 (터치·마우스 공통)
  // 누르는 동안 머리글이 파랗게 차오름 → 들리면 이름표가 손가락을 따라오고, 다른 칸은 흐려지며 칸이 바로 자리를 바꿈
  // → 놓으면 옮긴 칸이 반짝하고 '순서를 바꿨어요'
  const [drag, setDrag] = useState(null); // { id: 끄는 담당자, order: [id...] }
  const [pressId, setPressId] = useState(null); // 길게 누르는 중
  const [moved, setMoved] = useState(null);     // 방금 옮긴 담당자
  const [toast, setToast] = useState(null); // { text, undo? }
  const [menu, setMenu] = useState(null);       // 휴무 메뉴 { id, x, y }
  const lastPointer = useRef('mouse');
  useEffect(() => {
    if (!menu) return;
    const esc = e => e.key === 'Escape' && setMenu(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [menu]);
  const ghostRef = useRef(null);
  const ghostAt = useRef({ x: 0, y: 0 });
  const idsKey = staff.map(s => s.id).join();
  useEffect(() => setDrag(null), [idsKey]);
  const cols = drag ? drag.order.map(id => staff.find(s => s.id === id)).filter(Boolean) : staff;
  // 글자 크기 설정(zoom) 안에서는 화면 좌표를 배율로 나눠야 손가락 위치와 맞는다
  const zoomK = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')) || 1;
  const ghostTransform = () => { const k = zoomK(); return `translate(${ghostAt.current.x / k}px, ${ghostAt.current.y / k}px) translate(-50%, -135%)`; };
  const showToast = (text, undo) => {
    setToast({ text, undo });
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(null), undo ? 5000 : 1800);
  };
  const startPress = (e, id) => {
    lastPointer.current = e.pointerType;
    if (e.button > 0) return;
    const canDrag = onReorder && staff.length > 1;
    const x0 = e.clientX, y0 = e.clientY;
    let order = null; // 길게 눌러 끌기가 시작되면 [id...]
    if (canDrag) setPressId(id);
    const timer = canDrag && setTimeout(() => {
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
      // 사파리는 글자 크기(zoom)가 걸리면 칸 위치를 손가락 좌표보다 작은 단위로 준다 — 같은 단위로 맞춘다 (크롬은 1)
      const unit = innerWidth / (document.body.getBoundingClientRect().width || innerWidth);
      const x = ev.clientX / unit;
      const r = board.getBoundingClientRect();
      if (x > r.right - 40) board.scrollLeft += 12;                      // 화면 끝으로 끌면 옆으로 넘김
      else if (x < r.left + 120) board.scrollLeft -= 12;
      // 몇 번째 칸 위인지는 칸 위치로 (화면이 바뀐 순서를 아직 안 그렸어도 맞게)
      const slots = [...board.querySelectorAll('.col-head[data-sid]')].map(h => h.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      const to = slots.findIndex(b => x >= b.left && x < b.right);
      if (to < 0 || order[to] === id) return;
      // 옆 칸 안쪽(폭의 1/4 이상)까지 들어가야 바꾼다 — 경계에서 손이 떨려도 왔다갔다 하지 않게
      const edge = (slots[to].right - slots[to].left) / 4;
      if (x < slots[to].left + edge || x > slots[to].right - edge) return;
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
      if (!done && onDayOff) setMenu({ id, x: x0, y: y0 });               // 짧게 누름 → 휴무 메뉴
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
  const dateStr = fmtDate(date);
  const isToday = dateStr === bizToday();
  const unList = groupUnassigned(list); // 일행(여러 명)은 카드 하나로, 누를 때마다 한 명씩
  // 흐린 카드를 누르면 바로 그 담당자에게 — 잘못 눌렀으면 알림의 '되돌리기'
  const assign = (r, s) => Promise.resolve(onAssign(r, s.id)).then(ok => {
    if (ok === false) return;
    setMoved(s.id);
    setTimeout(() => setMoved(m => (m === s.id ? null : m)), 1300);
    showToast(`${short(r.startMin)} ${r.title} → ${s.name}에게 맡겼어요`, () => onAssign(r, null));
  });
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
    <div className={'board' + (drag?.id ? ' sorting' : '') + (menu ? ' menu-open' : '')} ref={boardRef}>
      <div className="board-grid"
        style={{ gridTemplateColumns: `var(--timecol, 80px) repeat(${cols.length || 1}, minmax(var(--colmin, 120px), 1fr))` }}>
        <div className="col-head corner" />
        {cols.map(s => (
          <div key={s.id} data-sid={s.id} className={'col-head' + (onReorder ? ' sortable' : '') + (drag?.id === s.id ? ' dragging' : '') + (pressId === s.id ? ' pressing' : '') + (moved === s.id ? ' moved' : '')}
            data-tip={onReorder ? '탭: 휴무 설정\n길게 끌기: 순서 변경' : undefined}
            onPointerDown={e => startPress(e, s.id)}
            onContextMenu={e => {
              if (!onReorder && !onDayOff) return;
              e.preventDefault();                                              // 길게 누를 때 뜨는 기본 메뉴 막기
              if (onDayOff && lastPointer.current === 'mouse') setMenu({ id: s.id, x: e.clientX, y: e.clientY }); // 우클릭
            }}>
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
          {/* 담당자 미정 예약: 그 시각 아래 '미정 n' (30분 안으로 다가오면 주황). 누르면 날짜 옆 목록이 열린다 */}
          {Object.entries(list.filter(r => r.staffId == null).reduce((acc, r) => {
            const h = Math.floor(r.startMin / 60);
            (acc[h] ??= []).push(r);
            return acc;
          }, {})).map(([h, rs]) => {
            const urgent = isToday && rs.some(r => r.startMin - nowMin <= 30);
            return (
              <button key={h} type="button" className={'un-mark' + (urgent ? ' soon' : '')}
                style={{ top: top(Math.max(open, h * 60)) + 10 }} onClick={onUnassigned}
                aria-label={`${short(h * 60)}시대 담당자 미정 예약 ${rs.length}건`}>미정 {rs.length}</button>
            );
          })}
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
          // 담당자 미정 예약 중 이 사람이 맡을 수 있는 것: 이 칸에 흐린 카드로, 누르면 이 사람에게 배정
          const ghosts = onAssign ? unList.filter(r => canTake(s, r, list, leaves, dateStr, date.getDay(), open, close)) : [];
          // 시간이 겹치는 미정 예약끼리는 한 덩어리 — 칸을 나란히 쪼개면 이름이 '최…'처럼 잘려서,
          // 덩어리 하나에 카드 한 장, 그 안에 손님마다 한 줄 (줄을 누르면 그 손님을 이 담당자에게)
          const clusters = [];
          for (const r of [...ghosts].sort((a, b) => a.startMin - b.startMin)) {
            const c = clusters[clusters.length - 1];
            if (c && r.startMin < c.end) { c.items.push(r); c.end = Math.max(c.end, r.startMin + r.durationMin); }
            else clusters.push({ start: r.startMin, end: r.startMin + r.durationMin, items: [r] });
          }
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
            {clusters.map(c => {
              const h = (c.end - c.start) / 60 * hourPx - 3;
              if (c.items.length === 1) return null;
              const space = h - 8;                                        // 위아래 여백 뺀 높이, 한 줄 = 26px
              const head = c.items.length * 26 + 19 <= space;              // 줄이 다 들어가고도 남으면 위에 '미정 n팀 · 시각'
              const cap = Math.max(1, Math.floor(space / 26));
              const shown = c.items.length > cap ? c.items.slice(0, cap - 1) : c.items;
              const more = c.items.length - shown.length;
              return (
                <div key={'gc' + c.start} className="resv ghost cluster" role="group"
                  aria-label={`담당자 미정 ${c.items.length}팀 ${short(c.start)}–${short(c.end)}`}
                  style={{ top: top(c.start) + 1, height: h }} onClick={e => e.stopPropagation()}>
                  {head && <small>미정 {c.items.length}팀 · {short(c.start)}–{short(c.end)}</small>}
                  {shown.map(r => (
                    <button type="button" key={r.id} className="gh-row"
                      aria-label={`${short(r.startMin)} ${r.title} — ${s.name}에게 맡기기`}
                      onClick={e => { e.stopPropagation(); assign(r, s); }}>
                      <i className="gh-nm">{r.title}</i>
                      {r.count > 1 && <em>{r.count}<span className="gh-u">명</span></em>}
                      {r.startMin !== c.start && <small>{short(r.startMin)}</small>}
                    </button>
                  ))}
                  {more > 0 && (
                    <button type="button" className="gh-row more" onClick={e => { e.stopPropagation(); onUnassigned?.(); }}>
                      {shown.length ? `+${more}건 더보기` : `미정 ${more}팀 보기`}
                    </button>
                  )}
                </div>
              );
            })}
            {clusters.filter(c => c.items.length === 1).map(({ items: [r] }) => {
              const h = r.durationMin / 60 * hourPx - 3;
              return (
                <button type="button" key={'g' + r.id}
                  className={'resv ghost' + (h < 56 ? ' short' : h < 80 ? ' compact' : '')}
                  style={{ top: top(r.startMin) + 1, height: h }}
                  aria-label={`담당자 미정 ${short(r.startMin)} ${r.title} — ${s.name}에게 맡기기`}
                  onClick={e => { e.stopPropagation(); assign(r, s); }}>
                  <small>미정{r.count > 1 ? ` ${r.count}명` : ''} · {short(r.startMin)}–{short(r.startMin + r.durationMin)}</small>
                  <b><i className="nm">{r.title}</i></b>
                  {h >= 56 && <span>미정{r.count > 1 ? ` ${r.count}명` : ''} · 눌러서 {s.name}에게</span>}
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
      {menu && (() => {
        const s = staff.find(x => x.id === menu.id);
        if (!s) return null;
        const k = zoomK();
        const left = Math.max(8, Math.min(menu.x, innerWidth - 270 * k)) / k;
        const top = Math.max(8, Math.min(menu.y + 8, innerHeight - 300 * k)) / k;
        const { full } = leaveOn(leaves, s.id, dateStr);
        const weekOff = !worksOn(s, date.getDay());
        const count = list.filter(r => r.staffId === s.id).length;
        const day = `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAYS[date.getDay()]})`;
        const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
        // 휴무를 넣거나 빼면 칸이 오른쪽 끝(또는 원래 자리)으로 옮겨지니, 옮겨 간 칸을 반짝여 보여 준다
        const act = (job, msg) => {
          setMenu(null);
          Promise.resolve(job()).then(ok => {
            if (ok === false) return;
            showToast(msg);
            setMoved(s.id);
            setTimeout(() => setMoved(m => (m === s.id ? null : m)), 1300);
          });
        };
        return (<>
          <div className="staff-menu-scrim" onPointerDown={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
          <div className="staff-menu" role="menu" style={{ left, top }}>
            <div className="sm-head"><b>{s.name}</b><small>{day}</small></div>
            {weekOff && <p className="sm-note">매주 {DAYS[date.getDay()]}요일은 쉬는 날이에요 (설정 › 담당자에서 바꿔요)</p>}
            {full ? (<>
              <p className="sm-now">{leaveLabel(full)}{full.startDate !== full.endDate && ` · ${md(full.startDate)}~${md(full.endDate)}`}</p>
              {full.startDate === full.endDate
                ? <button type="button" role="menuitem" className="sm-cancel" onClick={() => act(() => onCancelLeave(full.id), `${s.name} ${josa(leaveLabel(full), '을', '를')} 취소했어요`)}>{leaveLabel(full)} 취소</button>
                : <p className="sm-note">여러 날 휴가는 설정 › 담당자에서 바꿀 수 있어요</p>}
            </>) : (<>
              <p className="sm-label">이날 하루 쉬기</p>
              <div className="sm-reasons">
                {['휴무', '연차', '병가', '개인 사정'].map(r => (
                  <button key={r} type="button" role="menuitem" onClick={() => act(() => onDayOff(s.id, r), `${s.name} ${day} ${josa(r, '으로')} 했어요`)}>{r}</button>
                ))}
              </div>
              {count > 0 && <p className="sm-warn">⚠ 이날 예약 {count}건이 있어요 — 쉬게 하면 예약에 경고가 떠요</p>}
            </>)}
          </div>
        </>);
      })()}
      {toast && (
        <div className="board-toast" role="status">
          {toast.text}
          {toast.undo && (
            <button type="button" onClick={() => { const u = toast.undo; setToast(null); Promise.resolve(u()).then(ok => ok !== false && showToast('되돌렸어요')); }}>되돌리기</button>
          )}
        </div>
      )}
    </div>
  );
}
