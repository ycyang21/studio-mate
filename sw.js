// Studio Mate 背景程式（Service Worker）
// 1. 讓 iPhone／Android 可以把 Studio Mate「加入主畫面」當成 App 用。
// 2. 離線存取：在手機裡存一份 App 本身（網頁、月曆元件、雲端連線元件），沒網路也打得開。
//    有網路時一律先拿網路上最新的版本（拿到就順便更新手機裡那一份），所以不會卡在舊檔案；
//    只有網路連不上（或 6 秒都沒回應）時，才用手機裡存的那一份。外觀主題用的字體也會存一份。
// 3. 收到雲端提醒小幫手送來的通知時，跳出通知；點通知會打開 Studio Mate 對應的畫面。
var CACHE = 'studio-mate-offline-v1';
// App 本身（同一個網站底下）
var SHELL = ['studio-mate.html', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
// 外部元件：網址裡已經寫死版本號，內容不會變，存一次就一直用
var CDN = [
  'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js',
  'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js'
];
// 字體（Google Fonts）：第一次有網路時存下來，之後沒網路也能用同樣的字體
var CDN_PREFIXES = ['https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/', 'https://www.gstatic.com/firebasejs/12.2.1/', 'https://fonts.googleapis.com/css2', 'https://fonts.gstatic.com/'];
var NETWORK_TIMEOUT_MS = 6000;

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(function(cache) {
    // 一個一個存，某一個暫時抓不到也不影響其他的（之後用到時會再存）
    var shell = SHELL.map(function(u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function(res) { if (res.ok) return cache.put(u, res); }).catch(function() {});
    });
    var cdn = CDN.map(function(u) {
      var isModule = u.indexOf('gstatic.com') !== -1;
      return fetch(u, { mode: isModule ? 'cors' : 'no-cors' }).then(function(res) { if (res.ok || res.type === 'opaque') return cache.put(u, res); }).catch(function() {});
    });
    return Promise.all(shell.concat(cdn));
  }));
});

self.addEventListener('activate', function(event) {
  event.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k.indexOf('studio-mate-offline-') === 0 && k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }).then(function() { return self.clients.claim(); }));
});

// 同一個網頁不管後面帶什麼參數（?v=…、?open=…）都存成同一份
function pageKey(url) { return url.origin + url.pathname; }

function networkFirst(request, url) {
  return new Promise(function(resolve) {
    var settled = false;
    function finish(res) { if (!settled && res) { settled = true; resolve(res); } }
    function fromCache() {
      return caches.match(pageKey(url), { ignoreSearch: true }).then(function(r) {
        if (r) return r;
        if (request.mode === 'navigate') return caches.match(new URL('studio-mate.html', self.registration.scope).href);
        return null;
      });
    }
    var timer = setTimeout(function() { fromCache().then(finish); }, NETWORK_TIMEOUT_MS); // 網路很慢：先用手機裡那份
    fetch(request).then(function(res) {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function(cache) { cache.put(pageKey(url), copy); });
      }
      finish(res);
    }).catch(function() {
      clearTimeout(timer);
      fromCache().then(function(r) { finish(r || Response.error()); });
    });
  });
}

function cacheFirst(request) {
  return caches.match(request, { ignoreVary: true }).then(function(hit) { // 網址裡有版本號，同一個網址內容一定一樣
    if (hit) return hit;
    return fetch(request).then(function(res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(CACHE).then(function(cache) { cache.put(request, copy); });
      }
      return res;
    });
  });
}

self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.searchParams.has('vcheck')) return; // 檢查有沒有新版本：一定要問網路，不用手機裡的
    if (url.pathname.slice(-6) === 'sw.js') return;
    event.respondWith(networkFirst(request, url));
    return;
  }
  for (var i = 0; i < CDN_PREFIXES.length; i++) {
    if (request.url.indexOf(CDN_PREFIXES[i]) === 0) { event.respondWith(cacheFirst(request)); return; }
  }
  // 其他（雲端資料庫、登入）：不攔截，照常連網路
});

// 通知內容在老師手機上就加密好了，到這裡由瀏覽器自動解開：{ t: 標題, b: 內容, u: 點了要打開的網址, g: 同一類通知的標籤 }
self.addEventListener('push', function(event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { t: 'Studio Mate', b: event.data ? event.data.text() : '' }; }
  var options = { body: d.b || '', data: { url: d.u || 'studio-mate.html' }, icon: 'icon-192.png', badge: 'icon-192.png' };
  if (d.g) options.tag = d.g;
  event.waitUntil(self.registration.showNotification(d.t || 'Studio Mate', options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = new URL((event.notification.data && event.notification.data.url) || 'studio-mate.html', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url.indexOf('studio-mate.html') !== -1 && 'focus' in c) {
        c.postMessage({ type: 'sm-open', url: url }); // App 已經開著：直接切到對應的畫面
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
