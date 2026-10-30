/* Session-bound presentation: FCM carries only IDs, never private notice text. */
const presenting = new Map();
const endedSessions = new Set();
// Reject legacy queued notification payloads before Firebase can auto-display
// them. Only session-bound data messages may reach the presentation handler.
self.addEventListener('push', event => {
  try {
    const payload = event.data?.json();
    if (!payload?.data?.sessionId || !payload?.data?.notificationId || payload.notification) {
      event.stopImmediatePropagation();
    }
  } catch { event.stopImmediatePropagation(); }
});
async function readNotice(data) {
  if (!data || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.notificationId || '') ||
      !/^[0-9a-f-]{36}$/.test(data.sessionId || '')) return null;
  const query = new URLSearchParams({ notificationId:data.notificationId, sessionId:data.sessionId });
  try {
    const response = await fetch('/api/push/notification?' + query, { credentials:'same-origin', cache:'no-store' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
function showPush(data) {
  const key = data?.notificationId;
  if (presenting.has(key)) return presenting.get(key);
  const pending = (async () => {
    const notice = await readNotice(data);
    if (!notice || endedSessions.has(notice.sessionId)) return;
    const existing = await self.registration.getNotifications({ tag:notice.notificationId });
    if (existing.length) return;
    if (endedSessions.has(notice.sessionId)) return;
    await self.registration.showNotification(notice.title, {
      body:notice.body, icon:'/web-app-manifest-192x192.png', badge:'/web-app-manifest-192x192.png',
      tag:notice.notificationId, renotify:false,
      data:{notificationId:notice.notificationId,sessionId:notice.sessionId},
    });
  })().finally(()=>presenting.delete(key));
  presenting.set(key,pending);
  return pending;
}
self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    const notice = await readNotice(event.notification.data);
    if (!notice) return;
    const target = new URL(notice.url, self.location.origin);
    if (target.origin !== self.location.origin) return;
    const windows = await clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin===self.location.origin && 'focus' in client) {
        await client.focus(); return client.navigate(target.href);
      }
    }
    return clients.openWindow(target.href);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type==='DISPLAY_PUSH') event.waitUntil(showPush(event.data.data));
  if (event.data?.type==='PUSH_SESSION_ENDED') {
    const sessionId = event.data.sessionId;
    endedSessions.add(sessionId);
    if (endedSessions.size>100) endedSessions.delete(endedSessions.values().next().value);
    // Leaving a layout or closing one tab is not necessarily a logout.
    // Block pending presentation immediately, then check the shared cookie.
    event.waitUntil((async () => {
      try {
        const response = await fetch('/api/push/session', {credentials:'same-origin',cache:'no-store'});
        const current = response.ok ? await response.json() : null;
        if (current?.sessionId===sessionId) endedSessions.delete(sessionId);
      } catch { /* Keep pending private content hidden while offline. */ }
    })());
  }
  if (event.data?.type==='PUSH_SESSION_STARTED') endedSessions.delete(event.data.sessionId);
});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAUILwMtEmoo-Cw6Cv3dA5BDa5ytu3hs9I",
  authDomain: "marcai-a880a.firebaseapp.com",
  projectId: "marcai-a880a",
  storageBucket: "marcai-a880a.firebasestorage.app",
  messagingSenderId: "476040130163",
  appId: "1:476040130163:web:5d3c45b61f47c582fe8406",
  measurementId: "G-QGS249Z717",
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => showPush(payload.data));
