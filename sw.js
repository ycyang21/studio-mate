// Studio Mate 的 Service Worker
// 目前「完全不快取」任何檔案：每次都直接向網路要最新版本，避免手機一直卡在舊版。
// 它存在的目的，是讓手機可以把網頁「安裝」成 App，之後的推播通知也需要它。
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function() { /* 不攔截，交給瀏覽器照常向網路要資料 */ });
