import { useState } from 'react';
import { auth, api, authLink } from '../api';
import { Button } from './ui';

// 로그인 · 회원가입 · 비밀번호 찾기 — 계정 하나가 매장 하나
export function AuthPage() {
  const [mode, setMode] = useState('in'); // in = 로그인, up = 회원가입, forgot = 비밀번호 찾기
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false); // 메일 인증 전 로그인 → '인증 메일 다시 보내기'
  // 메일 링크로 열렸는데 실패한 경우(만료 등) 안내
  const [ok, setOk] = useState(authLink.error
    ? { bad: true, text: /expired|invalid/i.test(authLink.error + authLink.errorCode)
      ? '메일 링크가 만료됐거나 이미 쓴 링크예요. 로그인해 보고, 안 되면 인증 메일을 다시 받으세요.'
      : `메일 링크로 들어오지 못했어요 (${authLink.error})` }
    : null);
  const [busy, setBusy] = useState(false);

  const switchTo = m => { setMode(m); setErr(''); setPw(''); setPw2(''); setUnconfirmed(false); };
  const mail = email.trim();
  const run = async fn => {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e2) { setErr(e2.message); if (e2.code === 'email_not_confirmed') setUnconfirmed(true); }
    setBusy(false);
  };
  const submit = e => {
    e.preventDefault();
    if (mode === 'up' && pw.length < 6) return setErr('비밀번호는 6자 이상이어야 해요');
    if (mode === 'up' && pw !== pw2) return setErr('비밀번호 확인이 달라요');
    run(async () => {
      setOk(null); setUnconfirmed(false);
      if (mode === 'in') await auth.signIn(mail, pw);
      else if (mode === 'forgot') {
        await auth.sendReset(mail);
        switchTo('in');
        setOk({ text: `${mail}로 비밀번호를 새로 정하는 메일을 보냈어요. 메일의 링크를 눌러 주세요. (가입된 이메일일 때만 와요)` });
      } else {
        const d = await auth.signUp(mail, pw);
        if (!d.session) { switchTo('in'); setOk({ text: `${mail}로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인하세요.` }); }
      }
      // 로그인되면 Root 가 세션 변화를 받아 다음 화면으로 넘긴다
    });
  };
  const resend = () => run(async () => {
    await auth.resendSignup(mail);
    setUnconfirmed(false);
    setOk({ text: `${mail}로 인증 메일을 다시 보냈어요. 스팸함도 확인해 주세요.` });
  });

  return (
    <AuthShell>
      {mode === 'forgot'
        ? <h2 className="auth-h">비밀번호 찾기</h2>
        : (
          <div className="seg auth-seg" role="tablist" aria-label="로그인 또는 회원가입">
            <button type="button" role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => switchTo('in')}>로그인</button>
            <button type="button" role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => switchTo('up')}>회원가입</button>
          </div>
        )}
      {ok && <p className={ok.bad ? 'auth-bad' : 'auth-ok'} role="status">{ok.text}</p>}
      {mode === 'forgot' && <p className="auth-lead">가입한 이메일을 넣으면 비밀번호를 새로 정하는 링크를 보내 드려요.</p>}
      <form onSubmit={submit} className="auth-form">
        <label className="field"><span className="field-label">이메일</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required autoFocus />
        </label>
        {mode !== 'forgot' && (
          <label className="field"><span className="field-label">비밀번호{mode === 'up' && ' (6자 이상)'}</span>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required />
          </label>
        )}
        {mode === 'up' && (
          <label className="field"><span className="field-label">비밀번호 확인</span>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {err && <p className="m-err" role="alert">{err}</p>}
        {unconfirmed && mail && (
          <button type="button" className="btn btn-secondary" onClick={resend} disabled={busy}>인증 메일 다시 보내기</button>
        )}
        <Button variant="primary" type="submit" disabled={busy}>
          {mode === 'in' ? '로그인' : mode === 'up' ? '가입하기' : '재설정 메일 보내기'}
        </Button>
      </form>
      <p className="auth-foot">
        {mode === 'in' && <><button type="button" onClick={() => switchTo('forgot')}>비밀번호를 잊었어요</button><span aria-hidden="true"> · </span></>}
        {mode === 'forgot'
          ? <button type="button" onClick={() => switchTo('in')}>로그인으로 돌아가기</button>
          : <>{mode === 'in' ? '처음이세요? ' : '이미 계정이 있나요? '}
            <button type="button" onClick={() => switchTo(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? '회원가입' : '로그인'}</button></>}
      </p>
    </AuthShell>
  );
}

// 비밀번호 재설정 메일 링크로 들어왔을 때: 새 비밀번호 정하기
export function NewPassword({ email, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (pw.length < 6) return setErr('비밀번호는 6자 이상이어야 해요');
    if (pw !== pw2) return setErr('비밀번호 확인이 달라요');
    setBusy(true); setErr('');
    try { await auth.setPassword(pw); onDone(); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };
  return (
    <AuthShell>
      <h2 className="auth-h">새 비밀번호 정하기</h2>
      <p className="auth-lead">{email} 계정의 비밀번호를 새로 정해요.</p>
      <form onSubmit={submit} className="auth-form">
        <label className="field"><span className="field-label">새 비밀번호 (6자 이상)</span>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required autoFocus />
        </label>
        <label className="field"><span className="field-label">새 비밀번호 확인</span>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" required />
        </label>
        {err && <p className="m-err" role="alert">{err}</p>}
        <Button variant="primary" type="submit" disabled={busy}>비밀번호 저장</Button>
      </form>
      <p className="auth-foot"><button type="button" onClick={onDone}>지금 비밀번호 그대로 쓸게요</button></p>
    </AuthShell>
  );
}

// 가입 직후 한 번: 매장 이름 + 사장님 PIN
export function ShopSetup({ email, onDone }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const digits = v => v.replace(/\D/g, '').slice(0, 4);

  const submit = async e => {
    e.preventDefault();
    setErr('');
    if (!name.trim()) return setErr('매장 이름을 적어 주세요');
    if (pin.length !== 4) return setErr('PIN은 숫자 4자리예요');
    if (pin !== pin2) return setErr('PIN 확인이 달라요');
    setBusy(true);
    try { await api.createShop(name.trim(), pin); onDone(); }
    catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <AuthShell>
      <h2 className="auth-h">매장 만들기</h2>
      <p className="auth-lead">{email} 계정의 매장이에요. 직원·예약·정산은 매장마다 따로 저장돼요.</p>
      <form onSubmit={submit} className="auth-form">
        <label className="field"><span className="field-label">매장 이름</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={30} placeholder="예: 행복마사지 강남점" autoFocus />
        </label>
        <label className="field"><span className="field-label">사장님 PIN (숫자 4자리)</span>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={e => setPin(digits(e.target.value))} autoComplete="off" />
        </label>
        <label className="field"><span className="field-label">PIN 확인</span>
          <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin2} onChange={e => setPin2(digits(e.target.value))} autoComplete="off" />
        </label>
        <p className="auth-note">결제(정산)와 설정 화면은 이 PIN을 넣어야 열려요. 예약·지금 화면은 PIN 없이 쓸 수 있어요.</p>
        {err && <p className="m-err">{err}</p>}
        <Button variant="primary" type="submit" disabled={busy}>매장 만들기</Button>
      </form>
      <p className="auth-foot"><button type="button" onClick={() => auth.signOut()}>다른 계정으로 로그인</button></p>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">타임보드</div>
        {children}
      </div>
    </div>
  );
}
