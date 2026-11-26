/* APEX GP 서비스 워커 — 18.0 다운로드 최소화 (리타: '처음 한 번만 받고, 업데이트 땐 바뀐 파일만')
   - 코드(index.html · manifest · 아이콘 · config.json · 그 밖에 목록에 없는 파일): 네트워크 우선 → 실패하면 저장본 (오프라인).
     캐시 'apexgp-app-<빌드>' 는 배포마다 새로 만들고 옛것은 지워요.
   - 에셋(음악 · 차 모델 · 차 그림 · 튜토리얼 · 상점 그림 …): 캐시 먼저 → 없으면 받아서 저장.
     캐시 'apexgp-assets' 는 버전이 없어서 업데이트 때 지우지 않아요.
     build.py 가 파일마다 내용 해시를 __ASSETS__ 에 넣어요 → 새 서비스 워커가 켜질 때(activate) 지난번 목록과 비교해서
     해시가 바뀐 파일 · 목록에서 빠진 파일만 지워요. 바뀐 파일은 처음 쓸 때 한 번 다시 받아요.
   - 부분 요청(range · 음악 스트리밍) · 다른 출처(PeerJS · Firebase · Stripe …)는 건드리지 않아요.
   17.18.17-20261125141605 · __ASSETS__ 는 build.py 가 빌드할 때마다 바꿔 넣어요 */
const BUILD = '17.18.17-20261125141605';
const APP_CACHE = 'apexgp-app-' + BUILD;
const ASSET_CACHE = 'apexgp-assets';
const META_CACHE = 'apexgp-meta';
const META_KEY = './__asset-hashes.json';
const ASSETS = {"audio/crowd.mp3":"df746b1fd185b15e","audio/finish.mp3":"090d22154ae7dfb7","audio/fireworks.mp3":"a821f2291229aef5","audio/hl_race.mp3":"0dce14e3648c0781","audio/hl_race_dune.mp3":"79d4145fb72db6d7","audio/hl_race_marina.mp3":"d33e2580c7084e97","audio/hl_race_sierra.mp3":"3745a41062234fcb","audio/level_up.mp3":"7484f0b76a891280","audio/menu.mp3":"d766a87aecf725f2","audio/race.mp3":"e04edd267fe86555","audio/race_dune.mp3":"f7428901486e8de2","audio/race_marina.mp3":"6476b4eae0b05650","audio/race_sierra.mp3":"8076a9b69b71030d","audio/reward_bonus.mp3":"d5dfb245ae9d9b55","cars/aero.png":"8d751f60da0da868","cars/apex.png":"a13aff622f5703c1","cars/glacier.png":"00047141f649d657","cars/solar.png":"43e0b54e70db04d8","cars/vortex.png":"f358c1b48556af3a","cars3d/aero.glb":"755ee551d6a4a180","cars3d/aero_lo.glb":"4e7f772625540945","cars3d/apex.glb":"f13951c621148db7","cars3d/apex_lo.glb":"03cabbf23e9c6014","cars3d/cars_glb.js":"35e73ab1401cd5df","cars3d/glacier.glb":"efbac87167d207b6","cars3d/glacier_lo.glb":"552d8dc03e83c2fe","cars3d/manifest.json":"f434f11b881e3422","cars3d/solar.glb":"7f5d8531c4019cb9","cars3d/solar_lo.glb":"14c84fd2c6fa3b35","cars3d/vortex.glb":"4d99cf36497c19f2","cars3d/vortex_lo.glb":"49a9370212b36eae","icons/apple-touch-icon.png":"b426d630161182b9","icons/favicon-32.png":"afc194fd01e711ec","icons/icon-192.png":"863f18daa07285ec","icons/icon-512.png":"4c1939258e1c2092","icons/icon-maskable-512.png":"a77c85a516f32c0a","shop/banner.webp":"bdc6c9b8a731b725","tutorial/labels.json":"0e315a682e9ccf03","tutorial/m_boost.jpg":"74143c95640c2324","tutorial/m_buttons_zoom.jpg":"69184db9b7e6e188","tutorial/m_drift.jpg":"641cdd17a9c5cd77","tutorial/m_race.jpg":"76250720af5f9299","tutorial/m_ring_zoom.jpg":"16965d59cafb016a","tutorial/m_slip.jpg":"35ebaca77ecab69f","tutorial/m_slip_zoom.jpg":"b43fc60ae9dc0c42","tutorial/m_steer_zoom.jpg":"1789aa87ad204521","tutorial/m_stick_zoom.jpg":"eaea53556dd6819c","tutorial/m_t2.jpg":"17c1026f966cb16d","tutorial/pc_boost.jpg":"4412a63f64473477","tutorial/pc_drift.jpg":"ce3d426bda965f66","tutorial/pc_drift_zoom.jpg":"3afc678009eb943a","tutorial/pc_gauge_zoom.jpg":"25f30a55032ebe01","tutorial/pc_race.jpg":"1753f973457f881c","tutorial/pc_slip.jpg":"287d36a9c83c94bf","tutorial/pc_slip_zoom.jpg":"e7aba1f54b8a2561","tutorial/pc_spurt_zoom.jpg":"234f9254e5c75a3e","tutorial/pc_window_zoom.jpg":"b75dd26d1b828a25"};   // { '경로(sw 위치 기준)': '해시' }
const PRECACHE = ['./index.html', './manifest.webmanifest'];   // 코드: 배포마다 ('./' 는 같은 문서라 빼요 — 오프라인이면 index.html 로)
const PREASSET = ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];   // 에셋: 저장본이 없을 때만
const NEVER_ASSET = /(^|\/)(index\.html|index_offline\.html|sw\.js|config\.json|manifest\.webmanifest|privacy\.html|terms\.html)$/;

