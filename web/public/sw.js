/*
 * Family website: phone notifications only.
 * This worker shows notifications and opens the right page when one is tapped. It has no fetch handler and
 * stores nothing: no pages, photos or family data are ever kept on the device by it.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Family', body: e.data ? e.data.text() : '' }; }
  const url = typeof d.url === 'string' && d.url.startsWith('#/') ? d.url : '#/';
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Family', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url },
    }),
    // a dot on the app icon until the site is opened (it then shows the real count), and tell open windows to refresh
    self.navigator && self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => ws.forEach((w) => w.postMessage({ type: 'pushed' }))),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('/' + ((e.notification.data && e.notification.data.url) || '#/'), self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); try { await w.navigate(target); } catch { w.postMessage({ type: 'open', url: target }); } return; }
    }
    await self.clients.openWindow(target);
  })());
});
