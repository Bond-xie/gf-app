const CACHE = 'gf-app-v1';
const APP_SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 跨域请求（Supabase 等）直接走网络，不缓存
  if (url.origin !== self.location.origin) return;
  // 页面导航：网络优先，失败回退到缓存的 index.html（离线可用）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 同源静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; });
    })
  );
});

// 页面发来的“本地通知”请求（无需后端，app 打开时有效）
self.addEventListener('message', event => {
  const d = event.data;
  if (d && d.type === 'notify') {
    event.waitUntil(self.registration.showNotification(d.title || '💗', { body: d.body || '', tag: d.tag, icon: './icon-512.png' }));
  }
});

// 真正的 Web Push（后端 Edge Function 调用 web-push 推来）
self.addEventListener('push', event => {
  let data = { title: '💗 小软件', body: '' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) { try { data.body = event.data.text(); } catch (_) {} }
  event.waitUntil(self.registration.showNotification(data.title || '💗 小软件', {
    body: data.body || '',
    tag: data.tag,
    icon: './icon-512.png',
    data: data.url ? { url: data.url } : undefined
  }));
});

// 点击通知：打开/聚焦 app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.focus(); try { if (url && 'navigate' in c) c.navigate(url); } catch (_) {} return; } }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
