// 타임보드 서비스워커 — 앱 화면(셸)만 캐시한다.
// Supabase 등 다른 출처 요청은 건드리지 않음: 예약 데이터는 항상 최신이어야 하므로.
const CACHE = 'timeboard-v1';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // 빌드 산출물(/assets/*)은 파일명에 해시가 있어 내용이 안 바뀜 → 캐시 우선
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // 화면(index.html)·아이콘 등은 네트워크 우선 → 배포하면 바로 새 버전, 오프라인이면 캐시
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(hit =>
        hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
