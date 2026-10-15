import { useState } from 'react';
import { api } from '../api';
import { DAYS, DUR_OPTIONS, PALETTE, minLabel } from '../lib/constants';
import { BASE_FONT, FONT_SIZES, DENSITIES } from '../lib/display';
import {
  BlurInput, Button, Checkbox, ChipGroup, Chevron, ColorPicker, Field, FieldGroup,
  IconButton, SaveStatus, Select, TrashIcon,
} from './ui';

const SECTIONS = [
  ['staff', '담당자'],
  ['menu', '메뉴·가격'],
  ['hours', '운영 시간'],
  ['display', '화면'],
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_OPTS = DAYS.map((d, i) => ({ value: i, label: d }));
const fmt = n => (n || 0).toLocaleString('ko-KR');
const num = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
const confirmDelete = msg => window.confirm(msg);

// 설정: 좌측 서브메뉴 + 섹션 하나씩. 변경은 blur/클릭 즉시 저장
export default function SettingsPage({ staff, menus, settings, display, onDisplay, onStaffChanged, onMenusChanged, onSettingsChanged }) {
  const [sec, setSec] = useState('menu');
  const [status, setStatus] = useState({ kind: 'idle' });
  const [focusKey, setFocusKey] = useState(null);   // 방금 켠 가격 칸에 포커스
  const [selId, setSelId] = useState(null);         // 담당자 상세 패널에 열린 사람
  const setDisp = patch => { onDisplay(d => ({ ...d, ...patch })); setStatus({ kind: 'saved' }); };
  const run = (fn, after) => {
    setStatus({ kind: 'saving' });
    return fn().then(() => { setStatus({ kind: 'saved' }); after(); })
      .catch(e => setStatus({ kind: 'error', msg: e.message || String(e) }));
  };
  const fail = msg => setStatus({ kind: 'error', msg });

  // ── 운영 시간 (담당자 근무시간 기본값으로도 쓰임)
  const openMin = settings?.openMin ?? 360;
  const closeMin = settings?.closeMin ?? 1320;
  const saveHours = patch => {
    const next = { openMin, closeMin, ...patch };
    if (next.closeMin <= next.openMin) return fail('종료 시각은 시작보다 늦어야 해요');
    run(() => api.updateSettings(next), onSettingsChanged);
  };
  const openOpts = Array.from({ length: 24 }, (_, h) => ({ value: h * 60, label: minLabel(h * 60) }));
  const closeOpts = Array.from({ length: 24 }, (_, i) => {
    const h = i + 1;
    return { value: h * 60, label: h === 24 ? '자정' : minLabel(h * 60) };
  });

  // ── 담당자
  const sel = staff.find(s => s.id === selId) ?? staff[0];
  const patchStaff = (s, patch) => run(() => api.updateStaff(s.id, { ...s, ...patch }), onStaffChanged);
  const move = (i, dir) => {
    const a = staff[i], b = staff[i + dir];
    if (!b) return;
    run(() => Promise.all([
      api.updateStaff(a.id, { ...a, sortOrder: i + dir }),
      api.updateStaff(b.id, { ...b, sortOrder: i }),
    ]), onStaffChanged);
  };
  const daysOf = s => s.workDays ?? ALL_DAYS;
  const toggleDay = (s, d) => {
    const days = daysOf(s);
    patchStaff(s, { workDays: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() });
  };
  const summary = s => {
    const days = daysOf(s);
    const parts = [days.length === 7 ? '매일' : days.length ? days.map(d => DAYS[d]).join('·') : '근무일 없음'];
    if (s.commissionPct) parts.push(`${s.commissionPct}%`);
    if (s.leftOn) parts.push(`퇴사 ${s.leftOn}`);
    return parts.join(' · ');
  };
  const saveStaffHours = (s, patch) => {
    const next = { workOpenMin: s.workOpenMin ?? openMin, workCloseMin: s.workCloseMin ?? closeMin, ...patch };
    if (next.workCloseMin <= next.workOpenMin) return fail('종료 시각은 시작보다 늦어야 해요');
    patchStaff(s, next);
  };
  const addStaff = () => run(() => api.createStaff({
    name: `직원 ${staff.length}`,
    dotColor: PALETTE[staff.length % PALETTE.length],
    sortOrder: Math.max(-1, ...staff.map(x => x.sortOrder ?? 0)) + 1,
  }), onStaffChanged);
  const deleteStaff = s => {
    if (staff.length === 1) return fail('담당자는 최소 1명 필요해요');
    if (!confirmDelete(`'${s.name}' 담당자와 그 담당자의 예약 기록이 모두 삭제됩니다. 퇴사한 직원은 삭제 대신 퇴사일을 넣으세요. 계속할까요?`)) return;
    setSelId(null);
    run(() => api.deleteStaff(s.id), onStaffChanged);
  };

  // ── 메뉴: durations/prices 는 같은 인덱스로 짝지어짐
  const priceOf = (m, d) => m.prices?.[m.durations.indexOf(d)] ?? 0;
  const setCell = (m, d, price) => {           // price === null 이면 그 시간 끔
    const pairs = m.durations.map((x, i) => [x, m.prices?.[i] ?? 0]).filter(([x]) => x !== d);
    if (price !== null) pairs.push([d, price]);
    if (!pairs.length) return fail('시간은 최소 1개 필요해요');
    pairs.sort((a, b) => a[0] - b[0]);
    run(() => api.updateMenu(m.id, { ...m, durations: pairs.map(p => p[0]), prices: pairs.map(p => p[1]) }), onMenusChanged);
  };
  const enable = (m, d) => { setFocusKey(`${m.id}-${d}`); setCell(m, d, 0); };
  const addMenu = () => run(() => api.createMenu({
    name: `메뉴 ${menus.length + 1}`,
    durations: [60, 90, 120],
    prices: [0, 0, 0],
    sortOrder: Math.max(-1, ...menus.map(x => x.sortOrder ?? 0)) + 1,
  }), onMenusChanged);
  const deleteMenu = m => {
    if (!confirmDelete(`'${m.name}' 메뉴를 삭제할까요?`)) return;
    run(() => api.deleteMenu(m.id), onMenusChanged);
  };

  return (
    <div className="settings">
      <nav className="set-nav" aria-label="설정 메뉴">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" className={'set-nav-item' + (sec === k ? ' on' : '')}
            aria-current={sec === k ? 'page' : undefined} onClick={() => { setSec(k); setStatus({ kind: 'idle' }); }}>
            {label}
          </button>
        ))}
      </nav>

      <div className="set-body">
        {sec === 'staff' && (<>
          <header className="set-head">
            <div>
              <h1>담당자</h1>
              <p>보드의 세로 칸 하나가 담당자 한 명이에요. 순서가 보드 칸 순서예요.</p>
            </div>
            <div className="set-head-right">
              <SaveStatus status={status} />
              <Button variant="primary" className="set-add" onClick={addStaff}>+ 담당자 추가</Button>
            </div>
          </header>
          <div className="staff-layout">
            <div className="set-card staff-list">
              {staff.map((s, i) => (
                <div className={'staff-row' + (sel?.id === s.id ? ' on' : '')} key={s.id}>
                  <button type="button" className="staff-pick" onClick={() => setSelId(s.id)}
                    aria-current={sel?.id === s.id ? 'true' : undefined}>
                    <i className="dot" style={{ background: s.dotColor || '#d1d6db' }} />
                    <span className="staff-name">{s.name}</span>
                    <span className="staff-sum">{summary(s)}</span>
                  </button>
                  <IconButton label="위로" className="order" disabled={i === 0} onClick={() => move(i, -1)}><Chevron dir="up" /></IconButton>
                  <IconButton label="아래로" className="order" disabled={i === staff.length - 1} onClick={() => move(i, 1)}><Chevron dir="down" /></IconButton>
                </div>
              ))}
            </div>

            {sel && (
              <div className="set-card staff-panel" key={sel.id}>
                <div className="staff-panel-head">
                  <ColorPicker value={sel.dotColor} palette={PALETTE} label={`${sel.name} 색 바꾸기`}
                    onChange={c => patchStaff(sel, { dotColor: c })} />
                  <BlurInput className="inl" value={sel.name} maxLength={10} aria-label="담당자 이름"
                    onCommit={v => v && patchStaff(sel, { name: v })} />
                </div>

                <Field label="연락처">
                  <BlurInput value={sel.phone || ''} inputMode="tel" placeholder="010-0000-0000" maxLength={20}
                    onCommit={v => patchStaff(sel, { phone: v })} />
                </Field>

                <FieldGroup label="근무 요일">
                  <ChipGroup options={DAY_OPTS} selected={daysOf(sel)} onToggle={d => toggleDay(sel, d)} />
                </FieldGroup>

                <FieldGroup label="근무 시간">
                  <Checkbox label="매장 운영 시간과 같음" checked={sel.workOpenMin == null}
                    onChange={same => patchStaff(sel, same
                      ? { workOpenMin: null, workCloseMin: null }
                      : { workOpenMin: openMin, workCloseMin: closeMin })} />
                  {sel.workOpenMin != null && (
                    <div className="hours-row">
                      <Select value={sel.workOpenMin} onChange={v => saveStaffHours(sel, { workOpenMin: Number(v) })} options={openOpts} />
                      <span className="hours-tilde">~</span>
                      <Select value={sel.workCloseMin} onChange={v => saveStaffHours(sel, { workCloseMin: Number(v) })} options={closeOpts} />
                    </div>
                  )}
                </FieldGroup>

                <div className="m-row">
                  <Field label="정산 비율">
                    <div className="suffix">
                      <BlurInput value={sel.commissionPct || 0} inputMode="numeric" aria-label="정산 비율"
                        parse={v => Math.min(100, num(v))} onCommit={v => patchStaff(sel, { commissionPct: v })} />
                      <span>%</span>
                    </div>
                  </Field>
                  <Field label="입사일">
                    <input type="date" defaultValue={sel.joinedOn || ''}
                      onChange={e => patchStaff(sel, { joinedOn: e.target.value || null })} />
                  </Field>
                  <Field label="퇴사일">
                    <input type="date" defaultValue={sel.leftOn || ''}
                      onChange={e => patchStaff(sel, { leftOn: e.target.value || null })} />
                  </Field>
                </div>
                <span className="set-hint">퇴사일 다음 날부터 보드에서 사라지고, 예약·정산 기록은 남아요. 정산액 = 매출 × 비율.</span>

                <Field label="메모">
                  <BlurInput multiline value={sel.memo || ''} rows={3} maxLength={300} parse={v => v}
                    placeholder="특이사항, 가능한 메뉴 등" onCommit={v => patchStaff(sel, { memo: v })} />
                </Field>

                <div className="staff-panel-foot">
                  <Button variant="danger" className="small" onClick={() => deleteStaff(sel)}>담당자 삭제</Button>
                  <span className="set-hint">예약 기록까지 지워져요</span>
                </div>
              </div>
            )}
          </div>
        </>)}

        {sec === 'menu' && (<>
          <header className="set-head">
            <div>
              <h1>메뉴·가격</h1>
              <p>가격이 있는 칸만 예약할 때 고를 수 있어요. 가격을 비우면 그 시간은 꺼져요.</p>
            </div>
            <div className="set-head-right">
              <SaveStatus status={status} />
              <Button variant="primary" className="set-add" onClick={addMenu}>+ 메뉴 추가</Button>
            </div>
          </header>
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
                {menus.map(m => (
                  <tr key={m.id}>
                    <td>
                      <BlurInput className="inl" value={m.name} maxLength={10} aria-label="메뉴 이름"
                        onCommit={v => v && run(() => api.updateMenu(m.id, { ...m, name: v }), onMenusChanged)} />
                    </td>
                    {DUR_OPTIONS.map(d => (
                      <td key={d}>
                        {m.durations.includes(d) ? (
                          <BlurInput className="cell-price" value={priceOf(m, d)} inputMode="numeric"
                            aria-label={`${m.name} ${d}분 가격`} format={fmt}
                            parse={v => v.trim() === '' ? null : num(v)}
                            onCommit={v => setCell(m, d, v)}
                            autoFocus={focusKey === `${m.id}-${d}`} onFocus={e => e.target.select()} />
                        ) : (
                          <button type="button" className="cell-off" aria-label={`${m.name} ${d}분 켜기`}
                            onClick={() => enable(m, d)}>+</button>
                        )}
                      </td>
                    ))}
                    <td><IconButton label={`${m.name} 삭제`} danger onClick={() => deleteMenu(m)}><TrashIcon /></IconButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="set-legend">
            <span><i className="lg-on" />가격 있음 = 예약 가능</span>
            <span><i className="lg-off" />누르면 켜짐</span>
          </p>
        </>)}

        {sec === 'hours' && (<>
          <header className="set-head">
            <div>
              <h1>운영 시간</h1>
              <p>예약 보드에 보이는 시간 범위예요. 담당자별 근무 시간은 담당자에서 따로 정해요.</p>
            </div>
            <div className="set-head-right"><SaveStatus status={status} /></div>
          </header>
          <div className="set-card hours-card">
            <div className="hours-row">
              <Select value={openMin} onChange={v => saveHours({ openMin: Number(v) })} options={openOpts} />
              <span className="hours-tilde">~</span>
              <Select value={closeMin} onChange={v => saveHours({ closeMin: Number(v) })} options={closeOpts} />
            </div>
            <div className="hours-bar">
              <i style={{ left: `${openMin / 14.4}%`, width: `${(closeMin - openMin) / 14.4}%` }} />
            </div>
            <div className="hours-ticks"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
            <span className="set-hint">하루 {(closeMin - openMin) / 60}시간 표시</span>
          </div>
        </>)}

        {sec === 'display' && (<>
          <header className="set-head">
            <div>
              <h1>화면</h1>
              <p>이 기기에서만 적용돼요. 기기마다 따로 설정할 수 있어요.</p>
            </div>
            <div className="set-head-right"><SaveStatus status={status} /></div>
          </header>
          <div className="set-card display-card">
            <FieldGroup label="글자 크기">
              <div className="chips" role="group" aria-label="글자 크기">
                {FONT_SIZES.map(px => (
                  <button key={px} type="button" className={'chip-tg' + (px === display.fontPx ? ' on' : '')}
                    aria-pressed={px === display.fontPx} onClick={() => setDisp({ fontPx: px })}>
                    {px}px{px === BASE_FONT ? ' (기본)' : ''}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <FieldGroup label="보드 밀도">
              <div className="chips" role="group" aria-label="보드 밀도">
                {DENSITIES.map(({ label, v }) => (
                  <button key={v} type="button" className={'chip-tg' + (v === display.hourPx ? ' on' : '')}
                    aria-pressed={v === display.hourPx} onClick={() => setDisp({ hourPx: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </FieldGroup>
            {[
              ['halfLine', '30분 보조선', '보드에 30분 단위 점선을 표시해요'],
              ['hidePrice', '금액 숨기기', '예약 화면에서 금액을 감춰요 (결제 탭에는 표시)'],
              ['dark', '다크 모드', '어두운 배경으로 바꿔요'],
              ['keepAwake', '화면 항상 켜기', '앱이 떠 있는 동안 화면이 꺼지지 않아요' + ('wakeLock' in navigator ? '' : ' — 이 브라우저는 지원하지 않아요')],
            ].map(([key, label, desc]) => (
              <div className="disp-row toggle-row" key={key}>
                <div>
                  <span className="set-label">{label}</span>
                  <p className="set-hint">{desc}</p>
                </div>
                <button type="button" role="switch" aria-checked={!!display[key]}
                  aria-label={label}
                  disabled={key === 'keepAwake' && !('wakeLock' in navigator)}
                  className={'switch' + (display[key] ? ' on' : '')}
                  onClick={() => setDisp({ [key]: !display[key] })}>
                  <i />
                </button>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}
