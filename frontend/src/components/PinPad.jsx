import { useEffect, useState } from 'react';
import { api } from '../api';
import { Button, Modal } from './ui';

// 사장님 PIN 입력 — 4자리를 다 누르면 바로 확인. 키보드 숫자·백스페이스도 된다
export default function PinPad({ title = '사장님 PIN', desc, email, onOk, onClose }) {
  const [forgot, setForgot] = useState(false);
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
    if (forgot) return; // 비밀번호 입력 중엔 숫자 키를 PIN 으로 받지 않음
    const key = e => {
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  if (forgot) return <ForgotPin email={email} onOk={onOk} onBack={() => setForgot(false)} onClose={onClose} />;
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
      {email && <button type="button" className="pin-forgot" onClick={() => setForgot(true)}>PIN을 잊었어요</button>}
    </Modal>
  );
}

// PIN 다시 정하기: 로그인 비밀번호 확인 → 새 PIN (틀려서 잠긴 것도 풀림)
function ForgotPin({ email, onOk, onBack, onClose }) {
  const [pw, setPw] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = v => v.replace(/\D/g, '').slice(0, 4);
  const submit = async e => {
    e.preventDefault();
    if (p1.length !== 4) return setErr('새 PIN은 숫자 4자리예요');
    if (p1 !== p2) return setErr('새 PIN 확인이 달라요');
    setBusy(true); setErr('');
    try { await api.resetPin(email, pw, p1); onOk(); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <Modal className="pin pin-reset" title="PIN 다시 정하기" onClose={onClose}>
      <p className="pin-desc">{email} 계정의 비밀번호를 넣으면 새 PIN을 정할 수 있어요.</p>
      <form onSubmit={submit} className="auth-form">
        <label className="field"><span className="field-label">로그인 비밀번호</span>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" required autoFocus />
        </label>
        <label className="field"><span className="field-label">새 PIN (숫자 4자리)</span>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={p1} onChange={e => setP1(digits(e.target.value))} autoComplete="off" />
        </label>
        <label className="field"><span className="field-label">새 PIN 확인</span>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={p2} onChange={e => setP2(digits(e.target.value))} autoComplete="off" />
        </label>
        {err && <p className="m-err">{err}</p>}
        <div className="m-actions">
          <Button onClick={onBack} disabled={busy}>뒤로</Button>
          <Button variant="primary" type="submit" disabled={busy}>새 PIN 저장</Button>
        </div>
      </form>
    </Modal>
  );
}
