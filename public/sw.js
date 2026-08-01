const CACHE_NAME = "jarvis-shell-v2";
const SHELL_ASSETS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

// API calls: untouched, always hit the network.
// The page itself (navigations): network-first, so a new deploy is visible
// on the very next load instead of possibly serving a stale cached shell
// with old env vars/behavior baked in. Falls back to cache only if offline.
// Everything else (hashed, content-addressed JS/CSS chunks): cache-first —
// safe and fast, since their URL changes whenever their content does.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});

// Reminders arrive here (sent from the cron job via lib/webpush.ts).
self.addEventListener("push", (event) => {
  let data = { title: "Jarvis", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Non-JSON payload — fall back to the default title/empty body.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Jarvis", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
