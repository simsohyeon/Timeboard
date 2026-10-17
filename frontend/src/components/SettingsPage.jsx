import { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth } from '../api';
import { DAYS, DUR_OPTIONS, PALETTE, minLabel } from '../lib/constants';
import { BASE_FONT, FONT_SIZES, DENSITIES, loadDisplay, saveDisplay } from '../lib/display';
import DatePicker from './DatePicker';
import LeavePanel from './LeavePanel';
import { bizToday } from '../lib/schedule';
import {
  FormBar, GripIcon, IconButton, Select, TrashIcon, allSaved, countChanges, useDraft, useDragSort, useSaver,
} from './ui';

const SECTIONS = [
  ['staff', '담당자', '담당자 한 명이 예약 보드의 세로 칸 하나예요.'],
  ['store', '매장 운영', ''], // 설명 없이 바로 운영 시간·메뉴 카드부터
  ['display', '화면', '이 기기에서만 적용돼요. 고르면 바로 바뀌고, 저장해야 유지돼요.'],
  ['account', '계정', '이 계정의 매장 데이터는 다른 계정과 따로 저장돼요.'],
];
const LEAVE_MSG = '저장하지 않은 변경이 있어요. 저장하지 않고 이동할까요?';
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const num = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
const openOpts = Array.from({ length: 24 }, (_, h) => ({ value: h * 60, label: minLabel(h * 60) }));
// 마감은 자정 넘어 다음날 새벽 6시까지 고를 수 있다 (새벽 영업)
const closeOpts = Array.from({ length: 30 }, (_, i) => {
  const h = i + 1;
  return { value: h * 60, label: h === 24 ? '자정' : h > 24 ? `다음날 새벽 ${h - 24}:00` : minLabel(h * 60) };
});
let tempId = -1; // 아직 저장 안 한 새 항목의 임시 id (음수)

const md = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
const daysLabel = d => {
  if (d.length === 7) return '매일';
  if (!d.length) return '근무일 없음';
  if (d.length === 2 && d[0] === 0 && d[1] === 6) return '주말';
  if (d.length >= 3 && d.every((x, i) => !i || x === d[i - 1] + 1)) return `${DAYS[d[0]]}–${DAYS[d[d.length - 1]]}`;
  return d.map(x => DAYS[x]).join('·');
};

// 설정: 섹션마다 초안을 편집하고 [저장]으로 한 번에 반영, [되돌리기]로 원래대로
export default function SettingsPage({
  staff, menus, settings, display, onDisplay, leaves = [], leaveErr = '', onLeavesChanged,
  onStaffChanged, onMenusChanged, onSettingsChanged, onDirtyChange, account,
}) {
  const sections = SECTIONS.filter(([k]) => k !== 'account' || account);
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
      <div className="set-wrap">
        <div className="set-top">
          <h1>설정</h1>
          <div className="seg" role="tablist" aria-label="설정 메뉴">
            {sections.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''}
                onClick={() => go(k)}>{label}</button>
            ))}
          </div>
        </div>
        {SECTIONS.find(s => s[0] === sec)[2] && <p className="set-lead">{SECTIONS.find(s => s[0] === sec)[2]}</p>}
        {sec === 'staff' && <StaffSection staff={staff} openMin={openMin} closeMin={closeMin} onSaved={onStaffChanged} onDirty={setDirty}
          leaves={leaves} leaveErr={leaveErr} onLeavesChanged={onLeavesChanged} />}
        {sec === 'store' && <StoreSection menus={menus} openMin={openMin} closeMin={closeMin}
          onMenusSaved={onMenusChanged} onHoursSaved={onSettingsChanged} onDirty={setDirty} />}
        {sec === 'display' && <DisplaySection display={display} onDisplay={onDisplay} onDirty={setDirty} />}
        {sec === 'account' && account && <AccountSection {...account} />}
      </div>
    </div>
  );
}

// 제목 + 흰 카드 묶음
function Group({ title, action, className = '', children }) {
  return (
    <section className="set-grp">
      <div className="set-grp-h"><h3>{title}</h3>{action}</div>
      <div className={'set-box ' + className}>{children}</div>
    </section>
  );
}

