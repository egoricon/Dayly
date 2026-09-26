// Hand-written service worker: the app works offline after the first visit.
// Pages go to the network first and fall back to the cached shell; built assets have
// hashed names, so they are served from the cache and stored on first use.
// Pages and the shell skip the browser's HTTP cache (GitHub Pages lets it keep a page for
// 10 minutes), so a new version reaches the phone on the next launch.

// All paths are relative to this file, so the app works at the site root and under a subpath.
const CACHE = 'dayly-v13';
const INDEX = new URL('./', self.location).href;
const SHELL = ['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

/** A request that revalidates with the server instead of taking the browser's HTTP cache. */
function fresh(request) {
  try {
    return new Request(request, { cache: 'no-cache' });
  } catch {
    // A browser that cannot copy a page request keeps the plain one.
    return request;
  }
}

/** The shell plus the built script, styles and the fonts they use, found in index.html and the CSS. */
async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map(fresh));
  const html = await (await cache.match(INDEX)).text();
  const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => new URL(m[1], INDEX).href);
  const fonts = [];
  for (const css of assets.filter((a) => a.endsWith('.css'))) {
    const text = await (await fetch(css)).text();
    fonts.push(...[...text.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => new URL(m[1], css).href));
  }
  await cache.addAll([...new Set([...assets, ...fonts])]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(fresh(request))
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(INDEX, copy));
          return response;
        })
        .catch(() => caches.match(INDEX)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
