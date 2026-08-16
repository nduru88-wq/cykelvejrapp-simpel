const CACHE="cykelvejr-overlay-v5-score-colors";
const ASSETS=["./","./index.html","./style.css","./app.js","./manifest.json","./icons/icon-192.svg","./icons/icon-512.svg"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{const url=new URL(e.request.url);if(url.hostname.includes("open-meteo.com")){e.respondWith(fetch(e.request));return;}e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});