import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { DAYS, DUR_OPTIONS, PALETTE, minLabel } from '../lib/constants';
import { BASE_FONT, FONT_SIZES, DENSITIES, loadDisplay, saveDisplay } from '../lib/display';
import DatePicker from './DatePicker';
import {
  Button, Checkbox, ChipGroup, ColorPicker, Field, FieldGroup, FormBar, GripIcon,
  IconButton, Select, TrashIcon, useDraft, useDragSort, useSaver,
} from './ui';

const SECTIONS = [
  ['staff', '담당자'],
  ['menu', '메뉴·가격'],
  ['hours', '운영 시간'],
  ['display', '화면'],
];
const LEAVE_MSG = '저장하지 않은 변경이 있어요. 저장하지 않고 이동할까요?';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_OPTS = DAYS.map((d, i) => ({ value: i, label: d }));
const num = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
const openOpts = Array.from({ length: 24 }, (_, h) => ({ value: h * 60, label: minLabel(h * 60) }));
const closeOpts = Array.from({ length: 24 }, (_, i) => {
  const h = i + 1;
  return { value: h * 60, label: h === 24 ? '자정' : minLabel(h * 60) };
});
let tempId = -1; // 아직 저장 안 한 새 항목의 임시 id (음수)

// 설정: 섹션마다 초안을 편집하고 [저장]으로 한 번에 반영, [취소]로 되돌림
export default function SettingsPage({
  staff, menus, settings, display, onDisplay,
  onStaffChanged, onMenusChanged, onSettingsChanged, onDirtyChange,
}) {
  const [sec, setSec] = useState('staff');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]);
  useEffect(() => () => onDirtyChange?.(false), []);

  const go = k => {
    if (k === sec) return;
    if (dirty && !window.confirm(LEAVE_MSG)) return;
    setDirty(false);
    setSec(k);
  };
  const openMin = settings?.openMin ?? 360;
  const closeMin = settings?.closeMin ?? 1320;

  return (
    <div className="settings">
      <nav className="set-nav" aria-label="설정 메뉴">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" className={'set-nav-item' + (sec === k ? ' on' : '')}
            aria-current={sec === k ? 'page' : undefined} onClick={() => go(k)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="set-body">
        {sec === 'staff' && <StaffSection staff={staff} openMin={openMin} closeMin={closeMin} onSaved={onStaffChanged} onDirty={setDirty} />}
        {sec === 'menu' && <MenuSection menus={menus} onSaved={onMenusChanged} onDirty={setDirty} />}
        {sec === 'hours' && <HoursSection openMin={openMin} closeMin={closeMin} onSaved={onSettingsChanged} onDirty={setDirty} />}
        {sec === 'display' && <DisplaySection display={display} onDisplay={onDisplay} onDirty={setDirty} />}
      </div>
    </div>
  );
}

function SectionHead({ title, desc, children }) {
  return (
    <header className="set-head">
      <div><h1>{title}</h1><p>{desc}</p></div>
      {children && <div className="set-head-right">{children}</div>}
    </header>
  );
}

