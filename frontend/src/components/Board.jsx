import { useEffect, useRef, useState } from 'react';
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

export default function Board({ staff, list, date, startH = START_H, endH = END_H, hourPx: wantPx = HOUR_PX, halfLine = false, leaves = [], onCellClick, onBlockClick }) {
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
    <div className="board" ref={boardRef}>
      <div className="board-grid"
        style={{ gridTemplateColumns: `var(--timecol, 80px) repeat(${staff.length || 1}, minmax(var(--colmin, 120px), 1fr))` }}>
        <div className="col-head corner" />
        {staff.map(s => (
          <div className="col-head" key={s.id}>
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
        {staff.map(s => {
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
          <div className={'col' + (off ? ' off' : '')} key={s.id} style={{ minHeight: (endH - startH) * hourPx }}
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
    </div>
  );
}
