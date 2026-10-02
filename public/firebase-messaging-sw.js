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

// Intercepta mensagens em segundo plano quando a aba/PWA está fechada ou em background
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Mensagem recebida em segundo plano:", payload);

  const title = payload.notification?.title || payload.data?.title || "Marcaí";
  const body = payload.notification?.body || payload.data?.body || payload.data?.message || "Nova atualização disponível.";
  const icon = payload.notification?.icon || payload.data?.icon || "/brand-icon.svg";
  const clickAction = payload.fcmOptions?.link || payload.data?.clickAction || payload.data?.link || "/";

  const notificationOptions = {
    body,
    icon,
    badge: "/brand-icon.svg",
    vibrate: [200, 100, 200],
    data: {
      url: clickAction,
      ...payload.data,
    },
    tag: payload.data?.notificationId || "marcai-notification",
    renotify: true,
  };

  return self.registration.showNotification(title, notificationOptions);
});

// Ação de clique na notificação para direcionar o usuário à tarefa ou tela correta
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Se uma janela já está aberta, foca nela e navega
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(urlToOpen);
            }
            return client;
          }
        }
        // Se nenhuma janela está aberta, abre uma nova
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
