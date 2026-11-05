/* GPHNR: offline support. Version v0.2.0.
   Caches the reader itself, never the reader's books. */
const CACHE = "gphnr-v0.2.0";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./gphnr-v0.2.0.css",
  "./gphnr-reader-v0.2.0.js",
  "./gphnr-app-v0.2.0.js",
  "./close-page-v0.2.0.jpg",
  "./icons/icon-192-v0.2.0.png",
  "./icons/icon-512-v0.2.0.png",
  "./icons/apple-touch-icon-v0.2.0.png",
  "./vendor/pdfjs-6.4.299/pdf.min.mjs",
  "./vendor/pdfjs-6.4.299/pdf.worker.min.mjs"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("gphnr-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
