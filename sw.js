// Studio Mate 背景程式（Service Worker）
// 1. 讓 iPhone／Android 可以把 Studio Mate「加入主畫面」當成 App 用。
// 2. 收到雲端提醒小幫手送來的通知時，跳出通知；點通知會打開 Studio Mate 對應的畫面。
// 不快取任何檔案：每次都直接拿網路上最新的版本，避免改了程式之後手機還在用舊檔案。
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function() { /* 不攔截，照常從網路載入 */ });

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
