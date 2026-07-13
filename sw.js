const VERSION = "761350ae4b7b";
const CACHE = "jpstudy-" + VERSION;
const PRECACHE = ["./index.html", "./manifest.webmanifest", "./videos/catalog.js", "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith("jpstudy-") && k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  // 브라우저가 MP4 구간을 직접 요청하게 둔다. 부분 응답(206)을 Cache API에 넣으면 탐색·재생이 깨진다.
  if (req.headers.has("range") || url.pathname.endsWith(".mp4")) return;
  // 앱 셸(탐색): 캐시 우선 → 즉시 렌더(오프라인·불안정 회선에서도 흰 화면 없음), 갱신은 백그라운드
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cached = (await caches.match(req)) || (await caches.match("./index.html"));
      const net = fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put("./index.html", res.clone()));
        return res;
      }).catch(() => cached);
      return cached || net;   // 캐시 있으면 즉시, 첫 실행 등 캐시 없으면 네트워크
    })());
    return;
  }
  // 그 외 자원: 캐시 우선 + 백그라운드 채움
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});
