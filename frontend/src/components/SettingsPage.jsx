import { useState } from 'react';
import { api } from '../api';
import { DUR_OPTIONS, PALETTE, minLabel } from '../lib/constants';
import { Button, Select } from './ui';

const SECTIONS = [
  ['staff', '담당자'],
  ['menu', '메뉴·가격'],
  ['hours', '운영 시간'],
];
const fmt = n => (n || 0).toLocaleString('ko-KR');
const num = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 설정: 좌측 서브메뉴 + 섹션 하나씩. 변경은 blur/클릭 즉시 저장
export default function SettingsPage({ staff, menus, settings, onStaffChanged, onMenusChanged, onSettingsChanged }) {
  const [sec, setSec] = useState('menu');
  const [status, setStatus] = useState({ kind: 'idle' }); // idle | saving | saved | error
  const [focusKey, setFocusKey] = useState(null);         // 방금 켠 가격 칸에 포커스
  const run = (fn, after) => {
    setStatus({ kind: 'saving' });
    return fn().then(() => { setStatus({ kind: 'saved' }); after(); })
      .catch(e => setStatus({ kind: 'error', msg: e.message || String(e) }));
  };
  const fail = msg => setStatus({ kind: 'error', msg });

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
  const blurPrice = (m, d, raw) => {
    if (raw.trim() === '') return setCell(m, d, null);
    const p = num(raw);
    if (p !== priceOf(m, d)) setCell(m, d, p);
  };

  // ── 업무시간
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

  const statusEl = status.kind === 'error'
    ? <span className="set-status err">{status.msg}</span>
    : <span className="set-status"><i className={status.kind === 'saving' ? 'saving' : ''} />
        {status.kind === 'saving' ? '저장 중' : status.kind === 'saved' ? '저장됨' : '변경은 바로 저장돼요'}</span>;

  return (
    <div className="settings">
      <nav className="set-nav" aria-label="설정 메뉴">
        <span className="set-nav-title">설정</span>
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
              <p>보드의 세로 칸 하나가 담당자 한 명이에요. 삭제하면 그 담당자의 예약도 함께 삭제됩니다.</p>
            </div>
            <div className="set-head-right">
              {statusEl}
              <Button variant="primary" className="set-add" onClick={() =>
                run(() => api.createStaff({
                  name: `직원 ${staff.length}`,
                  dotColor: PALETTE[staff.length % PALETTE.length],
                  sortOrder: Math.max(-1, ...staff.map(x => x.sortOrder ?? 0)) + 1,
                }), onStaffChanged)}>+ 담당자 추가</Button>
            </div>
          </header>
          <div className="set-card">
            {staff.map(s => (
              <div className="staff-row" key={s.id}>
                <div className="pal-wrap">
                  <button type="button" className="dot-btn" aria-label={`${s.name} 색 바꾸기`}>
                    <i className="dot" style={{ background: s.dotColor || '#d1d6db' }} />
                  </button>
                  <div className="pal" role="group" aria-label="색 고르기">
                    {PALETTE.map(c => (
                      <button key={c} type="button" className={'pal-c' + (c === s.dotColor ? ' on' : '')}
                        style={{ background: c }} aria-label={c} aria-pressed={c === s.dotColor}
                        onClick={() => c !== s.dotColor && run(() => api.updateStaff(s.id, { ...s, dotColor: c }), onStaffChanged)} />
                    ))}
                  </div>
                </div>
                <input className="inl" defaultValue={s.name} maxLength={10} aria-label="담당자 이름"
                  onBlur={e => {
                    const v = e.target.value.trim();
                    if (v && v !== s.name) run(() => api.updateStaff(s.id, { ...s, name: v }), onStaffChanged);
                  }} />
                <button type="button" className="icon-btn" aria-label={`${s.name} 삭제`} onClick={() => {
                  if (staff.length === 1) return fail('담당자는 최소 1명 필요해요');
                  if (!window.confirm(`'${s.name}' 담당자와 그 담당자의 예약이 모두 삭제됩니다. 계속할까요?`)) return;
                  run(() => api.deleteStaff(s.id), onStaffChanged);
                }}><TrashIcon /></button>
              </div>
            ))}
          </div>
        </>)}

        {sec === 'menu' && (<>
          <header className="set-head">
            <div>
              <h1>메뉴·가격</h1>
              <p>가격이 있는 칸만 예약할 때 고를 수 있어요. 가격을 비우면 그 시간은 꺼져요.</p>
            </div>
            <div className="set-head-right">
              {statusEl}
              <Button variant="primary" className="set-add" onClick={() =>
                run(() => api.createMenu({
                  name: `메뉴 ${menus.length + 1}`,
                  durations: [60, 90, 120],
                  prices: [0, 0, 0],
                  sortOrder: Math.max(-1, ...menus.map(x => x.sortOrder ?? 0)) + 1,
                }), onMenusChanged)}>+ 메뉴 추가</Button>
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
                      <input className="inl" defaultValue={m.name} maxLength={10} aria-label="메뉴 이름"
                        onBlur={e => {
                          const v = e.target.value.trim();
                          if (v && v !== m.name) run(() => api.updateMenu(m.id, { ...m, name: v }), onMenusChanged);
                        }} />
                    </td>
                    {DUR_OPTIONS.map(d => (
                      <td key={d}>
                        {m.durations.includes(d) ? (
                          <input className="cell-price" key={`${m.id}-${d}-${priceOf(m, d)}`} inputMode="numeric"
                            aria-label={`${m.name} ${d}분 가격`} defaultValue={fmt(priceOf(m, d))}
                            autoFocus={focusKey === `${m.id}-${d}`}
                            onFocus={e => e.target.select()}
                            onBlur={e => blurPrice(m, d, e.target.value)} />
                        ) : (
                          <button type="button" className="cell-off" aria-label={`${m.name} ${d}분 켜기`}
                            onClick={() => enable(m, d)}>+</button>
                        )}
                      </td>
                    ))}
                    <td>
                      <button type="button" className="icon-btn" aria-label={`${m.name} 삭제`} onClick={() => {
                        if (!window.confirm(`'${m.name}' 메뉴를 삭제할까요?`)) return;
                        run(() => api.deleteMenu(m.id), onMenusChanged);
                      }}><TrashIcon /></button>
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
        </>)}

        {sec === 'hours' && (<>
          <header className="set-head">
            <div>
              <h1>운영 시간</h1>
              <p>예약 보드에 보이는 시간 범위예요.</p>
            </div>
            <div className="set-head-right">{statusEl}</div>
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
      </div>
    </div>
  );
}