// ───────────── 담당자 ─────────────
function StaffSection({ staff, openMin, closeMin, onSaved, onDirty }) {
  const { draft, setDraft, dirty, reset } = useDraft(staff);
  useEffect(() => onDirty(dirty), [dirty]);
  const { status, setStatus, save, fail } = useSaver();
  const [selId, setSelId] = useState(null);
  const sel = draft.find(s => s.id === selId) ?? draft[0];

  const patch = p => setDraft(d => d.map(s => (s.id === sel.id ? { ...s, ...p } : s)));
  const sort = useDragSort(draft, order => setDraft(d => order.map(id => d.find(s => s.id === id))));
  const daysOf = s => s.workDays ?? ALL_DAYS;
  const toggleDay = day => {
    const days = daysOf(sel);
    patch({ workDays: days.includes(day) ? days.filter(x => x !== day) : [...days, day].sort() });
  };
  const summary = s => {
    const days = daysOf(s);
    const parts = [days.length === 7 ? '매일' : days.length ? days.map(d => DAYS[d]).join('·') : '근무일 없음'];
    if (s.commissionPct) parts.push(`${s.commissionPct}%`);
    if (s.leftOn) parts.push(`퇴사 ${s.leftOn}`);
    if (s.id < 0) parts.push('새로 추가');
    return parts.join(' · ');
  };

  const add = () => {
    const id = tempId--;
    setDraft(d => [...d, {
      id, name: `직원 ${d.length + 1}`, dotColor: PALETTE[d.length % PALETTE.length], sortOrder: d.length,
      joinedOn: null, leftOn: null, commissionPct: 0, workDays: ALL_DAYS,
      workOpenMin: null, workCloseMin: null, phone: '', memo: '',
    }]);
    setSelId(id);
  };
  const remove = s => {
    if (draft.length === 1) return fail('담당자는 최소 1명 필요해요');
    setDraft(d => d.filter(x => x.id !== s.id));
    setSelId(null);
  };

  const submit = () => {
    for (const s of draft) {
      if (!s.name.trim()) return fail('이름을 입력하세요');
      if (s.workOpenMin != null && s.workCloseMin <= s.workOpenMin) return fail(`${s.name}: 근무 종료 시각은 시작보다 늦어야 해요`);
      if (s.joinedOn && s.leftOn && s.leftOn < s.joinedOn) return fail(`${s.name}: 퇴사일은 입사일보다 같거나 늦어야 해요`);
    }
    const removed = staff.filter(s => !draft.some(d => d.id === s.id));
    if (removed.length && !window.confirm(
      `${removed.map(s => `'${s.name}'`).join(', ')} 담당자와 그 예약 기록이 모두 삭제돼요. 퇴사한 직원은 삭제 대신 퇴사일을 넣으세요.\n저장할까요?`,
    )) return;
    save(() => Promise.all([
      ...removed.map(s => api.deleteStaff(s.id)),
      ...draft.map((s, i) => {
        const row = { ...s, name: s.name.trim(), sortOrder: i };
        if (s.id < 0) return api.createStaff(row);
        const orig = staff.find(o => o.id === s.id);
        return JSON.stringify(orig) === JSON.stringify(row) ? null : api.updateStaff(s.id, row);
      }),
    ]), onSaved);
  };

  return (<>
    <SectionHead title="담당자" desc="보드의 세로 칸 하나가 담당자 한 명이에요. 왼쪽 ⠿ 를 끌어서 보드 칸 순서를 바꿀 수 있어요.">
      <Button variant="primary" className="set-add" onClick={add}>+ 담당자 추가</Button>
    </SectionHead>
    <div className="staff-layout">
      <div className="set-card staff-list">
        {sort.ordered.map(s => (
          <div key={s.id} data-sort-id={s.id}
            className={'staff-row' + (sel?.id === s.id ? ' on' : '') + (sort.dragId === s.id ? ' dragging' : '')}>
            <span className="drag-handle" aria-label={`${s.name} 순서 끌어서 바꾸기`} title="끌어서 순서 바꾸기"
              {...sort.handleProps(s.id)}><GripIcon /></span>
            <button type="button" className="staff-pick" onClick={() => setSelId(s.id)}
              aria-current={sel?.id === s.id ? 'true' : undefined}>
              <i className="dot" style={{ background: s.dotColor || '#d1d6db' }} />
              <span className="staff-name">{s.name || '(이름 없음)'}</span>
              <span className="staff-sum">{summary(s)}</span>
            </button>
          </div>
        ))}
      </div>

      {sel && (
        <div className="set-card staff-panel" key={sel.id}>
          <div className="staff-panel-head">
            <ColorPicker value={sel.dotColor} palette={PALETTE} label={`${sel.name} 색 바꾸기`}
              onChange={c => patch({ dotColor: c })} />
            <input className="inl" value={sel.name} maxLength={10} aria-label="담당자 이름"
              onChange={e => patch({ name: e.target.value })} />
          </div>

          <Field label="연락처">
            <input value={sel.phone || ''} inputMode="tel" placeholder="010-0000-0000" maxLength={20}
              onChange={e => patch({ phone: e.target.value })} />
          </Field>

          <FieldGroup label="근무 요일">
            <ChipGroup options={DAY_OPTS} selected={daysOf(sel)} onToggle={toggleDay} />
          </FieldGroup>

          <FieldGroup label="근무 시간">
            <Checkbox label="매장 운영 시간과 같음" checked={sel.workOpenMin == null}
              onChange={same => patch(same
                ? { workOpenMin: null, workCloseMin: null }
                : { workOpenMin: openMin, workCloseMin: closeMin })} />
            {sel.workOpenMin != null && (
              <div className="hours-row">
                <Select value={sel.workOpenMin} onChange={v => patch({ workOpenMin: Number(v) })} options={openOpts} />
                <span className="hours-tilde">~</span>
                <Select value={sel.workCloseMin} onChange={v => patch({ workCloseMin: Number(v) })} options={closeOpts} />
              </div>
            )}
          </FieldGroup>

          <div className="m-row">
            <FieldGroup label="입사일">
              <DatePicker value={sel.joinedOn} aria-label="입사일" onChange={v => patch({ joinedOn: v })} />
            </FieldGroup>
            <FieldGroup label="퇴사일">
              <DatePicker value={sel.leftOn} placeholder="재직 중" aria-label="퇴사일" onChange={v => patch({ leftOn: v })} />
            </FieldGroup>
          </div>
          <div className="m-row">
            <Field label="정산 비율">
              <div className="suffix">
                <input value={sel.commissionPct || 0} inputMode="numeric" aria-label="정산 비율"
                  onChange={e => patch({ commissionPct: Math.min(100, num(e.target.value)) })} />
                <span>%</span>
              </div>
            </Field>
            <span className="field-spacer" aria-hidden="true" />
          </div>
          <span className="set-hint">퇴사일 다음 날부터 보드에서 사라지고, 예약·정산 기록은 남아요. 정산액 = 매출 × 비율.</span>

          <Field label="메모">
            <textarea value={sel.memo || ''} rows={3} maxLength={300}
              placeholder="특이사항, 가능한 메뉴 등" onChange={e => patch({ memo: e.target.value })} />
          </Field>

          <div className="staff-panel-foot">
            <Button variant="danger" className="small" onClick={() => remove(sel)}>담당자 삭제</Button>
            <span className="set-hint">저장하면 예약 기록까지 지워져요</span>
          </div>
        </div>
      )}
    </div>
    <FormBar dirty={dirty} status={status} onSave={submit}
      onCancel={() => { reset(); setSelId(null); setStatus({ kind: 'idle' }); }} />
  </>);
}

