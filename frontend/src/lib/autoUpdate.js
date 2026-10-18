// 새 배포 자동 반영 — 켜 둔 화면(태블릿·홈 화면 앱)이 옛 버전에 머무르지 않게.
// 배포하면 index.html 이 가리키는 /assets/index-<해시>.js 이름이 바뀐다 → 지금 화면의 것과 다르면 새로고침.
// 확인 시점: 화면으로 돌아올 때(앱 다시 열기·탭 전환) + 켜 둔 동안 5분마다.
// 입력 중(창이 열려 있거나, 칸에 입력 중이거나, 저장 안 한 설정이 있으면)에는 새로고침을 미루고 끝나면 한다.

const CHECK_MS = 5 * 60 * 1000;
const RETRY_MS = 30 * 1000;
const SCRIPT_RE = /\/assets\/index-[\w-]+\.js/;

let hold = false;
export const holdUpdate = on => { hold = on; };

const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
const busy = () => hold || typing() || !!document.querySelector('.modal-wrap');

const current = () => {
  const s = [...document.scripts].find(x => SCRIPT_RE.test(x.src));
  return s ? new URL(s.src).pathname : null;
};

const latest = async () => {
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.text()).match(SCRIPT_RE)?.[0] ?? null;
};

export function startAutoUpdate() {
  const mine = current();
  if (!mine) return;
  let pending = false;
  let checking = false;

  const reloadWhenFree = () => {
    if (document.visibilityState !== 'visible' || busy()) { setTimeout(reloadWhenFree, RETRY_MS); return; }
    location.reload();
  };

  const check = async () => {
    if (pending || checking || document.visibilityState !== 'visible') return;
    checking = true;
    try {
      navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
      const v = await latest();
      if (v && v !== mine) { pending = true; reloadWhenFree(); }
    } catch { /* 오프라인 등 — 다음 확인 때 다시 */ }
    checking = false;
  };

  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', e => { if (e.persisted) check(); }); // iOS 뒤로가기·앱 복귀 캐시
  window.addEventListener('online', check);
  setInterval(check, CHECK_MS);
}
