import { useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, minLabel } from '../lib/constants'; // startH/endH prop 기본값
import { Modal, Button, Field, Select } from './ui';

export default function ReservationModal({ init, staff, menus, date, startH = START_H, endH = END_H, onClose, onSaved }) {
  // 메뉴+시간으로 가격 조회 (durations와 prices는 같은 순서)
  const priceOf = (menuName, dur) => {
    const m = menus.find(x => x.name === menuName);
    if (!m) return 0;
    const i = m.durations.indexOf(Number(dur));
    return m.prices?.[i] ?? 0;
  };

  // 수정 모드면 기존 subtitle에서 메뉴 복원
  const initMenu = menus.find(m => (init.subtitle || '').startsWith(m.name))?.name || menus[0]?.name || '';
  const [form, setForm] = useState({
    menu: initMenu,
    dur: init.durationMin || 60,
    ...init,
    // 저장된 금액이 없으면(새 예약·과거 0원 예약) 메뉴 가격으로 자동
    price: init.price || priceOf(initMenu, init.durationMin || 60),
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const baseDurs = menus.find(m => m.name === form.menu)?.durations;
  const menuDurs = baseDurs?.length ? baseDurs : [60, 90, 120];
  // 기존 예약의 시간이 메뉴 옵션에 없으면 그 값도 보여준다
  const durOptions = menuDurs.includes(Number(form.dur)) ? menuDurs : [Number(form.dur), ...menuDurs];
  const endMin = Number(form.startMin) + Number(form.dur);

  const pickMenu = name => {
    const ds = menus.find(m => m.name === name)?.durations || [60, 90, 120];
    setForm(f => {
      const dur = ds.includes(Number(f.dur)) ? f.dur : ds[0];
      return { ...f, menu: name, dur, price: priceOf(name, dur) };
    });
  };
  const pickDur = dur => setForm(f => ({ ...f, dur, price: priceOf(f.menu, dur) }));

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        staffId: Number(form.staffId),
        date: fmtDate(date),
        startMin: Number(form.startMin),
        durationMin: Number(form.dur),
        title: form.title?.trim() || '고객 등록 필요',
        subtitle: form.menu ? `${form.menu} ${form.dur}분` : `${form.dur}분`,
        price: Number(form.price) || 0,
      };
      if (form.id) await api.updateReservation(form.id, payload);
      else await api.createReservation(payload);
      onSaved();
    } catch (e2) { setErr(e2.message || String(e2)); setBusy(false); }
  };

  const del = async () => {
    setBusy(true);
    try { await api.deleteReservation(form.id); onSaved(); }
    catch (e2) { setErr(e2.message || String(e2)); setBusy(false); }
  };

  const slots = [];
  for (let m = startH * 60; m < endH * 60; m += 10) slots.push(m);

  return (
    <Modal title={form.id ? '예약 수정' : '예약 등록'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="m-row">
          <Field label="담당자">
            <Select value={form.staffId} onChange={v => set('staffId', v)}
              options={staff.map(s => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="메뉴">
            <Select value={form.menu} onChange={pickMenu}
              options={menus.map(m => ({ value: m.name, label: m.name }))} />
          </Field>
          <Field label="시간">
            <Select value={form.dur} onChange={pickDur}
              options={durOptions.map(d => ({ value: d, label: `${d}분` }))} />
          </Field>
        </div>
        <div className="m-row">
          <Field label="시작">
            <Select value={form.startMin} onChange={v => set('startMin', v)}
              options={slots.map(m => ({ value: m, label: minLabel(m) }))} />
          </Field>
          <span className="m-end">~ {minLabel(endMin)} 종료 · {(Number(form.price) || 0).toLocaleString()}원</span>
        </div>
        <Field label="고객명/메모" className="m-full">
          <input value={form.title || ''} onChange={e => set('title', e.target.value)}
            placeholder="비우면 '고객 등록 필요'" maxLength={30} />
        </Field>
        {err && <p className="m-err">{err}</p>}
        <div className="m-actions">
          {form.id && <Button variant="danger" onClick={del} disabled={busy}>삭제</Button>}
          <Button onClick={onClose} disabled={busy}>취소</Button>
          <Button variant="primary" type="submit" disabled={busy}>저장</Button>
        </div>
      </form>
    </Modal>
  );
}
