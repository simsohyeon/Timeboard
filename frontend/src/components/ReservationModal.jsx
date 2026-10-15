import { useState } from 'react';
import { api, fmtDate } from '../api';
import { START_H, END_H, minLabel } from '../lib/constants';
import { Modal, Button, Field } from './ui';

export default function ReservationModal({ init, staff, menus, date, onClose, onSaved }) {
  // 수정 모드면 기존 subtitle에서 메뉴 복원
  const initMenu = menus.find(m => (init.subtitle || '').startsWith(m.name))?.name || menus[0]?.name || '';
  const [form, setForm] = useState({
    menu: initMenu,
    dur: init.durationMin || 60,
    ...init,
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
    setForm(f => ({ ...f, menu: name, dur: ds.includes(Number(f.dur)) ? f.dur : ds[0] }));
  };

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
  for (let m = START_H * 60; m < END_H * 60; m += 30) slots.push(m);

  return (
    <Modal title={form.id ? '예약 수정' : '예약 등록'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="m-row">
          <Field label="담당자">
            <select value={form.staffId} onChange={e => set('staffId', e.target.value)}>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="메뉴">
            <select value={form.menu} onChange={e => pickMenu(e.target.value)}>
              {menus.map(m => <option key={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="시간">
            <select value={form.dur} onChange={e => set('dur', e.target.value)}>
              {durOptions.map(d => <option key={d} value={d}>{d}분</option>)}
            </select>
          </Field>
        </div>
        <div className="m-row">
          <Field label="시작">
            <select value={form.startMin} onChange={e => set('startMin', e.target.value)}>
              {slots.map(m => <option key={m} value={m}>{minLabel(m)}</option>)}
            </select>
          </Field>
          <span className="m-end">~ {minLabel(endMin)} 종료</span>
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
