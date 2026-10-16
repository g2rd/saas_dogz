import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type Listener = (event: Record<string, unknown>) => void;

/** Uruchamia public/sw.js w piaskownicy z atrapami `self`, `caches` i `fetch` (żadnej prawdziwej sieci). */
function loadWorker(hostname: string, fetchImpl: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const stores = new Map<string, Map<string, Response>>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const navigated: string[] = [];

  const openStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: async (urls: string[]) => {
        for (const url of urls) store.set(new URL(url, `https://${hostname}`).pathname, new Response(`cached:${url}`));
      },
      match: async (request: Request | string) => {
        const url = typeof request === "string" ? request : request.url;
        return store.get(new URL(url, `https://${hostname}`).pathname)?.clone();
      },
      put: async (request: Request, response: Response) => void store.set(new URL(request.url).pathname, response),
    };
  };

  const self = {
    location: { hostname, origin: `https://${hostname}` },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [] as unknown[],
      openWindow: async (url: string) => void opened.push(url),
    },
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    addEventListener: (type: string, listener: Listener) => void listeners.set(type, listener),
  };
  const caches = {
    open: async (name: string) => openStore(name),
    match: async (request: Request | string) => {
      for (const name of stores.keys()) {
        const hit = await openStore(name).match(request);
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };

  const context = vm.createContext({ self, caches, fetch: fetchImpl, URL, Response, Request, Promise, console });
  vm.runInContext(readFileSync(join(process.cwd(), "public", "sw.js"), "utf8"), context);

  async function fire(type: string, event: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | null = null;
    listeners.get(type)?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => void waits.push(p),
      respondWith: (p: Promise<Response>) => void (responded = Promise.resolve(p)),
    });
    await Promise.all(waits);
    return responded as Promise<Response> | null;
  }
  return { fire, stores, shown, opened, navigated };
}

const request = (url: string, init: { method?: string; mode?: string } = {}) => {
  const req = new Request(url, { method: init.method ?? "GET" });
  Object.defineProperty(req, "mode", { value: init.mode ?? "no-cors" });
  return req;
};

const online = async () => new Response("from-network");
const offline = async (): Promise<Response> => {
  throw new TypeError("network down");
};

describe("service worker: pamięć podręczna i tryb offline", () => {
  it("instalacja zapisuje stronę offline poza localhost, a na localhost niczego nie buforuje", async () => {
    const prod = loadWorker("app.example.pl", online);
    await prod.fire("install", {});
    expect([...(prod.stores.get("dt-static-v1")?.keys() ?? [])]).toContain("/offline.html");

    const local = loadWorker("localhost", online);
    await local.fire("install", {});
    expect(local.stores.size).toBe(0);
  });

  it("nawigacja bez sieci pokazuje stronę offline, z siecią odpowiedź serwera", async () => {
    const down = loadWorker("app.example.pl", offline);
    await down.fire("install", {});
    const page = await down.fire("fetch", { request: request("https://app.example.pl/app", { mode: "navigate" }) });
    expect(await page?.text()).toBe("cached:/offline.html");

    const up = loadWorker("app.example.pl", online);
    await up.fire("install", {});
    const live = await up.fire("fetch", { request: request("https://app.example.pl/app", { mode: "navigate" }) });
    expect(await live?.text()).toBe("from-network");
  });

  it("nie przechwytuje akcji, API, cudzych domen ani żądań innych niż GET", async () => {
    const worker = loadWorker("app.example.pl", online);
    await worker.fire("install", {});
    for (const req of [
      request("https://app.example.pl/app/clients", { method: "POST", mode: "same-origin" }),
      request("https://app.example.pl/api/cron/outbox"),
      request("https://cdn.example.com/_next/static/app.js"),
      request("https://app.example.pl/portal/payments.json"),
    ]) {
      expect(await worker.fire("fetch", { request: req })).toBeNull();
    }
  });

  it("zasoby statyczne: cache-first z zapisem po pierwszym pobraniu", async () => {
    let calls = 0;
    const worker = loadWorker("app.example.pl", async () => new Response(`asset-${++calls}`));
    await worker.fire("install", {});
    const first = await worker.fire("fetch", { request: request("https://app.example.pl/_next/static/chunks/a.js") });
    expect(await first?.text()).toBe("asset-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await worker.fire("fetch", { request: request("https://app.example.pl/_next/static/chunks/a.js") });
    expect(await second?.text()).toBe("asset-1");
  });
});

describe("service worker: powiadomienia push", () => {
  it("pokazuje powiadomienie z ikoną i adresem, a bez adresu kieruje na /start", async () => {
    const worker = loadWorker("app.example.pl", online);
    await worker.fire("push", { data: { json: () => ({ title: "Zostały Ci 2 zajęcia", body: "Pakiet", url: "/portal" }), text: () => "" } });
    await worker.fire("push", { data: { json: () => ({ title: "Bez adresu" }), text: () => "" } });
    expect(worker.shown[0]).toMatchObject({ title: "Zostały Ci 2 zajęcia", options: { data: { url: "/portal" }, icon: "/icons/icon-192.png" } });
    expect(worker.shown[1].options).toMatchObject({ data: { url: "/start" } });
  });

  it("kliknięcie otwiera tylko adresy z tej samej domeny", async () => {
    const worker = loadWorker("app.example.pl", online);
    const click = (url: string) => worker.fire("notificationclick", { notification: { close: () => {}, data: { url } } });
    await click("/app/requests");
    await click("https://evil.example.com/phish");
    expect(worker.opened).toEqual(["https://app.example.pl/app/requests", "https://app.example.pl/start"]);
  });
});
