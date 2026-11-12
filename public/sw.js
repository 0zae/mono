// 앱 파일을 캐시해서 인터넷 없이도 열리게 한다. 기록은 IndexedDB에 따로 있다.
const CACHE = "mono-v23";
const SHELL = ["./", "./index.html", "./app.js", "./local.js", "./glass.css", "./logo.svg", "./icon.svg", "./favicon.png", "./apple-touch-icon.png",
  "./icon-192.png", "./icon-512.png", "./manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// 같은 사이트 파일만: 인터넷이 되면 새 버전, 안 되면 캐시
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