const scopePath = () => new URL(self.registration.scope).pathname;
/** 요청 주소 → 목록 경로 (sw 위치 기준, 앞의 ./ 없이). 다른 곳이면 null */
function relPath(url) {
  const u = new URL(url), base = scopePath();
  if (u.origin !== self.location.origin || !u.pathname.startsWith(base)) return null;
  try { return decodeURIComponent(u.pathname.slice(base.length)); } catch (e) { return u.pathname.slice(base.length); }
}
const isAsset = (rel) => rel != null && rel !== '' && !NEVER_ASSET.test(rel) && Object.prototype.hasOwnProperty.call(ASSETS, rel);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await (await caches.open(APP_CACHE)).addAll(PRECACHE);
    const a = await caches.open(ASSET_CACHE), meta = await caches.open(META_CACHE);
    let prev = null; try { const r = await meta.match(META_KEY); prev = r ? await r.json() : null; } catch (err) { prev = null; }
    for (const rel of PREASSET) {   // 아이콘이 바뀌었으면(해시가 다르면) 새로, 같으면 그대로
      const url = new URL(rel, self.registration.scope).href, same = prev && prev[rel] === ASSETS[rel] && (await a.match(url));
      if (!same) { try { const res = await fetch(url, { cache: 'no-cache' }); if (res.ok) await a.put(url, res); } catch (err) { /* 오프라인이면 다음에 */ } }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 1) 옛 코드 캐시 · 예전 방식 캐시(apexgp-<빌드>) 지우기
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('apexgp-') && k !== APP_CACHE && k !== ASSET_CACHE && k !== META_CACHE).map((k) => caches.delete(k)));
    // 2) 에셋: 지난번 해시 목록과 비교 → 바뀐 것 · 빠진 것만 지우기
    const meta = await caches.open(META_CACHE), assets = await caches.open(ASSET_CACHE);
    let prev = null;
    try { const r = await meta.match(META_KEY); prev = r ? await r.json() : null; } catch (err) { prev = null; }
    const stored = await assets.keys();
    await Promise.all(stored.map((req) => {
      const rel = relPath(req.url);
      const gone = rel == null || !Object.prototype.hasOwnProperty.call(ASSETS, rel);
      const changed = !gone && !!prev && prev[rel] !== ASSETS[rel];   // 지난 목록이 없으면 = 이 캐시는 방금 이 버전이 채운 것이라 그대로
      return gone || changed ? assets.delete(req) : null;
    }));
    await meta.put(META_KEY, new Response(JSON.stringify(ASSETS), { headers: { 'Content-Type': 'application/json' } }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const rel = relPath(req.url);
  if (rel == null) return;   // 다른 출처
  if (req.headers.has('range')) return;   // 음악 스트리밍(부분 요청)은 브라우저에 맡겨요
  if (isAsset(rel)) {
    // 에셋: 캐시 먼저 (주소 뒤 ?… 는 무시하고 같은 파일로) → 없으면 받아서 저장
    e.respondWith(caches.open(ASSET_CACHE).then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req, { cache: 'no-cache' }).then((res) => {   // 브라우저 캐시의 옛 파일 대신 서버에 확인 (안 바뀌었으면 304 라 거의 안 받아요)
      if (res && res.status === 200 && res.type === 'basic') c.put(new Request(new URL(rel, self.registration.scope).href), res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  // 코드 · 목록에 없는 파일: 네트워크 우선 → 실패하면 저장본
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
