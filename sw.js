/* ============================================================
   sw.js — 서비스워커 (PWA 오프라인 캐싱)
   -------------------------------------------------------------
   핵심 파일을 캐싱해서 인터넷이 불안정해도 앱이 열리게 하고,
   브라우저가 "홈 화면에 추가(설치)"를 제안하는 조건을 충족시킵니다.
   데이터 파일(universities-data.js, real-susi-placement-data.js)을
   갱신했다면 CACHE_NAME의 버전 숫자를 올려서 캐시를 새로 채우세요.
   ============================================================ */

const CACHE_NAME = 'saju-match-v1';
const ASSETS = [
  './index.html',
  './saju-app.html',
  './saju-styles.css',
  './college-match-styles.css',
  './saju-core.js',
  './saju-ui.js',
  './saju-university-map.js',
  './saju-grade-filter.js',
  './college-match-ui.js',
  './universities-data.js',
  './real-susi-placement-data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (event.request.method === 'GET' && networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
