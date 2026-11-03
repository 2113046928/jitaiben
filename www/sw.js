/* 机台本 — 离线缓存。只在 http(s) 下注册；本地双击打开时浏览器不会启用。 */
const CACHE = "jitaben-v1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./core.js", "./devices.js", "./photo3d.js",
  "./viewer.js", "./glview.js", "./ui.js",
  "./seed.js", "./manifest.json", "./icon-180.png", "./icon-192.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
