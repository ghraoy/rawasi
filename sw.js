// يخلي التطبيق يفتح حتى بدون إنترنت. غيّر رقم النسخة عند كل تحديث.
const CACHE = 'rawasi-v10';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/core.js',
  './js/store.js',
  './js/logic.js',
  './js/ui.js',
  './js/sync.js',
  './js/gdrive.js',
  './js/ai.js',
  './js/excel.js',
  './js/views-stock.js',
  './js/views-sales.js',
  './js/views-more.js',
  './js/views-web.js',
  './js/web.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // طلبات Google Script ما تنحفظ أبداً
  if (url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;
  // موقع المتجر (مجلد shop) مستقل عن التطبيق، فما نحفظه هنا
  if (url.origin === location.origin && url.pathname.includes('/shop/')) return;
  if (url.origin === location.origin) {
    // ملفات التطبيق: الشبكة أولاً حتى توصل التحديثات، والنسخة المحفوظة إذا ماكو إنترنت
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
    );
  } else if (url.hostname.includes('fonts.g') || url.hostname === 'cdn.sheetjs.com') {
    e.respondWith(
      caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })),
    );
  }
});