// ───────────── 메뉴·가격 ─────────────
// 초안 행: { id, name, sortOrder, cells: { [분]: '가격 숫자 문자열' } } — 키가 없으면 그 시간은 꺼짐
const toRows = menus => menus.map(m => ({
  id: m.id, name: m.name, sortOrder: m.sortOrder,
  cells: Object.fromEntries(m.durations.map((d, i) => [d, String(m.prices?.[i] ?? 0)])),
}));
const fmtStr = s => (s === '' ? '' : Number(s).toLocaleString('ko-KR'));

function MenuSection({ menus, onSaved, onDirty }) {
  const source = useMemo(() => toRows(menus), [menus]);
  const { draft, setDraft, dirty, reset } = useDraft(source);
  useEffect(() => onDirty(dirty), [dirty]);
  const { status, setStatus, save, fail } = useSaver();
  const [focusKey, setFocusKey] = useState(null); // 방금 켠 가격 칸에 포커스

  const setRow = (id, fn) => setDraft(rows => rows.map(r => (r.id === id ? fn(r) : r)));
  const setCell = (id, d, v) => setRow(id, r => ({ ...r, cells: { ...r.cells, [d]: v } }));
  const offCell = (id, d) => setRow(id, r => { const cells = { ...r.cells }; delete cells[d]; return { ...r, cells }; });
  const add = () => setDraft(rows => [...rows, {
    id: tempId--, name: `메뉴 ${rows.length + 1}`,
    sortOrder: Math.max(-1, ...rows.map(r => r.sortOrder ?? 0)) + 1,
    cells: { 60: '0', 90: '0', 120: '0' },
  }]);

  const submit = () => {
    const out = draft.map(r => {
      const durations = DUR_OPTIONS.filter(d => r.cells[d] !== undefined && r.cells[d] !== '');
      return { ...r, name: r.name.trim(), durations, prices: durations.map(d => Number(r.cells[d])) };
    });
    for (const m of out) {
      if (!m.name) return fail('메뉴 이름을 입력하세요');
      if (!m.durations.length) return fail(`${m.name}: 가격이 있는 시간이 최소 1개 필요해요`);
    }
    const removed = menus.filter(m => !draft.some(r => r.id === m.id));
    save(() => Promise.all([
      ...removed.map(m => api.deleteMenu(m.id)),
      ...out.map(m => {
        if (m.id < 0) return api.createMenu(m);
        const orig = menus.find(o => o.id === m.id);
        const same = orig.name === m.name
          && JSON.stringify(orig.durations) === JSON.stringify(m.durations)
          && JSON.stringify(orig.prices) === JSON.stringify(m.prices);
        return same ? null : api.updateMenu(m.id, m);
      }),
    ]), onSaved);
  };

  return (<>
    <SectionHead title="메뉴·가격" desc="가격이 있는 칸만 예약할 때 고를 수 있어요. 가격을 비우면 그 시간은 꺼져요.">
      <Button variant="primary" className="set-add" onClick={add}>+ 메뉴 추가</Button>
    </SectionHead>
    <div className="set-card set-table-wrap">
      <table className="price-table">
        <thead>
          <tr>
            <th scope="col">메뉴</th>
            {DUR_OPTIONS.map(d => <th scope="col" key={d}>{d}분</th>)}
            <th scope="col"><span className="sr-only">삭제</span></th>
          </tr>
        </thead>
        <tbody>
          {draft.map(r => (
            <tr key={r.id}>
              <td>
                <input className="inl" value={r.name} maxLength={10} aria-label="메뉴 이름"
                  onChange={e => setRow(r.id, x => ({ ...x, name: e.target.value }))} />
              </td>
              {DUR_OPTIONS.map(d => (
                <td key={d}>
                  {r.cells[d] !== undefined ? (
                    <input className="cell-price" value={fmtStr(r.cells[d])} inputMode="numeric"
                      aria-label={`${r.name} ${d}분 가격`}
                      onChange={e => setCell(r.id, d, e.target.value.replace(/\D/g, ''))}
                      onBlur={e => e.target.value === '' && offCell(r.id, d)}
                      autoFocus={focusKey === `${r.id}-${d}`} onFocus={e => e.target.select()} />
                  ) : (
                    <button type="button" className="cell-off" aria-label={`${r.name} ${d}분 켜기`}
                      onClick={() => { setFocusKey(`${r.id}-${d}`); setCell(r.id, d, '0'); }}>+</button>
                  )}
                </td>
              ))}
              <td>
                <IconButton label={`${r.name} 삭제`} danger
                  onClick={() => setDraft(rows => rows.filter(x => x.id !== r.id))}><TrashIcon /></IconButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="set-legend">
      <span><i className="lg-on" />가격 있음 = 예약 가능</span>
      <span><i className="lg-off" />누르면 켜짐</span>
    </p>
    <FormBar dirty={dirty} status={status} onSave={submit}
      onCancel={() => { reset(); setStatus({ kind: 'idle' }); }} />
  </>);
}

// ───────────── 운영 시간 ─────────────
function HoursSection({ openMin, closeMin, onSaved, onDirty }) {
  const source = useMemo(() => ({ openMin, closeMin }), [openMin, closeMin]);
  const { draft, setDraft, dirty, reset } = useDraft(source);
  useEffect(() => onDirty(dirty), [dirty]);
  const { status, setStatus, save, fail } = useSaver();

  const submit = () => {
    if (draft.closeMin <= draft.openMin) return fail('종료 시각은 시작보다 늦어야 해요');
    save(() => api.updateSettings(draft), onSaved);
  };

  return (<>
    <SectionHead title="운영 시간" desc="예약 보드에 보이는 시간 범위예요. 담당자별 근무 시간은 담당자에서 따로 정해요." />
    <div className="set-card hours-card">
      <div className="hours-row">
        <Select value={draft.openMin} onChange={v => setDraft(d => ({ ...d, openMin: Number(v) }))} options={openOpts} />
        <span className="hours-tilde">~</span>
        <Select value={draft.closeMin} onChange={v => setDraft(d => ({ ...d, closeMin: Number(v) }))} options={closeOpts} />
      </div>
      <div className="hours-bar">
        <i style={{ left: `${draft.openMin / 14.4}%`, width: `${Math.max(0, draft.closeMin - draft.openMin) / 14.4}%` }} />
      </div>
      <div className="hours-ticks"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
      <span className="set-hint">하루 {Math.max(0, draft.closeMin - draft.openMin) / 60}시간 표시</span>
    </div>
    <FormBar dirty={dirty} status={status} onSave={submit}
      onCancel={() => { reset(); setStatus({ kind: 'idle' }); }} />
  </>);
}

// ───────────── 화면 (이 기기에만 저장) ─────────────
// 고르는 즉시 미리보기로 적용하고, [저장]해야 기기에 남는다. 저장 안 하고 나가면 원래대로.
const TOGGLES = [
  ['halfLine', '30분 보조선', '보드에 30분 단위 점선을 표시해요'],
  ['hidePrice', '금액 숨기기', '예약 화면에서 금액을 감춰요 (결제 탭에는 표시)'],
  ['dark', '다크 모드', '어두운 배경으로 바꿔요'],
  ['keepAwake', '화면 항상 켜기', '앱이 떠 있는 동안 화면이 꺼지지 않아요'],
];

function DisplaySection({ display, onDisplay, onDirty }) {
  const [saved, setSaved] = useState(loadDisplay);
  const savedRef = useRef(saved); savedRef.current = saved;
  const dirty = JSON.stringify(display) !== JSON.stringify(saved);
  useEffect(() => onDirty(dirty), [dirty]);
  useEffect(() => () => onDisplay(savedRef.current), []); // 나갈 때 저장 안 한 미리보기 되돌림
  const { status, setStatus } = useSaver();
  const set = p => { onDisplay(d => ({ ...d, ...p })); setStatus({ kind: 'idle' }); };
  const wakeOk = 'wakeLock' in navigator;

  return (<>
    <SectionHead title="화면" desc="이 기기에서만 적용돼요. 고르면 바로 미리보기로 바뀌고, 저장해야 유지돼요." />
    <div className="set-card display-card">
      <FieldGroup label="글자 크기">
        <div className="chips" role="group" aria-label="글자 크기">
          {FONT_SIZES.map(px => (
            <button key={px} type="button" className={'chip-tg' + (px === display.fontPx ? ' on' : '')}
              aria-pressed={px === display.fontPx} onClick={() => set({ fontPx: px })}>
              {px}px{px === BASE_FONT ? ' (기본)' : ''}
            </button>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label="보드 밀도">
        <div className="chips" role="group" aria-label="보드 밀도">
          {DENSITIES.map(({ label, v }) => (
            <button key={v} type="button" className={'chip-tg' + (v === display.hourPx ? ' on' : '')}
              aria-pressed={v === display.hourPx} onClick={() => set({ hourPx: v })}>
              {label}
            </button>
          ))}
        </div>
      </FieldGroup>
      {TOGGLES.map(([key, label, desc]) => {
        const off = key === 'keepAwake' && !wakeOk;
        return (
          <div className="disp-row toggle-row" key={key}>
            <div>
              <span className="set-label">{label}</span>
              <p className="set-hint">{desc}{off ? ' — 이 브라우저는 지원하지 않아요' : ''}</p>
            </div>
            <button type="button" role="switch" aria-checked={!!display[key]} aria-label={label} disabled={off}
              className={'switch' + (display[key] ? ' on' : '')} onClick={() => set({ [key]: !display[key] })}>
              <i />
            </button>
          </div>
        );
      })}
    </div>
    <FormBar dirty={dirty} status={status}
      onSave={() => { saveDisplay(display); setSaved(display); setStatus({ kind: 'saved' }); }}
      onCancel={() => { onDisplay(saved); setStatus({ kind: 'idle' }); }} />
  </>);
}
