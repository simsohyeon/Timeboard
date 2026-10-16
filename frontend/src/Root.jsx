import { useEffect, useState } from 'react';
import { api, auth, configured } from './api';
import App from './App';
import { AuthPage, ShopSetup } from './components/AuthPage';
import './App.css';

// 로그인 → 매장 확인 → 보드. 매장이 바뀌면(다른 계정) App 을 새로 띄워 이전 매장 값이 남지 않게
export default function Root() {
  const [session, setSession] = useState(undefined); // undefined = 확인 중
  const [shop, setShop] = useState(undefined);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!configured) return;
    auth.session().then(setSession);
    const sub = auth.onChange(setSession);
    return () => sub?.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  const loadShop = () => {
    setErr('');
    return api.myShop().then(setShop).catch(e => { setShop(null); setErr(e.message); });
  };
  useEffect(() => {
    if (!uid) { setShop(undefined); return; }
    loadShop();
  }, [uid]);

  // Supabase 미연결(로컬 개발): 로그인 없이 안내 배너와 함께 보드
  if (!configured) return <App shop={null} />;
  if (session === undefined || (session && shop === undefined)) return <div className="auth-page" aria-busy="true" />;
  if (!session) return <AuthPage />;
  if (err) return (
    <div className="auth-page"><div className="auth-card">
      <p className="m-err">{err}</p>
      <button type="button" className="btn btn-secondary" onClick={() => auth.signOut()}>로그아웃</button>
    </div></div>
  );
  if (!shop) return <ShopSetup email={session.user.email} onDone={loadShop} />;
  return <App key={shop.id} shop={shop} email={session.user.email} onShopChanged={loadShop} />;
}
