import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, DAYS, minLabel, nim, worksOn, workRange, isActiveOn } from '../lib/constants'; // startH/endH prop 기본값
import { nowMinutes, bizToday, bizNow, leaveOn, hitsLeave, leaveLabel } from '../lib/schedule';
import { Modal, Button } from './ui';
import MiniCalendar from './MiniCalendar';
import Wheel from './Wheel';

// 예약 등록/수정 — 한 화면에서 버튼만 눌러 끝낸다: ① 담당자 ② 메뉴 ③ 시간 ④ 손님
// 메뉴를 시간보다 먼저 고르는 건, 코스 길이를 알아야 "겹치지 않는 시간"을 보여 줄 수 있어서.

// 설정 > 메뉴·가격에서 켜 둔 (메뉴, 시간) 조합 하나하나가 버튼 하나
const optionsOf = menus => menus.flatMap(m =>
  m.durations.map((dur, i) => ({ key: `${m.name}|${dur}`, menu: m.name, dur, price: m.prices?.[i] ?? 0 })));
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

export default function ReservationModal({ init, staff: allStaff, list = [], leaves = [], menus, date: boardDate, startH = START_H, endH = END_H, hidePrice = false, onClose, onSaved }) {
  const options = optionsOf(menus);
  // 수정이면 기존 subtitle("아로마 60분")에서 메뉴를 찾고, 새 예약이면 preferDur 시간의 첫 버튼(없으면 첫 번째 버튼)
  // '타이'와 '타이스톤'처럼 앞이 같은 메뉴가 있어도 헷갈리지 않게: 정확히 같은 이름 → 가장 긴 앞부분 순
  const subtitle = (init.subtitle || '').trim();
  const initMenu = options.find(o => subtitle === `${o.menu} ${o.dur}분`)?.menu
    ?? [...menus].sort((a, b) => b.name.length - a.name.length).find(m => subtitle.startsWith(m.name))?.name;
  const initOpt = init.id
    ? options.find(o => o.menu === initMenu && o.dur === init.durationMin)
    : options.find(o => o.dur === init.preferDur) ?? options[0];

  // 예전 예약인데 지금 메뉴판에 없는 조합이면, 원래 값을 버튼 하나로 남겨 둔다
  const legacy = init.id && !initOpt
    ? { label: init.subtitle || `${init.durationMin}분`, dur: init.durationMin, price: init.price || 0 }
    : null;

  const [form, setForm] = useState(() => ({
    ...init,
    // 새 예약인데 처음 잡힌 담당자가 그 날 종일 휴가거나 휴무면, 일하는 첫 담당자로
    staffId: !init.id && (leaveOn(leaves, Number(init.staffId), fmtDate(boardDate)).full
      || !worksOn(allStaff.find(s => s.id === Number(init.staffId)) ?? {}, boardDate.getDay()))
      ? (allStaff.find(s => isActiveOn(s, fmtDate(boardDate)) && worksOn(s, boardDate.getDay())
          && !leaveOn(leaves, s.id, fmtDate(boardDate)).full)?.id ?? init.staffId)
      : init.staffId,
    pick: initOpt?.key ?? (legacy ? 'legacy' : null),
    dur: initOpt?.dur ?? init.durationMin ?? 60,
    // 수정이면 저장된 금액 그대로(0원도), 새 예약이면 메뉴 가격 — 메뉴를 다시 고르면 그 가격으로
    price: init.id ? (init.price ?? 0) : (initOpt?.price || 0),
    choice: !!init.choice,
  }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  useEffect(() => { api.recentCustomers().then(setRecent).catch(() => {}); }, []);

  // 날짜도 이 창에서 바꿀 수 있다 — 보드 날짜와 다르면 그 날 예약을 따로 불러와 겹침을 본다
  // 수정이면 그 예약의 날짜로 연다 (보드가 다른 날을 보고 있어도 날짜가 바뀌어 저장되지 않게)
  const [date, setDay] = useState(() => {
    if (!init.date) return boardDate;
    const [y, m, d] = init.date.split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  const [dayList, setDayList] = useState(list);
  const dateStr = fmtDate(date);
  useEffect(() => {
    if (dateStr === fmtDate(boardDate)) { setDayList(list); return; } // 보드가 새로 불러오면 겹침 검사도 따라감
    let alive = true;
    api.reservations(dateStr).then(r => alive && setDayList(r)).catch(() => alive && setDayList([]));
    return () => { alive = false; };
  }, [dateStr, list]);
  const staff = allStaff.filter(s => isActiveOn(s, dateStr) || s.id === Number(init.staffId));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pick = o => setForm(f => ({ ...f, pick: o.key, dur: o.dur, price: o.price }));
  const pickLegacy = () => setForm(f => ({ ...f, pick: 'legacy', dur: legacy.dur, price: legacy.price }));
  const picked = options.find(o => o.key === form.pick);
  const start = Number(form.startMin);
  const dur = Number(form.dur);
  const endMin = start + dur;
  const open = startH * 60, close = endH * 60;

  // 같은 담당자의 다른 예약 (수정 중인 자기 자신은 빼고)
  const othersOf = sid => dayList.filter(r => r.staffId === Number(sid) && r.id !== form.id);
  const clash = (sid, a, d) => othersOf(sid).find(r => a < r.startMin + r.durationMin && r.startMin < a + d);
  const lvOf = s => leaveOn(leaves, s.id, dateStr);
  const staffState = s => {
    if (!worksOn(s, date.getDay())) return 'off';
    if (hitsLeave(lvOf(s), start, dur)) return 'leave';
    const [wo, wc] = workRange(s, open, close);
    if (start < wo || endMin > wc) return 'out';
    return clash(s.id, start, dur) ? 'clash' : 'ok';
  };
  const STATE_LABEL = { off: '휴무', leave: '휴가', out: '근무 외', clash: '겹침', ok: '가능' };

  // 새 예약과 담당자 미정이던 예약은 담당자를 여러 명 고를 수 있다 (같은 메뉴·같은 시간 일행). 그 밖의 수정은 한 명
  const group = !form.id || init.staffId == null;
  const [groupIds, setGroupIds] = useState(() => (form.staffId ? [Number(form.staffId)] : []));
  // 담당자 미정: 지금은 비워 두고, 시간이 다가오면 날짜 옆 '담당자 미정'에서 이 창을 다시 열어 고른다
  const [unassigned, setUnassigned] = useState(() => !!init.id && init.staffId == null);
  const chooseUnassigned = () => {
    setUnassigned(true);
    setGroupIds([]);
    setForm(f => ({ ...f, staffId: null, choice: false }));
  };
  const tapStaff = id => {
    setUnassigned(false);
    if (!group) return set('staffId', id);
    const next = groupIds.includes(id) ? groupIds.filter(x => x !== id) : [...groupIds, id];
    setGroupIds(next);
    set('staffId', next[0] ?? null);
  };
  const selIds = group ? groupIds : (form.staffId ? [Number(form.staffId)] : []);
  const sels = selIds.map(id => staff.find(s => s.id === id)).filter(Boolean);
  const multi = sels.length > 1;

  // 시간 고르기: [오전/오후/새벽 | 시 | 분(10분 단위)] 휠 세 줄. 아래 한 줄로 그 시각이 되는지 바로 알려 준다
  const sel = sels[0];
  const [wo, wc] = sel ? workRange(sel, open, close) : [open, close];
  const isToday = dateStr === bizToday();
  const nowMin = nowMinutes();
  // 그 시각 m의 상태: bad(겹침·휴가 — 무엇과 겹치는지) / dim(지났거나 근무 외) — 고른 담당자 모두 기준
  const badAt = m => sels.reduce((hit, s) => hit || clash(s.id, m, dur) || (hitsLeave(lvOf(s), m, dur) && { title: '휴가' }), null);
  const dimAt = m => (isToday && m + 10 <= nowMin) || sels.some(s => {
    const [a, b] = workRange(s, open, close);
    return m < a || m + dur > b || !worksOn(s, date.getDay());
  });
  const hours = [];
  for (let h = Math.floor(open / 60); h * 60 < close; h++) hours.push(h);
  const curH = Math.floor(start / 60), curM = start % 60;
  const minsOf = h => [0, 10, 20, 30, 40, 50].map(mm => h * 60 + mm).filter(m => m >= open && m < close);
  // 휴가(반차·외출) 시간은 아예 못 고른다
  const leaveAt = m => sels.some(s => hitsLeave(lvOf(s), m, dur));
  const pickHour = h => {
    const ms = minsOf(h);
    if (!ms.length) return;
    set('startMin', ms.includes(h * 60 + curM) ? h * 60 + curM : ms[0]);
  };
  // 새벽 = 자정 넘어 영업하는 시간 (24시 이후, 다음날 새벽)
  const halfOf = h => (h >= 24 ? 2 : h >= 12 ? 1 : 0);
  const curHalf = halfOf(curH);
  const halves = ['오전', '오후', '새벽'].map((label, i) => [label, i, hours.filter(h => halfOf(h) === i)])
    .filter(([, , hs]) => hs.length);
  const shownHours = hours.filter(h => halfOf(h) === curHalf);
  const pickHalf = i => {
    if (i === curHalf) return;
    const hs = hours.filter(h => halfOf(h) === i);
    const same = curH % 12 + i * 12; // 2시 ↔ 14시처럼 같은 숫자로
    pickHour(hs.includes(same) ? same : hs[0]);
  };

  // 고른 시각이 되는지 한 줄로: ok(초록) / warn(주황, 저장은 됨) / block(휴가 — 저장 막음)
  const hit = sels.reduce((h, s) => h || clash(s.id, start, dur), null);
  // 수정인데 날짜·시각을 그대로 두었으면 '지난 시각' 안내는 하지 않는다
  const moved = !form.id || dateStr !== init.date || start !== init.startMin;
  const names = list => list.map(s => s.name).join('·');
  const groupStatus = () => {
    const onLeave = sels.filter(s => hitsLeave(lvOf(s), start, dur));
    if (onLeave.length) return { kind: 'block', text: `${names(onLeave)} 휴가 시간이라 예약할 수 없어요 — 빼거나 시각을 바꿔 주세요` };
    const issues = sels.map(s => {
      const st = staffState(s);
      return st === 'ok' ? null : `${s.name} ${{ off: '휴무', clash: '겹침', out: '근무 외' }[st]}`;
    }).filter(Boolean);
    if (issues.length) return { kind: 'warn', text: issues.join(' · ') };
    if (isToday && start + 10 <= nowMin) return { kind: 'warn', text: '이미 지난 시각이에요' };
    return { kind: 'ok', text: `${short(start)}–${short(endMin)} ${sels.length}명 모두 비어 있어요` };
  };
  const status = (start < open || start >= close) ? { kind: 'block', text: `영업시간(${minLabel(open)}–${minLabel(close)}) 밖이라 보드에 보이지 않아요 — 시각을 바꿔 주세요` }
    : endMin > close ? { kind: 'block', text: `마감(${minLabel(close)})을 넘겨서 끝나요 — 더 일찍 시작하거나 짧은 코스로 바꿔 주세요` }
    : unassigned ? (isToday && start + 10 <= nowMin && moved
      ? { kind: 'warn', text: '이미 지난 시각이에요 — 담당자를 정해 주세요' }
      : { kind: 'ok', text: `${short(start)}–${short(endMin)} 담당자 미정 · 나중에 골라요` })
    : !sel ? { kind: 'warn', text: '담당자를 골라 주세요' }
    : multi ? groupStatus()
    : !worksOn(sel, date.getDay()) ? { kind: 'warn', text: `${nim(sel.name)}은 이 날 휴무예요` }
    : leaveAt(start) ? { kind: 'block', text: `${nim(sel.name)} 휴가(${leaveLabel(lvOf(sel).full ?? lvOf(sel).parts.find(p => start < p.b && p.a < endMin).leave)}) 시간이라 예약할 수 없어요` }
    : hit ? { kind: 'warn', text: `${short(hit.startMin)} ${hit.title} 예약과 겹쳐요` }
    : (start < wo || endMin > wc) ? { kind: 'warn', text: `${nim(sel.name)} 근무 시간(${minLabel(wo)}–${minLabel(wc)}) 밖이에요` }
    : isToday && start + 10 <= nowMin && moved ? { kind: 'warn', text: '이미 지난 시각이에요' }
    : { kind: 'ok', text: `${short(start)}–${short(endMin)} ${nim(sel.name)} 비어 있어요` };

  // '빈 시간 보기': 고른 담당자·코스로 바로 넣을 수 있는 시작 시각 (30분 간격 + 지금)
  const [showFree, setShowFree] = useState(false);
  const freeStarts = [];
  if (sels.length && sels.every(s => worksOn(s, date.getDay()))) {
    const lo = Math.max(...sels.map(s => workRange(s, open, close)[0]));
    const hi = Math.min(...sels.map(s => workRange(s, open, close)[1]));
    const from = isToday ? Math.ceil(nowMin / 10) * 10 : lo;
    for (let m = Math.max(lo, from); m + dur <= hi && freeStarts.length < 8; m += (m % 30 ? 10 : 30)) {
      if (!sels.some(s => clash(s.id, m, dur)) && !leaveAt(m)) freeStarts.push(m);
    }
  }
  const [calOpen, setCalOpen] = useState(false);
  const days = [0, 1, 2, 3, 4].map(n => { const d = new Date(bizNow().date); d.setDate(d.getDate() + n); return d; });

  const q = (form.title || '').trim();
  const recentShown = recent.filter(t => t !== q && (!q || t.includes(q))).slice(0, 6);

  const payload = () => ({
    staffId: unassigned ? null : Number(form.staffId),
    date: dateStr,
    startMin: start,
    durationMin: dur,
    title: form.title?.trim() || '고객 등록 필요',
    subtitle: picked ? `${picked.menu} ${picked.dur}분` : (legacy?.label ?? `${form.dur}분`),
    price: Number(form.price) || 0,
    choice: !!form.choice,
  });

  const act = async (fn, day = dateStr) => {
    setBusy(true);
    try { await fn(); onSaved(day); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  // 완료된 예약은 '완료 취소' 말고는 아무것도 바꿀 수 없다
  const locked = !!form.done;
  // 담당자·날짜·시각·길이를 바꿨을 때만 겹침을 다시 묻는다 (일부러 겹쳐 둔 예약의 이름만 고칠 때는 안 물음)
  const slotChanged = !form.id || dateStr !== init.date || start !== init.startMin
    || Number(form.staffId) !== Number(init.staffId) || dur !== init.durationMin;
  // 저장·완료 처리 공통 검사 — 통과하면 true
  const checks = () => {
    if (!form.pick) { setErr('메뉴를 골라 주세요'); return false; }
    if (!sels.length && !unassigned) { setErr('담당자를 골라 주세요'); return false; }
    if (status.kind === 'block') { setErr(status.text); return false; }
    if (hit && slotChanged && !window.confirm(multi
      ? `${names(sels.filter(s => clash(s.id, start, dur)))} 예약과 시간이 겹쳐요. 그래도 저장할까요?`
      : `${short(hit.startMin)} ${hit.title} 예약과 시간이 겹쳐요. 그래도 저장할까요?`)) return false;
    return true;
  };
  const submit = e => {
    e.preventDefault();
    if (locked || !checks()) return;
    if (multi) return act(async () => {
      // 일행: 담당자마다 같은 내용으로 하나씩. 담당자 미정이던 예약이면 그 예약은 첫 담당자로, 나머지는 새로
      const rs = await Promise.allSettled(sels.map((s, i) => (form.id && i === 0
        ? api.updateReservation(form.id, { ...payload(), staffId: s.id })
        : api.createReservation({ ...payload(), staffId: s.id }))));
      const bad = rs.filter(r => r.status === 'rejected');
      if (bad.length) throw new Error(`${sels.length}건 중 ${bad.length}건을 저장하지 못했어요 (${bad[0].reason?.message || bad[0].reason}) — 보드를 확인해 주세요`);
    });
    act(() => (form.id ? api.updateReservation(form.id, payload()) : api.createReservation(payload())));
  };
  // 완료 처리: 고친 내용이 있으면 같이 저장하고 완료 표시 / 완료 취소: 상태만 되돌림
  const toggleDone = () => {
    if (!locked && unassigned) { setErr('담당자를 먼저 정해 주세요'); return; }
    if (!locked && !checks()) return;
    act(async () => {
      if (locked) return api.setReservationDone(form.id, false);
      await api.updateReservation(form.id, payload());
      await api.setReservationDone(form.id, true);
    });
  };

  return (
    <Modal className="rm" title={form.id ? (form.done ? '예약 (완료됨)' : '예약 수정') : '예약 등록'} onClose={onClose}>
      <button type="button" className="rm-close" aria-label="닫기" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <form onSubmit={submit} className="rm-form">
        <div className="rm-body">
          {locked && <p className="m-locked">완료된 예약이라 수정할 수 없어요. 고치려면 먼저 완료 취소하세요.</p>}
          <fieldset className="m-lock" disabled={locked}>

            <section className="rm-sec">
              <div className="rm-sec-head">
                <h3>1. 담당자{group && <span> (일행이면 여러 명)</span>}</h3>
                {multi && <b className="rm-group-count">일행 {sels.length}명</b>}
              </div>
              <div className="rm-staff" role="radiogroup" aria-label="담당자">
                <button type="button" role="radio" aria-checked={unassigned}
                  className={'rm-chip unassigned' + (unassigned ? ' on' : '')} onClick={chooseUnassigned}>
                  <b><span className="rm-chip-name">담당자 미정</span></b>
                  <small>나중에 고름</small>
                </button>
                {staff.map(s => {
                  const st = staffState(s);
                  const on = selIds.includes(s.id);
                  const full = lvOf(s).full; // 종일 휴가면 고를 수 없음
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} disabled={!!full && !on}
                      className={'rm-chip' + (on ? ' on' : '') + ' st-' + st}
                      onClick={() => tapStaff(s.id)}>
                      <b><i className="dot" style={{ background: s.dotColor || 'var(--blue)' }} /><span className="rm-chip-name">{s.name}</span></b>
                      <small>{full ? (full.reason || '휴가') : STATE_LABEL[st]}</small>
                    </button>
                  );
                })}
              </div>
              {/* 손님이 담당자를 직접 고른 예약 — 담당자 인센이 더 붙어서 따로 기록
                  담당자 미정이면 고를 수 없음 (줄은 그대로 두어 담당자를 바꿔도 창 높이가 변하지 않게) */}
              <button type="button" role="switch" aria-checked={!!form.choice} disabled={unassigned}
                className={'rm-choice' + (form.choice ? ' on' : '')} onClick={() => set('choice', !form.choice)}>
                <span><b>초이스</b><small>{unassigned ? '담당자를 정하면 고를 수 있어요' : multi ? `고른 ${sels.length}명 모두 손님이 직접 골랐어요` : `손님이 ${sel ? nim(sel.name) : '담당자'}을 직접 골랐어요`}</small></span>
                <i className={'switch' + (form.choice ? ' on' : '')} aria-hidden="true"><i /></i>
              </button>
            </section>

            <section className="rm-sec">
              <h3>2. 메뉴</h3>
              {options.length === 0 && !legacy
                ? <p className="m-empty">설정 → 매장 운영에서 메뉴를 먼저 추가하세요</p>
                : (
                  <div className="menu-pick" role="radiogroup" aria-label="메뉴와 시간">
                    {legacy && (
                      <button type="button" role="radio" aria-checked={form.pick === 'legacy'}
                        className={'menu-opt' + (form.pick === 'legacy' ? ' on' : '')} onClick={pickLegacy}>
                        <b>{legacy.label}</b><small>지금 메뉴판에 없음</small>
                      </button>
                    )}
                    {options.map(o => (
                      <button key={o.key} type="button" role="radio" aria-checked={o.key === form.pick}
                        className={'menu-opt' + (o.key === form.pick ? ' on' : '')} onClick={() => pick(o)}>
                        <b>{o.menu} {o.dur}분</b>
                        {/* 가격이 없어도 같은 높이가 되도록 빈 줄 자리를 남긴다 */}
                        {!hidePrice && (o.price > 0
                          ? <small>{o.price.toLocaleString()}원</small>
                          : <small className="no-price">가격 미정</small>)}
                      </button>
                    ))}
                  </div>
                )}
            </section>

            <section className="rm-sec">
              <div className="rm-sec-head">
                <h3>3. 날짜 · 시간</h3>
                <b className="rm-picked">{date.getMonth() + 1}/{date.getDate()}({DAYS[date.getDay()]}) {minLabel(start)}</b>
              </div>
              <div className="rm-days">
                {days.map((d, n) => {
                  const on = fmtDate(d) === dateStr;
                  return (
                    <button key={n} type="button" className={'rm-dday' + (on ? ' on' : '')} aria-pressed={on}
                      onClick={() => { setDay(d); setCalOpen(false); }}>
                      <span className={d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}>
                        {n === 0 ? '오늘' : n === 1 ? '내일' : DAYS[d.getDay()]}
                      </span>
                      <b>{d.getDate()}</b>
                    </button>
                  );
                })}
                <button type="button" className={'rm-dday cal' + (calOpen || !days.some(d => fmtDate(d) === dateStr) ? ' on' : '')}
                  aria-label="다른 날짜 고르기" aria-expanded={calOpen} onClick={() => setCalOpen(o => !o)}>
                  {days.some(d => fmtDate(d) === dateStr)
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    : <><span>{date.getMonth() + 1}월</span><b>{date.getDate()}</b></>}
                </button>
              </div>
              {calOpen && (
                <div className="rm-cal">
                  <MiniCalendar selected={date} onSelect={d => { setDay(d); setCalOpen(false); }} />
                </div>
              )}

              <div className="rm-wheels">
                <i className="rm-wheel-band" aria-hidden="true" />
                <Wheel label="오전 오후" value={curHalf} onChange={pickHalf}
                  items={halves.map(([label, i]) => ({ value: i, label }))} />
                <Wheel label="시" value={curH} onChange={pickHour}
                  items={shownHours.map(h => ({
                    value: h, label: String(((h + 11) % 12) + 1),
                    cls: minsOf(h).every(leaveAt) ? 'leave' : minsOf(h).every(m => badAt(m) || dimAt(m)) ? 'dim' : '',
                  }))} />
                <Wheel label="분" value={curM} onChange={mm => set('startMin', curH * 60 + mm)}
                  items={minsOf(curH).map(m => ({
                    value: m % 60, label: String(m % 60).padStart(2, '0'),
                    cls: leaveAt(m) ? 'leave' : badAt(m) ? 'bad' : dimAt(m) ? 'dim' : '',
                  }))} />
              </div>

              <div className={'rm-status ' + status.kind}>
                <span>{status.kind === 'ok' ? '✓ ' : '⚠ '}{status.text}</span>
                {/* 담당자가 없을 때도 자리는 남겨 둔다 — 담당자를 바꿀 때 줄 높이가 변하지 않게 */}
                <button type="button" onClick={() => setShowFree(v => !v)} aria-expanded={showFree}
                  disabled={!sel} tabIndex={sel ? undefined : -1} style={sel ? undefined : { visibility: 'hidden' }}>
                  {showFree ? '접기' : '빈 시간 보기'}
                </button>
              </div>
              {showFree && sel && (
                <div className="rm-free">
                  {freeStarts.length === 0 && <span className="m-empty">이 날 {dur}분 비는 시간이 없어요</span>}
                  {freeStarts.map(m => (
                    <button key={m} type="button" className={m === start ? 'on' : ''} onClick={() => set('startMin', m)}>
                      {minLabel(m).replace(/^(오전|오후|새벽) /, '$1\n')}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rm-sec">
              <h3>4. 손님 <span>(선택)</span></h3>
              <label className="sr-only" htmlFor="rm-title">손님 이름 또는 메모</label>
              <input id="rm-title" className="rm-input" value={form.title || ''} onChange={e => set('title', e.target.value)}
                placeholder="이름 또는 메모 — 비우면 '고객 등록 필요'" maxLength={30} autoComplete="off" />
              {recentShown.length > 0 && (
                <div className="rm-recent">
                  <span>최근 손님</span>
                  {recentShown.map(t => (
                    <button key={t} type="button" onClick={() => set('title', t)}>{t}</button>
                  ))}
                </div>
              )}
            </section>
          </fieldset>
        </div>

        <div className="rm-foot">
          {err && <p className="m-err">{err}</p>}
          <div className="rm-summary">
            <span>{unassigned ? '담당자 미정' : multi ? `${names(sels)} (${sels.length}명)` : (sel?.name ?? '담당자 미선택')}{form.choice && <em className="choice-tag">초이스</em>} · {minLabel(start)}–{short(endMin)}</span>
            {!hidePrice && Number(form.price) > 0 && <b>{multi ? `1인 ${Number(form.price).toLocaleString()}원 × ${sels.length}명` : `${Number(form.price).toLocaleString()}원`}</b>}
          </div>
          {form.id && (
            <Button className={'done-btn' + (form.done ? ' is-done' : '')} onClick={toggleDone} disabled={busy || (!locked && (unassigned || multi))}
              title={unassigned && !locked ? '담당자를 정하면 완료할 수 있어요' : undefined}>
              {form.done ? '완료 취소' : '✓ 완료 처리'}
            </Button>
          )}
          <div className="m-actions">
            {form.id && <Button variant="danger" onClick={() => window.confirm('이 예약을 삭제할까요?') && act(() => api.deleteReservation(form.id), init.date)} disabled={busy || locked}>삭제</Button>}
            <Button onClick={onClose} disabled={busy}>{locked ? '닫기' : '취소'}</Button>
            <Button variant="primary" type="submit" disabled={busy || locked}>{multi ? `${sels.length}명 예약 저장` : form.id ? '저장' : '예약 저장'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
