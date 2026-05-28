/**
 * Firebase Cloud Messaging — Service Worker (Web Push background handler)
 *
 * This file MUST be named `firebase-messaging-sw.js` and placed at the
 * web root (`/public/`). Firebase's web SDK looks for it at exactly
 * `{origin}/firebase-messaging-sw.js` when registering the SW for push
 * delivery. It is loaded only in browsers that support service workers.
 *
 * Responsibilities:
 *   • Initialize Firebase inside the SW context (compat CDN — required,
 *     ES module imports don't work inside service workers in all browsers).
 *   • Handle `onBackgroundMessage`: when a push arrives while the tab is
 *     backgrounded / closed, show a native OS notification tray banner.
 *
 * The foreground delivery path (tab is active) is handled by the client-
 * side `onMessage()` listener, which can surface an in-app toast.
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60',
  authDomain:        'appout-1.firebaseapp.com',
  projectId:         'appout-1',
  storageBucket:     'appout-1.firebasestorage.app',
  messagingSenderId: '371293978848',
  appId:             '1:371293978848:web:c5281b7834ecd5398b1085',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  // When the tab is not focused the browser won't show anything by default.
  // We construct a notification manually so the OS tray banner appears.
  const title   = payload.notification?.title ?? 'Out — אימון כושר';
  const options = {
    body:    payload.notification?.body  ?? '',
    icon:    '/assets/logo/Kind=logotype.svg',
    badge:   '/assets/logo/Kind=logotype.svg',
    tag:     payload.data?.tag   ?? 'outrun-push',
    data:    payload.data,
    // vibrate triggers a haptic pattern on supported Android devices
    vibrate: [200, 100, 200],
  };

  return self.registration.showNotification(title, options);
});

// When the user taps the OS notification, bring the app to focus and
// navigate to the deeplink URL if one was included in the payload.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const deepLink = event.notification?.data?.deepLink;
  const targetUrl = deepLink ? new URL(deepLink, self.location.origin).href : self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Bring an existing tab to focus if one is already open
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
