// Service worker DogTrainer: powiadomienia push, strona offline i pamięć podręczna zasobów statycznych.
// Celowo NIE zapisujemy w pamięci stron aplikacji ani odpowiedzi API/akcji: dane trenera i klienta są prywatne
// i zawsze muszą pochodzić z serwera (RLS). Offline pokazujemy tylko ogólną stronę „Brak połączenia”.
const VERSION = "v1";
const STATIC_CACHE = `dt-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

// Lokalnie (localhost) niczego nie buforujemy, żeby nie mieszać z odświeżaniem kodu w `next dev`.
const CACHE_ENABLED = self.location.hostname !== "localhost";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (CACHE_ENABLED ? caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)) : Promise.resolve()).then(() =>
      self.skipWaiting(),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("dt-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!CACHE_ENABLED || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nawigacja: zawsze z sieci; bez sieci ogólna strona offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || new Response("Brak połączenia", { status: 503 })),
    );
    return;
  }

  // Zasoby statyczne z hashami w nazwie: cache-first z odświeżaniem w tle
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DogTrainer", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "DogTrainer";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/start" },
      tag: data.url || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/start", self.location.origin);
  // Tylko adresy z tej samej domeny
  const url = target.origin === self.location.origin ? target.href : self.location.origin + "/start";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
