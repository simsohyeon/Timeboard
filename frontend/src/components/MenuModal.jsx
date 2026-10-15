import { useState } from 'react';
import { api } from '../api';
import { DUR_OPTIONS } from '../lib/constants';
import { Modal, Button } from './ui';

export default function MenuModal({ menus, onClose, onChanged }) {
  const [err, setErr] = useState('');
  const run = fn => fn().then(() => { setErr(''); onChanged(); }).catch(e => setErr(e.message || String(e)));

  return (
    <Modal title="메뉴 관리" onClose={onClose}>
      {menus.map(m => (
        <div className="menu-row" key={m.id}>
          <input defaultValue={m.name} maxLength={10} aria-label="메뉴 이름"
            onBlur={e => {
              const v = e.target.value.trim();
              if (v && v !== m.name) run(() => api.updateMenu(m.id, { ...m, name: v }));
            }} />
          <div className="dur-chips">
            {DUR_OPTIONS.map(d => (
              <button key={d} type="button"
                className={'chip-dur' + (m.durations.includes(d) ? ' on' : '')}
                onClick={() => {
                  const ds = m.durations.includes(d)
                    ? m.durations.filter(x => x !== d)
                    : [...m.durations, d].sort((a, b) => a - b);
                  if (!ds.length) return setErr('시간은 최소 1개 필요해요');
                  run(() => api.updateMenu(m.id, { ...m, durations: ds }));
                }}>{d}</button>
            ))}
          </div>
          <Button variant="danger" className="small"
            onClick={() => run(() => api.deleteMenu(m.id))}>삭제</Button>
        </div>
      ))}
      <button type="button" className="menu-add"
        onClick={() => run(() => api.createMenu({
          name: `메뉴 ${menus.length + 1}`,
          durations: [60, 90, 120],
          sortOrder: Math.max(-1, ...menus.map(x => x.sortOrder ?? 0)) + 1,
        }))}>
        + 메뉴 추가
      </button>
      {err && <p className="m-err">{err}</p>}
      <div className="m-actions">
        <Button variant="primary" onClick={onClose}>완료</Button>
      </div>
    </Modal>
  );
}
