import { useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, minLabel, worksOn } from '../lib/constants'; // startH/endH prop 기본값
import { Modal, Button, Field, FieldGroup, Select } from './ui';

// 설정 > 메뉴·가격에서 켜 둔 (메뉴, 시간) 조합 하나하나가 버튼 하나
const optionsOf = menus => menus.flatMap(m =>
  m.durations.map((dur, i) => ({ key: `${m.name}|${dur}`, menu: m.name, dur, price: m.prices?.[i] ?? 0 })));

export default function ReservationModal({ init, staff, menus, date, startH = START_H, endH = END_H, hidePrice = false, onClose, onSaved }) {
  const options = optionsOf(menus);
  // 수정이면 기존 subtitle("아로마 60분")에서 메뉴를 찾고, 새 예약이면 첫 번째 버튼
  const initMenu = menus.find(m => (init.subtitle || '').startsWith(m.name))?.name;
  const initOpt = init.id
    ? options.find(o => o.menu === initMenu && o.dur === init.durationMin)
    : options[0];

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
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pick = o => setForm(f => ({ ...f, pick: o.key, dur: o.dur, price: o.price }));
  const pickLegacy = () => setForm(f => ({ ...f, pick: 'legacy', dur: legacy.dur, price: legacy.price }));
  const picked = options.find(o => o.key === form.pick);
  const endMin = Number(form.startMin) + Number(form.dur);

  const payload = () => ({
    staffId: Number(form.staffId),
    date: fmtDate(date),
    startMin: Number(form.startMin),
    durationMin: Number(form.dur),
    title: form.title?.trim() || '고객 등록 필요',
    subtitle: picked ? `${picked.menu} ${picked.dur}분` : (legacy?.label ?? `${form.dur}분`),
    price: Number(form.price) || 0,
  });

  const act = async fn => {
    setBusy(true);
    try { await fn(); onSaved(); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };
  const submit = e => {
    e.preventDefault();
    if (!form.pick) return setErr('메뉴를 골라 주세요');
    act(() => (form.id ? api.updateReservation(form.id, payload()) : api.createReservation(payload())));
  };
  // 완료 처리: 고친 내용이 있으면 같이 저장하고 완료 표시
  const toggleDone = () => act(async () => {
    await api.updateReservation(form.id, payload());
    await api.setReservationDone(form.id, !form.done);
  });

  const slots = [];
  for (let m = startH * 60; m < endH * 60; m += 10) slots.push(m);

  return (
    <Modal title={form.id ? (form.done ? '예약 (완료됨)' : '예약 수정') : '예약 등록'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="m-row">
          <Field label="담당자">
            <Select value={form.staffId} onChange={v => set('staffId', v)}
              options={staff.map(s => ({ value: s.id, label: s.name + (worksOn(s, date.getDay()) ? '' : ' (휴무)') }))} />
          </Field>
          <Field label="시작">
            <Select value={form.startMin} onChange={v => set('startMin', v)}
              options={slots.map(m => ({ value: m, label: minLabel(m) }))} />
          </Field>
        </div>

        <FieldGroup label="메뉴" className="m-full">
          {options.length === 0 && !legacy
            ? <p className="m-empty">설정 → 메뉴·가격에서 메뉴를 먼저 추가하세요</p>
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
                    {!hidePrice && o.price > 0 && <small>{o.price.toLocaleString()}원</small>}
                  </button>
                ))}
              </div>
            )}
        </FieldGroup>

        <p className="m-end">
          {minLabel(Number(form.startMin))} ~ {minLabel(endMin)}
          {!hidePrice && Number(form.price) > 0 && ` · ${Number(form.price).toLocaleString()}원`}
        </p>

        <Field label="고객명/메모" className="m-full">
          <input value={form.title || ''} onChange={e => set('title', e.target.value)}
            placeholder="비우면 '고객 등록 필요'" maxLength={30} />
        </Field>
        {err && <p className="m-err">{err}</p>}
        {form.id && (
          <Button className={'done-btn' + (form.done ? ' is-done' : '')} onClick={toggleDone} disabled={busy}>
            {form.done ? '완료 취소' : '✓ 완료 처리'}
          </Button>
        )}
        <div className="m-actions">
          {form.id && <Button variant="danger" onClick={() => act(() => api.deleteReservation(form.id))} disabled={busy}>삭제</Button>}
          <Button onClick={onClose} disabled={busy}>취소</Button>
          <Button variant="primary" type="submit" disabled={busy}>저장</Button>
        </div>
      </form>
    </Modal>
  );
}
