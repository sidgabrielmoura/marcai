self.addEventListener('notificationclick', event => {
  event.stopImmediatePropagation();
  event.notification.close();
  const data = event.notification.data || {};
  const remote = data.FCM_MSG || {};
  const payload = remote.data || data;

  const targetUrl = payload.url || data.url || payload.clickAction || remote.fcmOptions?.link || remote.notification?.click_action;
  let destination = '/notifications';

  if (typeof targetUrl === 'string' && targetUrl.trim().length > 0) {
    try {
      const link = new URL(targetUrl, self.location.origin);
      if (link.origin === self.location.origin) {
        destination = link.pathname + link.search + link.hash;
      }
    } catch {}
  } else if (typeof payload.taskId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.taskId)) {
    destination = '/tasks/' + payload.taskId;
  } else if (typeof payload.executionId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(payload.executionId)) {
    destination = '/executions/' + payload.executionId;
  }

  const target = new URL(destination, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          return client.navigate(target);
        }
      }
      return clients.openWindow(target);
    })
  );
});
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

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
messaging.onBackgroundMessage(payload => {
  // FCM owns presentation of notification payloads. No second local alert.
  if (payload.notification) return;
  const data = payload.data || {};
  const safeId = typeof data.notificationId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(data.notificationId) ? data.notificationId : undefined;
  const url = data.url || data.clickAction || payload.fcmOptions?.link || '/notifications';
  return self.registration.showNotification(data.title || 'Tarefaí', {
    body: data.body || data.message || 'Há uma atualização para você.',
    icon: '/brand-icon.svg',
    badge: '/brand-icon.svg',
    data: { ...data, url },
    tag: safeId,
    renotify: false,
  });
});
