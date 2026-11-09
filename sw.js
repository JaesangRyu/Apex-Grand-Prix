/* APEX GP 서비스 워커 — 오프라인 실행 + 업데이트 자동 반영 (7.7: 음악 mp3 는 캐시 먼저)
   - 같은 출처 파일: 네트워크 우선(최신 버전 받기) → 실패하면 캐시 (오프라인)
   - 외부(PeerJS 등): 건드리지 않음 (대전은 어차피 온라인 전용)
   8.6.0-20261108210034 는 build.py 가 빌드할 때마다 바꿔 넣어요 → 새 배포 = 새 캐시 */
const CACHE = 'apexgp-8.6.0-20261108210034';
const PRECACHE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('apexgp-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has('range')) return;   // 음악 스트리밍(부분 요청)은 브라우저에 맡겨요
  if (/\/audio\/[^/]+\.mp3$/.test(new URL(req.url).pathname)) {   // 7.7: 음악은 캐시 먼저 (같은 배포 안에선 바뀌지 않아요 → 두 번째부터 바로 시작)
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { if (res && res.status === 200) c.put(req, res.clone()).catch(() => {}); return res; }))));
    return;
  }
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
