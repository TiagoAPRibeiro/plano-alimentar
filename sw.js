// Guarda a app em cache para funcionar sem internet.
// Ao publicar alterações, subir a versão para os portáteis receberem a nova.
const VERSION = 'v4';
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

// Responde da cache e atualiza em segundo plano (a versão nova aparece na abertura seguinte).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
