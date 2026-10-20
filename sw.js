// Guarda a app em cache para funcionar sem internet.
// A versão vem do registo (sw.js?v=…), definida em APP_VERSION em js/config.js.
const VERSION = new URL(location.href).searchParams.get('v') || 'dev';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/export.js', 'js/icons.js', 'js/model.js', 'js/pdf.js', 'js/photo.js', 'js/richtext.js',
  'vendor/pdfmake.min.js',
  'img/logo.png', 'img/prato-1.png', 'img/prato-2.png', 'img/favicon.svg', 'img/icon-192.png', 'img/icon-512.png',
  'fonts/Lato-Regular.ttf', 'fonts/Lato-Bold.ttf', 'fonts/Lato-Italic.ttf', 'fonts/Lato-BoldItalic.ttf',
  'fonts/Cormorant-Medium.ttf', 'fonts/Cormorant-SemiBold.ttf', 'fonts/Cormorant-MediumItalic.ttf',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Com internet vai sempre buscar a versão mais recente; sem internet usa a cópia guardada.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    try {
      const res = await fetch(e.request, { cache: 'no-cache' });
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  }));
});
