import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, DAYS, minLabel, worksOn, workRange, isActiveOn } from '../lib/constants'; // startH/endH prop 기본값
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
  const initMenu = menus.find(m => (init.subtitle || '').startsWith(m.name))?.name;
  const initOpt = init.id
    ? options.find(o => o.menu === initMenu && o.dur === init.durationMin)
    : options.find(o => o.dur === init.preferDur) ?? options[0];

  // 예전 예약인데 지금 메뉴판에 없는 조합이면, 원래 값을 버튼 하나로 남겨 둔다
  const legacy = init.id && !initOpt
    ? { label: init.subtitle || `${init.durationMin}분`, dur: init.durationMin, price: init.price || 0 }
    : null;

  const [form, setForm] = useState(() => ({
    ...init,
    // 새 예약인데 처음 잡힌 담당자가 그 날 종일 휴가면, 휴가 아닌 첫 담당자로
    staffId: !init.id && leaveOn(leaves, Number(init.staffId), fmtDate(boardDate)).full
      ? (allStaff.find(s => isActiveOn(s, fmtDate(boardDate)) && worksOn(s, boardDate.getDay())
          && !leaveOn(leaves, s.id, fmtDate(boardDate)).full)?.id ?? init.staffId)
      : init.staffId,
    pick: initOpt?.key ?? (legacy ? 'legacy' : null),
    dur: initOpt?.dur ?? init.durationMin ?? 60,
    // 저장된 금액이 없으면(새 예약·과거 0원 예약) 메뉴 가격으로
    price: init.price || initOpt?.price || 0,
  }));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  useEffect(() => { api.recentCustomers().then(setRecent).catch(() => {}); }, []);

  // 날짜도 이 창에서 바꿀 수 있다 — 보드 날짜와 다르면 그 날 예약을 따로 불러와 겹침을 본다
  const [date, setDay] = useState(boardDate);
  const [dayList, setDayList] = useState(list);
  const dateStr = fmtDate(date);
  useEffect(() => {
    if (dateStr === fmtDate(boardDate)) { setDayList(list); return; }
    let alive = true;
    api.reservations(dateStr).then(r => alive && setDayList(r)).catch(() => alive && setDayList([]));
    return () => { alive = false; };
  }, [dateStr]);
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

  // 시간 고르기: [오전/오후/새벽 | 시 | 분(10분 단위)] 휠 세 줄. 아래 한 줄로 그 시각이 되는지 바로 알려 준다
  const sel = staff.find(s => s.id === Number(form.staffId));
  const [wo, wc] = sel ? workRange(sel, open, close) : [open, close];
  const isToday = dateStr === bizToday();
  const nowMin = nowMinutes();
  // 그 시각 m의 상태: bad(겹침·휴가 — 무엇과 겹치는지) / dim(지났거나 근무 외)
  const badAt = m => sel && (clash(sel.id, m, dur) || (hitsLeave(lvOf(sel), m, dur) && { title: '휴가' }));
  const dimAt = m => (isToday && m + 10 <= nowMin) || (sel && (m < wo || m + dur > wc || !worksOn(sel, date.getDay())));
  const hours = [];
  for (let h = Math.floor(open / 60); h * 60 < close; h++) hours.push(h);
  const curH = Math.floor(start / 60), curM = start % 60;
  const minsOf = h => [0, 10, 20, 30, 40, 50].map(mm => h * 60 + mm).filter(m => m >= open && m < close);
  // 휴가(반차·외출) 시간은 아예 못 고른다
  const leaveAt = m => !!sel && hitsLeave(lvOf(sel), m, dur);
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
  const hit = sel && clash(sel.id, start, dur);
  const status = !sel ? { kind: 'warn', text: '담당자를 골라 주세요' }
    : !worksOn(sel, date.getDay()) ? { kind: 'warn', text: `${sel.name}님은 이 날 휴무예요` }
    : leaveAt(start) ? { kind: 'block', text: `${sel.name}님 휴가(${leaveLabel(lvOf(sel).full ?? lvOf(sel).parts.find(p => start < p.b && p.a < endMin).leave)}) 시간이라 예약할 수 없어요` }
    : hit ? { kind: 'warn', text: `${short(hit.startMin)} ${hit.title} 예약과 겹쳐요` }
    : (start < wo || endMin > wc) ? { kind: 'warn', text: `${sel.name}님 근무 시간(${short(wo)}–${short(wc)}) 밖이에요` }
    : isToday && start + 10 <= nowMin && !form.id ? { kind: 'warn', text: '이미 지난 시각이에요' }
    : { kind: 'ok', text: `${short(start)}–${short(endMin)} ${sel.name}님 비어 있어요` };

  // '빈 시간 보기': 고른 담당자·코스로 바로 넣을 수 있는 시작 시각 (30분 간격 + 지금)
  const [showFree, setShowFree] = useState(false);
  const freeStarts = [];
  if (sel && worksOn(sel, date.getDay())) {
    const from = isToday ? Math.ceil(nowMin / 10) * 10 : wo;
    for (let m = Math.max(wo, from); m + dur <= wc && freeStarts.length < 8; m += (m % 30 ? 10 : 30)) {
      if (!clash(sel.id, m, dur) && !leaveAt(m)) freeStarts.push(m);
    }
  }
  const [calOpen, setCalOpen] = useState(false);
  const days = [0, 1, 2, 3, 4].map(n => { const d = new Date(bizNow().date); d.setDate(d.getDate() + n); return d; });

  const q = (form.title || '').trim();
  const recentShown = recent.filter(t => t !== q && (!q || t.includes(q))).slice(0, 6);

  const payload = () => ({
    staffId: Number(form.staffId),
    date: dateStr,
    startMin: start,
    durationMin: dur,
    title: form.title?.trim() || '고객 등록 필요',
    subtitle: picked ? `${picked.menu} ${picked.dur}분` : (legacy?.label ?? `${form.dur}분`),
    price: Number(form.price) || 0,
  });

  const act = async fn => {
    setBusy(true);
    try { await fn(); onSaved(dateStr); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  // 완료된 예약은 '완료 취소' 말고는 아무것도 바꿀 수 없다
  const locked = !!form.done;
  const submit = e => {
    e.preventDefault();
    if (locked) return;
    if (!form.pick) return setErr('메뉴를 골라 주세요');
    if (!form.staffId) return setErr('담당자를 골라 주세요');
    if (status.kind === 'block') return setErr(status.text);
    act(() => (form.id ? api.updateReservation(form.id, payload()) : api.createReservation(payload())));
  };
  // 완료 처리: 고친 내용이 있으면 같이 저장하고 완료 표시 / 완료 취소: 상태만 되돌림
  const toggleDone = () => act(async () => {
    if (locked) return api.setReservationDone(form.id, false);
    await api.updateReservation(form.id, payload());
    await api.setReservationDone(form.id, true);
  });

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
              <h3>1. 담당자</h3>
              <div className="rm-staff" role="radiogroup" aria-label="담당자">
                {staff.map(s => {
                  const st = staffState(s);
                  const on = s.id === Number(form.staffId);
                  const full = lvOf(s).full; // 종일 휴가면 고를 수 없음
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on} disabled={!!full && !on}
                      className={'rm-chip' + (on ? ' on' : '') + ' st-' + st}
                      onClick={() => set('staffId', s.id)}>
                      <b><i className="dot" style={{ background: s.dotColor || 'var(--blue)' }} />{s.name}</b>
                      <small>{full ? (full.reason || '휴가') : STATE_LABEL[st]}</small>
                    </button>
                  );
                })}
              </div>
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
                          : <small className="blank" aria-hidden="true">0원</small>)}
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
                {sel && (
                  <button type="button" onClick={() => setShowFree(v => !v)} aria-expanded={showFree}>
                    {showFree ? '접기' : '빈 시간 보기'}
                  </button>
                )}
              </div>
              {showFree && (
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
            <span>{sel?.name ?? '담당자 미선택'} · {minLabel(start)}–{short(endMin)}</span>
            {!hidePrice && Number(form.price) > 0 && <b>{Number(form.price).toLocaleString()}원</b>}
          </div>
          {form.id && (
            <Button className={'done-btn' + (form.done ? ' is-done' : '')} onClick={toggleDone} disabled={busy}>
              {form.done ? '완료 취소' : '✓ 완료 처리'}
            </Button>
          )}
          <div className="m-actions">
            {form.id && <Button variant="danger" onClick={() => window.confirm('이 예약을 삭제할까요?') && act(() => api.deleteReservation(form.id))} disabled={busy || locked}>삭제</Button>}
            <Button onClick={onClose} disabled={busy}>{locked ? '닫기' : '취소'}</Button>
            <Button variant="primary" type="submit" disabled={busy || locked}>{form.id ? '저장' : '예약 저장'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
