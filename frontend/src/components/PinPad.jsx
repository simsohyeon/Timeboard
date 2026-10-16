import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal } from './ui';

// 사장님 PIN 입력 — 4자리를 다 누르면 바로 확인. 키보드 숫자·백스페이스도 된다
export default function PinPad({ title = '사장님 PIN', desc, onOk, onClose }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async p => {
    setBusy(true);
    try {
      if (await api.verifyPin(p)) { onOk(); return; }
      setErr('PIN이 맞지 않아요');
    } catch (e) { setErr(e.message); }
    setPin('');
    setBusy(false);
  };
  const press = k => {
    if (busy) return;
    if (k === 'del') { setPin(pin.slice(0, -1)); return; }
    if (pin.length >= 4) return;
    const n = pin + k;
    setErr('');
    setPin(n);
    if (n.length === 4) check(n);
  };
  useEffect(() => {
    const key = e => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  return (
    <Modal className="pin" title={title} onClose={onClose}>
      {desc && <p className="pin-desc">{desc}</p>}
      <div className={'pin-dots' + (err ? ' bad' : '')} aria-label={`${pin.length}자리 입력됨`}>
        {[0, 1, 2, 3].map(i => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <p className="pin-err" role="alert">{err}</p>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
          <button key={k} type="button" onClick={() => press(k)} disabled={busy}>{k}</button>
        ))}
        <button type="button" className="pin-sub" onClick={onClose}>취소</button>
        <button type="button" onClick={() => press('0')} disabled={busy}>0</button>
        <button type="button" className="pin-sub" aria-label="지우기" onClick={() => press('del')} disabled={busy}>⌫</button>
      </div>
    </Modal>
  );
}