// 카드 안 한 줄: 왼쪽 라벨(+설명), 오른쪽 값·입력
function Row({ label, desc, as: Tag = 'div', children }) {
  return (
    <Tag className="set-row">
      {desc
        ? <span className="set-row-t"><b>{label}</b><small>{desc}</small></span>
        : <span className="set-row-l">{label}</span>}
      {children}
    </Tag>
  );
}

function Switch({ on, label, disabled, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
      className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}><i /></button>
  );
}

const Avatar = ({ s, lg }) => (
  <i className={'avatar' + (lg ? ' lg' : '')} style={{ '--c': s.dotColor || 'var(--blue)' }}>{s.name.slice(0, 1)}</i>
);

// ───────────── 담당자 ─────────────
function StaffSection({ staff, openMin, closeMin, onSaved, onDirty, leaves, leaveErr, onLeavesChanged }) {
  const { draft, setDraft, dirty, changes, reset } = useDraft(staff);
  useEffect(() => onDirty(dirty), [dirty]);
  const { status, setStatus, save, fail } = useSaver();
  const [selId, setSelId] = useState(null);
  // 새로 추가한 담당자를 저장하면 임시 id 가 진짜 id 로 바뀐다 → 목록 순서(자리)로 이어서 고른다
  const [selIdx, setSelIdx] = useState(null);
  const sel = draft.find(s => s.id === selId) ?? (selIdx != null ? draft[selIdx] : null) ?? draft[0];
  const today = bizToday();

  const patch = p => setDraft(d => d.map(s => (s.id === sel.id ? { ...s, ...p } : s)));
  const sort = useDragSort(draft, order => setDraft(d => order.map(id => d.find(s => s.id === id))));
  const daysOf = s => s.workDays ?? ALL_DAYS;
  const toggleDay = day => {
    const days = daysOf(sel);
    patch({ workDays: days.includes(day) ? days.filter(x => x !== day) : [...days, day].sort() });
  };
  // [종류, 글자] — 목록·상세 머리에 붙는 상태 표시
  const statusOf = s => {
    if (s.leftOn) return ['warn', s.leftOn < today ? '퇴사' : `${md(s.leftOn)} 퇴사`];
    const mine = leaves.filter(l => l.staffId === s.id);
    if (mine.some(l => l.startDate <= today && today <= l.endDate)) return ['lv', '오늘 휴가'];
    const next = mine.filter(l => l.startDate > today).sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
    if (next) return ['lv', `${md(next.startDate)} 휴가`];
    if (s.id < 0) return ['new', '새로 추가'];
    return ['ok', '재직 중'];
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
    setSelIdx(sel ? draft.indexOf(sel) : null);
    save(() => allSaved([
      ...removed.map(s => api.deleteStaff(s.id)),
      ...draft.map((s, i) => {
        const row = { ...s, name: s.name.trim(), sortOrder: i };
        if (s.id < 0) return api.createStaff(row);
        const orig = staff.find(o => o.id === s.id);
        return JSON.stringify(orig) === JSON.stringify(row) ? null : api.updateStaff(s.id, row);
      }),
    ]), onSaved);
  };

  const [selKind, selText] = sel ? statusOf(sel) : [];
  return (<>
    <div className="staff-layout">
      <aside className="set-box staff-list">
        <div className="staff-list-h">
          <b>담당자<span>{draft.length}</span></b>
          <button type="button" className="set-link" onClick={add}>+ 추가</button>
        </div>
        <div className="staff-items">
          {sort.ordered.map(s => {
            const [kind, text] = statusOf(s);
            const days = daysOf(s);
            return (
              <div key={s.id} data-sort-id={s.id}
                className={'staff-row' + (sel?.id === s.id ? ' on' : '') + (sort.dragId === s.id ? ' dragging' : '')
                  + (s.leftOn && s.leftOn < today ? ' gone' : '')}>
                <span className="drag-handle" aria-label={`${s.name} 순서 끌어서 바꾸기`} title="끌어서 순서 바꾸기"
                  {...sort.handleProps(s.id)}><GripIcon /></span>
                <button type="button" className="staff-pick" onClick={() => setSelId(s.id)}
                  aria-current={sel?.id === s.id ? 'true' : undefined}>
                  <Avatar s={s} />
                  <span className="staff-t">
                    <b>{s.name || '(이름 없음)'}</b>
                    <span className="week" style={{ '--c': s.dotColor || 'var(--blue)' }} aria-label={`${daysLabel(days)} 근무`}>
                      {ALL_DAYS.map(i => <i key={i} className={days.includes(i) ? 'on' : ''} />)}
                    </span>
                  </span>
                  <span className="staff-m">
                    {s.commissionPct || 0}%
                    {kind !== 'ok' && <span className={'set-pill ' + kind}>{text}</span>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="staff-hint">순서가 보드 칸 순서예요. 이름 왼쪽 손잡이를 끌어서 바꿀 수 있어요.</p>
      </aside>

      {sel && (
        <div className="staff-detail" key={sel.id}>
          <div className="set-box staff-prof">
            <Avatar s={sel} lg />
            <div className="staff-prof-t">
              <h2>{sel.name || '(이름 없음)'} <span className={'set-pill ' + selKind}>{selText}</span></h2>
              <p>
                {daysLabel(daysOf(sel))} 근무 · {sel.workOpenMin == null
                  ? '매장 시간과 같음' : `${minLabel(sel.workOpenMin)} ~ ${minLabel(sel.workCloseMin)}`} · 정산 {sel.commissionPct || 0}%
              </p>
            </div>
            <div className="palette" role="group" aria-label="보드 색">
              <span>보드 색</span>
              {PALETTE.map(c => (
                <button key={c} type="button" aria-pressed={c === sel.dotColor} aria-label={`색 ${c}`}
                  style={{ '--c': c }} onClick={() => patch({ dotColor: c })}><i /></button>
              ))}
            </div>
          </div>

          <Group title="기본 정보">
            <Row label="이름" as="label">
              <input className="row-in strong" value={sel.name} maxLength={10} placeholder="이름"
                onChange={e => patch({ name: e.target.value })} />
            </Row>
            <Row label="연락처" as="label">
              <input className="row-in" value={sel.phone || ''} inputMode="tel" placeholder="010-0000-0000" maxLength={20}
                onChange={e => patch({ phone: e.target.value })} />
            </Row>
          </Group>

          <Group title="근무">
            <Row label="근무 요일">
              <div className="day-pick" role="group" aria-label="근무 요일">
                {DAYS.map((d, i) => {
                  const on = daysOf(sel).includes(i);
                  return <button key={d} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => toggleDay(i)}>{d}</button>;
                })}
              </div>
            </Row>
            <Row label="매장 운영 시간과 같음" desc={`${minLabel(openMin)} ~ ${minLabel(closeMin)}`}>
              <Switch on={sel.workOpenMin == null} label="매장 운영 시간과 같음"
                onChange={same => patch(same
                  ? { workOpenMin: null, workCloseMin: null }
                  : { workOpenMin: openMin, workCloseMin: closeMin })} />
            </Row>
            {sel.workOpenMin != null && (
              <Row label="근무 시간">
                <div className="row-ctl hours-row">
                  <Select value={sel.workOpenMin} onChange={v => patch({ workOpenMin: Number(v) })} options={openOpts} />
                  <span className="hours-tilde">~</span>
                  <Select value={sel.workCloseMin} onChange={v => patch({ workCloseMin: Number(v) })} options={closeOpts} />
                </div>
              </Row>
            )}
          </Group>

          <Group title="휴가 · 반차 · 외출" className="pad">
            <LeavePanel staff={sel} allStaff={staff} leaves={leaves} openMin={openMin} closeMin={closeMin}
              error={leaveErr} onChanged={onLeavesChanged} />
          </Group>

          <Group title="정산 · 재직">
            <Row label="정산 비율" as="label">
              <input className="row-in strong" value={sel.commissionPct || 0} inputMode="numeric"
                onChange={e => patch({ commissionPct: Math.min(100, num(e.target.value)) })} />
              <span className="row-unit">%</span>
            </Row>
            <p className="set-note">정산액 = 그 담당자 매출 × 비율</p>
            <Row label="입사일">
              <div className="row-ctl">
                <DatePicker value={sel.joinedOn} placeholder="입력 안 함" aria-label="입사일" onChange={v => patch({ joinedOn: v })} />
              </div>
            </Row>
            <Row label="퇴사일">
              <div className="row-ctl">
                <DatePicker value={sel.leftOn} placeholder="재직 중" aria-label="퇴사일" onChange={v => patch({ leftOn: v })} />
              </div>
            </Row>
            <p className="set-note">퇴사일 다음 날부터 보드에서 빠지고, 예약·정산 기록은 남아요.</p>
          </Group>

          <Group title="메모">
            <textarea className="set-memo" value={sel.memo || ''} rows={3} maxLength={300} aria-label="메모"
              placeholder="특이사항, 할 수 있는 메뉴 등" onChange={e => patch({ memo: e.target.value })} />
          </Group>

          <div className="staff-danger">
            <button type="button" onClick={() => remove(sel)}>담당자 삭제</button>
            <p>저장하면 예약 기록까지 지워져요. 그만둔 직원은 삭제 대신 퇴사일을 넣어주세요.</p>
          </div>
        </div>
      )}
    </div>
    <FormBar dirty={dirty} changes={changes} status={status} onSave={submit}
      onCancel={() => { reset(); setSelId(null); setStatus({ kind: 'idle' }); }} />
  </>);
}

// ───────────── 매장 운영 (운영 시간 + 메뉴·가격) ─────────────
// 메뉴 초안 행: { id, name, sortOrder, cells: { [분]: '가격 숫자 문자열' } } — 키가 없으면 그 시간은 꺼짐
const toRows = menus => menus.map(m => ({
  id: m.id, name: m.name, sortOrder: m.sortOrder,
  cells: Object.fromEntries(m.durations.map((d, i) => [d, String(m.prices?.[i] ?? 0)])),
}));
const fmtStr = s => (s === '' ? '' : Number(s).toLocaleString('ko-KR'));

function StoreSection({ menus, openMin, closeMin, onMenusSaved, onHoursSaved, onDirty }) {
  const hoursSrc = useMemo(() => ({ openMin, closeMin }), [openMin, closeMin]);
  const menuSrc = useMemo(() => toRows(menus), [menus]);
  const H = useDraft(hoursSrc);
  const M = useDraft(menuSrc);
  const dirty = H.dirty || M.dirty;
  useEffect(() => onDirty(dirty), [dirty]);
  const { status, setStatus, save, fail } = useSaver();
  const [focusKey, setFocusKey] = useState(null); // 방금 켠 가격 칸에 포커스

  const hours = H.draft;
  // 운영시간 막대: 자정 넘어 영업하면 다음날 새벽 6시(30시간)까지 그린다
  const span = hours.closeMin > 1440 ? 1800 : 1440;
  const len = Math.max(0, hours.closeMin - hours.openMin);
  const setRow = (id, fn) => M.setDraft(rows => rows.map(r => (r.id === id ? fn(r) : r)));
  const setCell = (id, d, v) => setRow(id, r => ({ ...r, cells: { ...r.cells, [d]: v } }));
  const offCell = (id, d) => setRow(id, r => { const cells = { ...r.cells }; delete cells[d]; return { ...r, cells }; });
  const addMenu = () => M.setDraft(rows => [...rows, {
    id: tempId--, name: `메뉴 ${rows.length + 1}`,
    sortOrder: Math.max(-1, ...rows.map(r => r.sortOrder ?? 0)) + 1,
    cells: { 60: '0', 90: '0', 120: '0' },
  }]);

  const submit = () => {
    if (hours.closeMin <= hours.openMin) return fail('운영 시간: 종료 시각은 시작보다 늦어야 해요');
    const out = M.draft.map(r => {
      const durations = DUR_OPTIONS.filter(d => r.cells[d] !== undefined && r.cells[d] !== '');
      return { ...r, name: r.name.trim(), durations, prices: durations.map(d => Number(r.cells[d])) };
    });
    for (const m of out) {
      if (!m.name) return fail('메뉴 이름을 입력하세요');
      if (!m.durations.length) return fail(`${m.name}: 가격이 있는 시간이 최소 1개 필요해요`);
    }
    const removed = menus.filter(m => !M.draft.some(r => r.id === m.id));
    const hoursChanged = H.dirty, menusChanged = M.dirty;
    save(() => allSaved([
      hoursChanged ? api.updateSettings(hours) : null,
      ...(menusChanged ? [
        ...removed.map(m => api.deleteMenu(m.id)),
        ...out.map(m => {
          if (m.id < 0) return api.createMenu(m);
          const orig = menus.find(o => o.id === m.id);
          const same = orig.name === m.name
            && JSON.stringify(orig.durations) === JSON.stringify(m.durations)
            && JSON.stringify(orig.prices) === JSON.stringify(m.prices);
          return same ? null : api.updateMenu(m.id, m);
        }),
      ] : []),
    ]), () => { if (hoursChanged) onHoursSaved(); if (menusChanged) onMenusSaved(); });
  };

  return (<>
    <div className="set-cols">
      <Group title="운영 시간">
        <Row label="여는 시간">
          <div className="row-ctl">
            <Select value={hours.openMin} onChange={v => H.setDraft(d => ({ ...d, openMin: Number(v) }))} options={openOpts} />
          </div>
        </Row>
        <Row label="닫는 시간">
          <div className="row-ctl">
            <Select value={hours.closeMin} onChange={v => H.setDraft(d => ({ ...d, closeMin: Number(v) }))} options={closeOpts} />
          </div>
        </Row>
        <div className="hours-viz">
          <p>하루 {len / 60}시간 · 담당자별 근무 시간은 담당자에서 따로 정해요.</p>
          <div className="hours-bar">
            <i style={{ left: `${hours.openMin / span * 100}%`, width: `${len / span * 100}%` }} />
          </div>
          <div className="hours-ticks">
            <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span>{span > 1440 && <span>새벽 6시</span>}
          </div>
        </div>
      </Group>

      <section className="set-grp">
        <div className="set-grp-h">
          <h3>메뉴 · 가격</h3>
          <button type="button" className="set-link" onClick={addMenu}>+ 메뉴 추가</button>
        </div>
        {M.draft.map(r => (
          <div className="set-box menu-card" key={r.id}>
            <div className="menu-card-h">
              <input className="inl" value={r.name} maxLength={10} aria-label="메뉴 이름"
                onChange={e => setRow(r.id, x => ({ ...x, name: e.target.value }))} />
              <IconButton label={`${r.name} 삭제`} danger
                onClick={() => M.setDraft(rows => rows.filter(x => x.id !== r.id))}><TrashIcon /></IconButton>
            </div>
            <div className="price-cells">
              {DUR_OPTIONS.map(d => (r.cells[d] !== undefined ? (
                <label className="price-cell on" key={d}>
                  <small>{d}분</small>
                  <span>
                    <input value={fmtStr(r.cells[d])} inputMode="numeric" aria-label={`${r.name} ${d}분 가격`}
                      onChange={e => setCell(r.id, d, e.target.value.replace(/\D/g, ''))}
                      onBlur={e => e.target.value === '' && offCell(r.id, d)}
                      autoFocus={focusKey === `${r.id}-${d}`} onFocus={e => e.target.select()} />원
                  </span>
                </label>
              ) : (
                <button key={d} type="button" className="price-cell off" aria-label={`${r.name} ${d}분 켜기`}
                  onClick={() => { setFocusKey(`${r.id}-${d}`); setCell(r.id, d, '0'); }}>+ {d}분</button>
              )))}
            </div>
          </div>
        ))}
        <p className="set-legend">가격이 있는 시간만 예약할 때 고를 수 있어요. 가격을 지우면 그 시간은 꺼져요.</p>
      </section>
    </div>

    <FormBar dirty={dirty} changes={H.changes + M.changes} status={status} onSave={submit}
      onCancel={() => { H.reset(); M.reset(); setStatus({ kind: 'idle' }); }} />
  </>);
}

// ───────────── 화면 (이 기기에만 저장) ─────────────
// 고르는 즉시 미리보기로 적용하고, [저장]해야 기기에 남는다. 저장 안 하고 나가면 원래대로.
const BOARD_TOGGLES = [
  ['halfLine', '30분 보조선', '보드에 30분마다 점선을 그어요'],
  ['hidePrice', '금액 숨기기', '예약 화면에서 금액을 감춰요 (결제 탭에는 보여요)'],
];
const DEVICE_TOGGLES = [
  ['dark', '다크 모드', '어두운 배경으로 바꿔요'],
  ['keepAwake', '화면 항상 켜기', '앱이 떠 있는 동안 화면이 꺼지지 않아요'],
];
// 밀도·보조선·금액 숨기기를 바로 확인하는 작은 보드 (오후 1~4시, 예시 예약 2건)
const PV = [
  { c: PALETTE[0], start: 810, dur: 60, what: '타이 60분', price: '50,000원' },
  { c: PALETTE[1], start: 780, dur: 90, what: '아로마 90분', price: '80,000원' },
];
const clock = m => minLabel(m).split(' ')[1];

function BoardPreview({ d }) {
  const h = Math.round(d.hourPx * 0.8);
  const lines = [0, 1, 2].flatMap(i => [
    <i key={i} className="hline" style={{ top: i * h }} />,
    d.halfLine && <i key={`${i}h`} className="hline half" style={{ top: i * h + h / 2 }} />,
  ]);
  return (
    <div className="pv" style={{ '--h': `${h}px` }} aria-hidden="true">
      <span className="pv-h" />
      {PV.map((p, i) => <span key={i} className="pv-h"><i className="dot" style={{ background: p.c }} />담당자 {i + 1}</span>)}
      <div className="pv-t">{[13, 14, 15].map((x, i) => <span key={x} style={{ top: i * h }}>{minLabel(x * 60)}</span>)}</div>
      {PV.map((p, i) => (
        <div key={i} className="pv-col">
          {lines}
          <div className="resv" style={{ '--c': p.c, top: (p.start - 780) / 60 * h + 2, height: p.dur / 60 * h - 4 }}>
            <small>{clock(p.start)} – {clock(p.start + p.dur)}</small>
            <b>예시 손님</b>
            <span>{p.what}{d.hidePrice ? '' : ` · ${p.price}`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DisplaySection({ display, onDisplay, onDirty }) {
  const [saved, setSaved] = useState(loadDisplay);
  const savedRef = useRef(saved); savedRef.current = saved;
  const dirty = JSON.stringify(display) !== JSON.stringify(saved);
  useEffect(() => onDirty(dirty), [dirty]);
  useEffect(() => () => onDisplay(savedRef.current), []); // 나갈 때 저장 안 한 미리보기 되돌림
  const { status, setStatus } = useSaver();
  const set = p => { onDisplay(d => ({ ...d, ...p })); setStatus({ kind: 'idle' }); };
  const wakeOk = 'wakeLock' in navigator;
  const toggles = list => list.map(([key, label, desc]) => {
    const off = key === 'keepAwake' && !wakeOk;
    return (
      <Row key={key} label={label} desc={desc + (off ? ' — 이 브라우저는 지원하지 않아요' : '')}>
        <Switch on={display[key]} label={label} disabled={off} onChange={v => set({ [key]: v })} />
      </Row>
    );
  });

  return (<>
    <div className="set-cols">
      <Group title="글자 · 보드">
        <Row label="글자 크기">
          <div className="seg-chips" role="group" aria-label="글자 크기">
            {FONT_SIZES.map(px => (
              <button key={px} type="button" aria-pressed={px === display.fontPx} onClick={() => set({ fontPx: px })}>
                {px}{px === BASE_FONT ? ' 기본' : ''}
              </button>
            ))}
          </div>
        </Row>
        <Row label="보드 밀도">
          <div className="seg-chips" role="group" aria-label="보드 밀도">
            {DENSITIES.map(({ label, v }) => (
              <button key={v} type="button" aria-pressed={v === display.hourPx} onClick={() => set({ hourPx: v })}>{label}</button>
            ))}
          </div>
        </Row>
        <div className="disp-preview">
          <p>보드 미리보기</p>
          <BoardPreview d={display} />
        </div>
      </Group>
      <div className="set-stack">
        <Group title="보드 표시">{toggles(BOARD_TOGGLES)}</Group>
        <Group title="이 기기">{toggles(DEVICE_TOGGLES)}</Group>
      </div>
    </div>
    <FormBar dirty={dirty} changes={countChanges(display, saved)} status={status}
      onSave={() => { saveDisplay(display); setSaved(display); setStatus({ kind: 'saved' }); }}
      onCancel={() => { onDisplay(saved); setStatus({ kind: 'idle' }); }} />
  </>);
}

// 계정: 매장 이름 · 사장님 PIN 바꾸기 · 로그아웃 (바로 반영 — 저장 바 없음)
function AccountSection({ shop, email, onShopChanged }) {
  const [name, setName] = useState(shop.name);
  const [nameMsg, setNameMsg] = useState('');
  const [pins, setPins] = useState({ cur: '', next: '', again: '' });
  const [pinMsg, setPinMsg] = useState(null); // { ok, text }
  const [busy, setBusy] = useState(false);
  const digits = v => v.replace(/\D/g, '').slice(0, 4);
  const setPin = k => e => { setPins(p => ({ ...p, [k]: digits(e.target.value) })); setPinMsg(null); };

  const rename = async () => {
    const n = name.trim();
    if (!n || n === shop.name) { setName(shop.name); return; }
    try { await api.renameShop(n); await onShopChanged(); setNameMsg('바꿨어요'); }
    catch (e) { setNameMsg(e.message); }
  };
  const changePin = async e => {
    e.preventDefault();
    if (pins.cur.length !== 4 || pins.next.length !== 4) return setPinMsg({ ok: false, text: 'PIN은 숫자 4자리예요' });
    if (pins.next !== pins.again) return setPinMsg({ ok: false, text: '새 PIN 확인이 달라요' });
    setBusy(true);
    try {
      const ok = await api.setPin(pins.cur, pins.next);
      setPinMsg(ok ? { ok: true, text: 'PIN을 바꿨어요' } : { ok: false, text: '지금 PIN이 맞지 않아요' });
      if (ok) setPins({ cur: '', next: '', again: '' });
    } catch (e2) { setPinMsg({ ok: false, text: e2.message }); }
    setBusy(false);
  };
  const pinInput = (k, label) => (
    <Row as="label" label={label}>
      <input className="inl acc-pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
        value={pins[k]} onChange={setPin(k)} placeholder="••••" />
    </Row>
  );

  return (
    <div className="set-cols">
      <div className="set-stack">
        <Group title="매장">
          <Row as="label" label="매장 이름">
            <input className="inl" value={name} maxLength={30} onChange={e => { setName(e.target.value); setNameMsg(''); }}
              onBlur={rename} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
          </Row>
          {nameMsg && <p className="set-note">{nameMsg}</p>}
          <Row label="로그인 계정"><span className="acc-email">{email}</span></Row>
        </Group>
        <Group title="로그아웃">
          <div className="set-row">
            <span className="set-row-t"><b>이 기기에서 로그아웃</b><small>다시 쓰려면 이메일·비밀번호로 로그인해야 해요</small></span>
            <button type="button" className="btn btn-danger" onClick={() => window.confirm('로그아웃할까요?') && auth.signOut()}>로그아웃</button>
          </div>
        </Group>
      </div>
      <Group title="사장님 PIN 바꾸기">
        <form onSubmit={changePin}>
          {pinInput('cur', '지금 PIN')}
          {pinInput('next', '새 PIN')}
          {pinInput('again', '새 PIN 확인')}
          {pinMsg && <p className={'set-note' + (pinMsg.ok ? ' ok' : ' bad')}>{pinMsg.text}</p>}
          <div className="set-row acc-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>PIN 바꾸기</button>
          </div>
        </form>
      </Group>
    </div>
  );
}
