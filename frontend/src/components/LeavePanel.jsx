import { useState } from 'react';
import { api, fmtDate } from '../api';
import { DAYS, minLabel } from '../lib/constants';
import { altStaff, leaveLabel } from '../lib/schedule';
import DatePicker from './DatePicker';
import { Button, FieldGroup, IconButton, Modal, Select, TrashIcon } from './ui';

// 설정 > 담당자 > 휴가: 등록·삭제는 바로 저장 (담당자 [저장] 버튼과 별개)
// 등록할 때 그 기간에 잡힌 예약이 있으면, 대신 맡을 수 있는 담당자를 추천해 한 번에 옮긴다.
const REASONS = ['연차', '반차', '병가', '외출', '개인 사정'];
const ymd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = s => { const d = ymd(s); return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`; };
const leaveRange = l =>
  (l.startDate === l.endDate ? dayLabel(l.startDate) : `${dayLabel(l.startDate)} ~ ${dayLabel(l.endDate)}`);

export default function LeavePanel({ staff, allStaff, leaves, openMin, closeMin, error, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const today = fmtDate(new Date());
  const mine = leaves.filter(l => l.staffId === staff.id);
  const current = mine.filter(l => l.endDate >= today);
  const past = mine.filter(l => l.endDate < today).reverse();

  const remove = async l => {
    if (!window.confirm(`${leaveRange(l)} ${leaveLabel(l)} 휴가를 지울까요?`)) return;
    try { await api.deleteLeave(l.id); onChanged(); }
    catch (e) { alert(e.message || String(e)); }
  };

  if (staff.id < 0) return <p className="set-hint">담당자를 먼저 저장하면 휴가를 넣을 수 있어요.</p>;
  return (
    <div className="leave-panel">
      {error && <p className="leave-err">{error}</p>}
      {current.length === 0 && !error && <p className="set-hint">예정된 휴가가 없어요.</p>}
      {current.map(l => (
        <div key={l.id} className="leave-row">
          <span className="leave-when">{leaveRange(l)}</span>
          <span className="leave-what">{leaveLabel(l)}</span>
          <IconButton label="휴가 지우기" danger onClick={() => remove(l)}><TrashIcon /></IconButton>
        </div>
      ))}
      {past.length > 0 && (
        <button type="button" className="leave-past-btn" onClick={() => setShowPast(v => !v)}>
          지난 휴가 {past.length}건 {showPast ? '접기' : '보기'}
        </button>
      )}
      {showPast && past.map(l => (
        <div key={l.id} className="leave-row past">
          <span className="leave-when">{leaveRange(l)}</span>
          <span className="leave-what">{leaveLabel(l)}</span>
          <IconButton label="휴가 지우기" danger onClick={() => remove(l)}><TrashIcon /></IconButton>
        </div>
      ))}
      <Button className="leave-add" onClick={() => setAdding(true)} disabled={!!error}>+ 휴가 추가</Button>
      {adding && (
        <LeaveModal staff={staff} allStaff={allStaff} leaves={leaves} openMin={openMin} closeMin={closeMin}
          onClose={changed => { setAdding(false); if (changed) onChanged(); }} />
      )}
    </div>
  );
}

function LeaveModal({ staff, allStaff, leaves, openMin, closeMin, onClose }) {
  const today = fmtDate(new Date());
  const [f, setF] = useState({ startDate: today, endDate: today, allDay: true, startMin: 840, endMin: 960, reason: '연차' });
  const set = p => setF(x => ({ ...x, ...p }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [conflicts, setConflicts] = useState(null); // 저장 후 겹친 예약 목록 → 2단계 화면
  const [allResv, setAllResv] = useState([]);
  const [newLeaves, setNewLeaves] = useState(leaves);
  const [moved, setMoved] = useState({}); // 예약 id → 옮긴 담당자 이름

  const times = [];
  for (let m = Math.floor(openMin / 30) * 30; m <= closeMin; m += 30) times.push({ value: m, label: minLabel(m) });

  const save = async () => {
    if (f.endDate < f.startDate) return setErr('끝나는 날이 시작하는 날보다 빨라요');
    if (!f.allDay && f.endMin <= f.startMin) return setErr('끝나는 시각이 시작보다 늦어야 해요');
    setBusy(true); setErr('');
    try {
      const leave = await api.createLeave({
        staffId: staff.id, startDate: f.startDate, endDate: f.endDate,
        startMin: f.allDay ? null : f.startMin, endMin: f.allDay ? null : f.endMin, reason: f.reason,
      });
      const rs = await api.reservationsRange(f.startDate, f.endDate);
      const hit = rs.filter(r => r.staffId === staff.id && !r.done
        && (f.allDay || (r.startMin < f.endMin && f.startMin < r.startMin + r.durationMin)));
      if (!hit.length) return onClose(true);
      setAllResv(rs); setNewLeaves([...leaves, leave]); setConflicts(hit); setBusy(false);
    } catch (e) { setErr(e.message || String(e)); setBusy(false); }
  };

  const move = async (r, to) => {
    setBusy(true);
    try {
      await api.updateReservation(r.id, { ...r, staffId: to.id });
      setAllResv(rs => rs.map(x => (x.id === r.id ? { ...x, staffId: to.id } : x)));
      setMoved(m => ({ ...m, [r.id]: to.name }));
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  if (conflicts) {
    const left = conflicts.filter(r => !moved[r.id]).length;
    return (
      <Modal className="leave-modal" title={`겹치는 예약 ${conflicts.length}건`} onClose={() => onClose(true)}>
        <p className="leave-sub">휴가는 저장했어요. {staff.name}님 예약을 다른 담당자에게 옮길 수 있어요.</p>
        <div className="lc-list">
          {conflicts.map(r => {
            const alts = altStaff(r, allStaff, allResv, newLeaves, openMin, closeMin);
            return (
              <div key={r.id} className="lc-row">
                <div className="lc-info">
                  <b>{dayLabel(r.date)} {minLabel(r.startMin)}</b>
                  <span>{r.title} · {r.subtitle}</span>
                </div>
                {moved[r.id]
                  ? <span className="lc-done">✓ {moved[r.id]}에게 옮김</span>
                  : alts.length
                    ? <div className="lc-alts">
                        {alts.slice(0, 3).map(s => (
                          <button key={s.id} type="button" disabled={busy} onClick={() => move(r, s)}>{s.name}에게</button>
                        ))}
                      </div>
                    : <span className="lc-none">가능한 담당자 없음 · 손님께 연락</span>}
              </div>
            );
          })}
        </div>
        {err && <p className="m-err">{err}</p>}
        {left > 0 && <p className="set-hint">옮기지 않은 {left}건은 보드에 ⚠ 표시로 남아요.</p>}
        <div className="m-actions"><Button variant="primary" onClick={() => onClose(true)}>확인</Button></div>
      </Modal>
    );
  }

  return (
    <Modal className="leave-modal" title={`${staff.name} 휴가 추가`} onClose={() => onClose(false)}>
      <div className="leave-form">
        <FieldGroup label="사유">
          <div className="chips">
            {REASONS.map(r => (
              <button key={r} type="button" className={'chip-tg' + (f.reason === r ? ' on' : '')}
                onClick={() => set({ reason: r, ...(r === '반차' || r === '외출' ? { allDay: false } : r === '연차' || r === '병가' ? { allDay: true } : {}) })}>{r}</button>
            ))}
          </div>
        </FieldGroup>
        <div className="m-row">
          <FieldGroup label="시작하는 날">
            <DatePicker value={f.startDate} clearable={false} aria-label="시작하는 날"
              onChange={v => set({ startDate: v, endDate: v > f.endDate ? v : f.endDate })} />
          </FieldGroup>
          <FieldGroup label="끝나는 날">
            <DatePicker value={f.endDate} clearable={false} aria-label="끝나는 날" onChange={v => set({ endDate: v })} />
          </FieldGroup>
        </div>
        <FieldGroup label="시간">
          <div className="chips">
            <button type="button" className={'chip-tg' + (f.allDay ? ' on' : '')} onClick={() => set({ allDay: true })}>종일</button>
            <button type="button" className={'chip-tg' + (!f.allDay ? ' on' : '')} onClick={() => set({ allDay: false })}>시간 지정 (반차·외출)</button>
          </div>
          {!f.allDay && (
            <div className="hours-row">
              <Select value={f.startMin} onChange={v => set({ startMin: Number(v) })} options={times} />
              <span className="hours-tilde">~</span>
              <Select value={f.endMin} onChange={v => set({ endMin: Number(v) })} options={times} />
            </div>
          )}
          {!f.allDay && f.startDate !== f.endDate && <span className="set-hint">기간 안의 매일 이 시간에 적용돼요</span>}
        </FieldGroup>
      </div>
      {err && <p className="m-err">{err}</p>}
      <div className="m-actions">
        <Button onClick={() => onClose(false)} disabled={busy}>취소</Button>
        <Button variant="primary" onClick={save} disabled={busy}>휴가 저장</Button>
      </div>
    </Modal>
  );
}
