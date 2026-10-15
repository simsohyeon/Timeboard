import { useState } from 'react';
import { api } from '../api';
import { DUR_OPTIONS, PALETTE, minLabel } from '../lib/constants';
import { Button, Select } from './ui';

// 설정: 담당자 관리 / 메뉴 관리 / 업무시간
export default function SettingsPage({ staff, menus, settings, onStaffChanged, onMenusChanged, onSettingsChanged }) {
  const [err, setErr] = useState('');
  const run = (fn, after) => fn().then(() => { setErr(''); after(); }).catch(e => setErr(e.message || String(e)));

  // ── 메뉴: 시간 토글 시 가격 배열을 같은 순서로 유지
  const toggleDur = (m, d) => {
    const prices = m.durations.map((_, i) => m.prices?.[i] ?? 0);
    let ds, ps;
    if (m.durations.includes(d)) {
      if (m.durations.length === 1) return setErr('시간은 최소 1개 필요해요');
      const ri = m.durations.indexOf(d);
      ds = m.durations.filter(x => x !== d);
      ps = prices.filter((_, i) => i !== ri);
    } else {
      ds = [...m.durations, d].sort((a, b) => a - b);
      ps = [...prices];
      ps.splice(ds.indexOf(d), 0, 0);
    }
    run(() => api.updateMenu(m.id, { ...m, durations: ds, prices: ps }), onMenusChanged);
  };

  const setPrice = (m, i, val) => {
    const ps = m.durations.map((_, j) => m.prices?.[j] ?? 0);
    ps[i] = parseInt(String(val).replace(/\D/g, ''), 10) || 0;
    run(() => api.updateMenu(m.id, { ...m, prices: ps }), onMenusChanged);
  };

  // ── 업무시간
  const openMin = settings?.openMin ?? 360;
  const closeMin = settings?.closeMin ?? 1320;
  const saveHours = patch => {
    const next = { openMin, closeMin, ...patch };
    if (next.closeMin <= next.openMin) return setErr('종료 시각은 시작보다 늦어야 해요');
    run(() => api.updateSettings(next), onSettingsChanged);
  };
  const openOpts = Array.from({ length: 24 }, (_, h) => ({ value: h * 60, label: minLabel(h * 60) }));
  const closeOpts = Array.from({ length: 24 }, (_, i) => {
    const h = i + 1;
    return { value: h * 60, label: h === 24 ? '자정' : minLabel(h * 60) };
  });

  return (
    <div className="settings">
      <section className="set-card">
        <h3>담당자 관리</h3>
        <p className="set-hint">점을 누르면 색이 바뀌어요. 담당자를 삭제하면 그 담당자의 예약도 함께 삭제됩니다.</p>
        {staff.map(s => (
          <div className="menu-row" key={s.id}>
            <button type="button" className="dot-btn" aria-label="색 변경"
              onClick={() => {
                const next = PALETTE[(PALETTE.indexOf(s.dotColor) + 1) % PALETTE.length];
                run(() => api.updateStaff(s.id, { ...s, dotColor: next }), onStaffChanged);
              }}>
              <i className="dot" style={{ background: s.dotColor || '#d1d6db' }} />
            </button>
            <input defaultValue={s.name} maxLength={10} aria-label="담당자 이름"
              onBlur={e => {
                const v = e.target.value.trim();
                if (v && v !== s.name) run(() => api.updateStaff(s.id, { ...s, name: v }), onStaffChanged);
              }} />
            <Button variant="danger" className="small" onClick={() => {
              if (staff.length === 1) return setErr('담당자는 최소 1명 필요해요');
              if (!window.confirm(`'${s.name}' 담당자와 그 담당자의 예약이 모두 삭제됩니다. 계속할까요?`)) return;
              run(() => api.deleteStaff(s.id), onStaffChanged);
            }}>삭제</Button>
          </div>
        ))}
        <button type="button" className="menu-add" onClick={() =>
          run(() => api.createStaff({
            name: `직원 ${staff.length}`,
            dotColor: PALETTE[staff.length % PALETTE.length],
            sortOrder: Math.max(-1, ...staff.map(x => x.sortOrder ?? 0)) + 1,
          }), onStaffChanged)}>
          + 담당자 추가
        </button>
      </section>

      <section className="set-card">
        <h3>메뉴 관리</h3>
        <p className="set-hint">켜 둔 시간만 예약할 때 고를 수 있고, 가격은 예약 금액에 자동으로 들어가요.</p>
        {menus.map(m => (
          <div className="menu-card" key={m.id}>
            <div className="menu-row">
              <input defaultValue={m.name} maxLength={10} aria-label="메뉴 이름"
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v && v !== m.name) run(() => api.updateMenu(m.id, { ...m, name: v }), onMenusChanged);
                }} />
              <div className="dur-chips">
                {DUR_OPTIONS.map(d => (
                  <button key={d} type="button"
                    className={'chip-dur' + (m.durations.includes(d) ? ' on' : '')}
                    onClick={() => toggleDur(m, d)}>{d}</button>
                ))}
              </div>
              <Button variant="danger" className="small"
                onClick={() => run(() => api.deleteMenu(m.id), onMenusChanged)}>삭제</Button>
            </div>
            <div className="price-rows">
              {m.durations.map((d, i) => (
                <label className="price-row" key={d}>
                  <span>{d}분</span>
                  <input inputMode="numeric" defaultValue={m.prices?.[i] ?? 0}
                    onBlur={e => setPrice(m, i, e.target.value)} />
                  <span>원</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="menu-add" onClick={() =>
          run(() => api.createMenu({
            name: `메뉴 ${menus.length + 1}`,
            durations: [60, 90, 120],
            sortOrder: Math.max(-1, ...menus.map(x => x.sortOrder ?? 0)) + 1,
          }), onMenusChanged)}>
          + 메뉴 추가
        </button>
      </section>

      <section className="set-card">
        <h3>업무시간</h3>
        <p className="set-hint">예약 보드에 표시되는 시간 범위예요.</p>
        <div className="hours-row">
          <Select value={openMin} onChange={v => saveHours({ openMin: Number(v) })} options={openOpts} />
          <span className="hours-tilde">~</span>
          <Select value={closeMin} onChange={v => saveHours({ closeMin: Number(v) })} options={closeOpts} />
        </div>
      </section>

      {err && <p className="m-err">{err}</p>}
    </div>
  );
}
