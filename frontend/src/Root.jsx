import { useEffect, useState } from 'react';
import { api, auth, authLink, configured } from './api';
import App from './App';
import { setDayEnd } from './lib/schedule';
import { AuthPage, NewPassword, ShopSetup } from './components/AuthPage';
import './App.css';
import { BASE_FONT, loadDisplay } from './lib/display';

// 로그인 화면에서도 저장해 둔 다크 모드를 따른다 (App 이 뜨면 App 이 다시 적용)
{
  const d = loadDisplay();
  document.documentElement.dataset.theme = d.dark ? 'dark' : 'light';
  const scale = d.fontPx / BASE_FONT; // 로그인 화면도 설정한 글자 크기로 (App 이 뜨면 App 이 다시 적용)
  document.body.style.zoom = scale;
  document.documentElement.style.setProperty('--scale', scale);
}

// 로그인 → 매장 확인 → 보드. 매장이 바뀌면(다른 계정) App 을 새로 띄워 이전 매장 값이 남지 않게
export default function Root() {
  // undefined = 확인 중, null = 로그아웃, 'offline' = 로그인은 남아 있는데 아직 연결 못 함
  const [session, setSession] = useState(undefined);
  const [shop, setShop] = useState(undefined);
  const [err, setErr] = useState('');
  // 비밀번호 재설정 메일 링크로 들어옴 → 새 비밀번호부터
  const [recovery, setRecovery] = useState(authLink.recovery);

  useEffect(() => {
    if (!configured) return;
    // 로그아웃(SIGNED_OUT)이 아니면, 세션이 비어 보여도 기기에 로그인 정보가 남아 있는 한 로그인 화면을 띄우지 않는다
    const settle = s => setSession(s ?? (auth.hasStored() ? 'offline' : null));
    auth.session().then(settle).catch(() => settle(null));
    // 인터넷이 안 되면 Supabase 가 한참 다시 시도한다 — 그동안 빈 화면 대신, 로그인 정보가 있으면 '연결 중'
    const slow = setTimeout(() => setSession(cur => (cur === undefined && auth.hasStored() ? 'offline' : cur)), 3000);
    const sub = auth.onChange((s, event) => {
      if (event === 'SIGNED_OUT') setSession(null); else settle(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => { sub?.unsubscribe(); clearTimeout(slow); };
  }, []);

  // 연결을 기다리는 중: 5초마다 + 인터넷이 돌아오면 다시 시도 (되면 원래 화면으로)
  const retryConnect = () => auth.session().then(s => { if (s) setSession(s); else if (!auth.hasStored()) setSession(null); }).catch(() => {});
  useEffect(() => {
    if (session !== 'offline') return;
    const t = setInterval(retryConnect, 5000);
    window.addEventListener('online', retryConnect);
    return () => { clearInterval(t); window.removeEventListener('online', retryConnect); };
  }, [session]);

  const uid = session?.user?.id;
  const loadShop = () => {
    setErr('');
    return api.myShop().then(setShop).catch(e => {
      // 이미 보드를 쓰는 중이면(매장 이름 바꾼 뒤 다시 읽기 등) 잠깐 실패해도 화면을 유지
      setShop(cur => {
        if (cur) return cur;
        setErr(/failed to fetch|network|load failed/i.test(e.message) ? '인터넷 연결을 확인해 주세요' : e.message);
        return null;
      });
    });
  };
  // 계정이 바뀌면(로그아웃·다른 계정) 이전 매장 화면·값을 먼저 비운다
  useEffect(() => {
    setShop(undefined);
    setDayEnd(0);
    if (uid) loadShop();
  }, [uid]);

  // Supabase 미연결(로컬 개발): 로그인 없이 안내 배너와 함께 보드
  if (!configured) return <App shop={null} />;
  if (session === 'offline') return (
    <div className="auth-page"><div className="auth-card">
      <div className="auth-brand">타임보드</div>
      <p className="auth-lead">인터넷 연결을 기다리는 중이에요. 로그인은 그대로 남아 있어요 — 연결되면 자동으로 돌아가요.</p>
      <button type="button" className="btn btn-primary" onClick={retryConnect}>다시 시도</button>
    </div></div>
  );
  if (session === undefined || (session && shop === undefined)) return <div className="auth-page" aria-busy="true" />;
  if (!session) return <AuthPage />;
  if (recovery) return <NewPassword email={session.user.email} onDone={() => setRecovery(false)} />;
  if (err) return (
    <div className="auth-page"><div className="auth-card">
      <p className="m-err">{err}</p>
      <button type="button" className="btn btn-primary" onClick={() => { setShop(undefined); loadShop(); }}>다시 시도</button>
      <button type="button" className="btn btn-secondary" onClick={() => auth.signOut()}>로그아웃</button>
    </div></div>
  );
  if (!shop) return <ShopSetup email={session.user.email} onDone={loadShop} />;
  return <App key={shop.id} shop={shop} email={session.user.email} onShopChanged={loadShop} />;
}
