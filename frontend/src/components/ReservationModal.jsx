import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, minLabel, worksOn, workRange } from '../lib/constants'; // startH/endH prop 기본값
import { nowMinutes, leaveOn, hitsLeave, leaveLabel } from '../lib/schedule';
import { Modal, Button, Select } from './ui';

// 예약 등록/수정 — 한 화면에서 버튼만 눌러 끝낸다: ① 담당자 ② 메뉴 ③ 시간 ④ 손님
// 메뉴를 시간보다 먼저 고르는 건, 코스 길이를 알아야 "겹치지 않는 시간"을 보여 줄 수 있어서.

// 설정 > 메뉴·가격에서 켜 둔 (메뉴, 시간) 조합 하나하나가 버튼 하나
const optionsOf = menus => menus.flatMap(m =>
  m.durations.map((dur, i) => ({ key: `${m.name}|${dur}`, menu: m.name, dur, price: m.prices?.[i] ?? 0 })));
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

export default function ReservationModal({ init, staff, list = [], leaves = [], menus, date, startH = START_H, endH = END_H, hidePrice = false, onClose, onSaved }) {
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

  const [form, setForm] = useState({
    ...init,
    pick: initOpt?.key ?? (legacy ? 'legacy' : null),
    dur: initOpt?.dur ?? init.durationMin ?? 60,
    // 저장된 금액이 없으면(새 예약·과거 0원 예약) 메뉴 가격으로
    price: init.price || initOpt?.price || 0,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  useEffect(() => { api.recentCustomers().then(setRecent).catch(() => {}); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pick = o => setForm(f => ({ ...f, pick: o.key, dur: o.dur, price: o.price }));
  const pickLegacy = () => setForm(f => ({ ...f, pick: 'legacy', dur: legacy.dur, price: legacy.price }));
  const picked = options.find(o => o.key === form.pick);
  const start = Number(form.startMin);
  const dur = Number(form.dur);
  const endMin = start + dur;
  const open = startH * 60, close = endH * 60;

  // 같은 담당자의 다른 예약 (수정 중인 자기 자신은 빼고)
  const othersOf = sid => list.filter(r => r.staffId === Number(sid) && r.id !== form.id);
  const clash = (sid, a, d) => othersOf(sid).find(r => a < r.startMin + r.durationMin && r.startMin < a + d);
  const lvOf = s => leaveOn(leaves, s.id, fmtDate(date));
  const staffState = s => {
    if (!worksOn(s, date.getDay())) return 'off';
    if (hitsLeave(lvOf(s), start, dur)) return 'leave';
    const [wo, wc] = workRange(s, open, close);
    if (start < wo || endMin > wc) return 'out';
    return clash(s.id, start, dur) ? 'clash' : 'ok';
  };
  const STATE_LABEL = { off: '휴무', leave: '휴가', out: '근무 외', clash: '겹침', ok: '가능' };

  // 시간 버튼: 고른 담당자 근무시간 안에서 30분 간격. 오늘이면 지난 시각은 숨김 (고른 시각은 항상 보임)
  const sel = staff.find(s => s.id === Number(form.staffId));
  const [wo, wc] = sel ? workRange(sel, open, close) : [open, close];
  const isToday = fmtDate(date) === fmtDate(new Date());
  const from = isToday && !form.id ? nowMinutes() : wo;
  const times = [];
  for (let m = Math.ceil(Math.max(wo, from) / 30) * 30; m + dur <= wc; m += 30) times.push(m);
  if (!times.includes(start)) { times.push(start); times.sort((a, b) => a - b); }
  const exact = []; // 30분 단위가 아닌 시각은 '다른 시각'에서 10분 단위로
  for (let m = open; m < close; m += 10) exact.push(m);

  const hit = sel && clash(sel.id, start, dur);
  const warn = !sel ? '' :
    !worksOn(sel, date.getDay()) ? `${sel.name}님은 이 날 휴무예요`
    : hitsLeave(lvOf(sel), start, dur) ? `${sel.name}님 휴가(${leaveLabel(lvOf(sel).full ?? lvOf(sel).parts.find(p => start < p.b && p.a < endMin).leave)}) 시간이에요`
    : hit ? `${short(hit.startMin)} ${hit.title} 예약과 겹쳐요`
    : (start < wo || endMin > wc) ? `${sel.name}님 근무 시간(${short(wo)}–${short(wc)}) 밖이에요`
    : '';

  const q = (form.title || '').trim();
  const recentShown = recent.filter(t => t !== q && (!q || t.includes(q))).slice(0, 6);

  const payload = () => ({
    staffId: Number(form.staffId),
    date: fmtDate(date),
    startMin: start,
    durationMin: dur,
    title: form.title?.trim() || '고객 등록 필요',
    subtitle: picked ? `${picked.menu} ${picked.dur}분` : (legacy?.label ?? `${form.dur}분`),
    price: Number(form.price) || 0,
  });

  const act = async fn => {
    setBusy(true);
    try { await fn(); onSaved(); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  // 완료된 예약은 '완료 취소' 말고는 아무것도 바꿀 수 없다
  const locked = !!form.done;
  const submit = e => {
    e.preventDefault();
    if (locked) return;
    if (!form.pick) return setErr('메뉴를 골라 주세요');
    if (!form.staffId) return setErr('담당자를 골라 주세요');
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
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={on}
                      className={'rm-chip' + (on ? ' on' : '') + ' st-' + st}
                      onClick={() => set('staffId', s.id)}>
                      <b><i className="dot" style={{ background: s.dotColor || 'var(--blue)' }} />{s.name}</b>
                      <small>{STATE_LABEL[st]}</small>
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
                <h3>3. 시간 · {date.getMonth() + 1}월 {date.getDate()}일</h3>
                <div className="rm-exact">
                  <Select value={start} onChange={v => set('startMin', Number(v))}
                    options={exact.map(m => ({ value: m, label: minLabel(m) }))} />
                </div>
              </div>
              <div className="rm-times" role="radiogroup" aria-label="시작 시간">
                {times.length === 0 && <p className="m-empty">{sel ? '이 코스가 들어갈 근무 시간이 없어요' : '담당자를 먼저 골라 주세요'}</p>}
                {times.map(m => {
                  const bad = sel && (clash(sel.id, m, dur) || (hitsLeave(lvOf(sel), m, dur) && { title: '휴가' }));
                  return (
                    <button key={m} type="button" role="radio" aria-checked={m === start}
                      className={'rm-time' + (m === start ? ' on' : '') + (bad ? ' bad' : '')}
                      title={bad ? `${bad.title}${bad.id ? ' 예약' : ''}과 겹침` : undefined}
                      onClick={() => set('startMin', m)}>
                      {short(m)}
                    </button>
                  );
                })}
              </div>
              <p className="rm-hint">
                {sel && times.some(m => clash(sel.id, m, dur) || hitsLeave(lvOf(sel), m, dur)) && `줄 그어진 시간은 ${sel.name}님 다른 예약·휴가와 겹쳐요. `}
                10분 단위 시각은 오른쪽 위에서 고르세요.
              </p>
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
          {warn && !locked && <p className="rm-warn">⚠ {warn}</p>}
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
