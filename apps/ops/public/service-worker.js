self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "New customer message" };
  }
  event.waitUntil(self.registration.showNotification(data.title || "Barrel Ops", {
    body: data.body || "New customer message",
    icon: "/web-app-manifest-192x192.png",
    badge: "/web-app-manifest-192x192.png",
    tag: data.tag || "barrel-inbound",
    renotify: true,
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || "/inbox" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const appWindow = windows[0];
    if (appWindow) {
      if ("navigate" in appWindow) await appWindow.navigate(target);
      return appWindow.focus();
    }
    return clients.openWindow(target);
  }));
});
