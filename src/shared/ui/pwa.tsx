"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/** Rejestruje service worker (offline, push, pamięć podręczna zasobów) na produkcji; lokalnie robi to dopiero włączenie push. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Brak service workera nie psuje aplikacji; zostaje zwykła strona.
    });
  }, []);
  return null;
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "dt_install_dismissed";
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function recentlyDismissed(): boolean {
  try {
    const stored = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(stored) && stored > 0 && Date.now() - stored < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * Zachęta do dodania aplikacji do ekranu głównego. Na iPhonie web push działa dopiero po instalacji (iOS 16.4+),
 * więc to ważne dla powiadomień. Android/Chrome: przycisk „Zainstaluj”; iOS: instrukcja (Udostępnij → Do ekranu początkowego).
 * Znika po instalacji, a po zamknięciu wraca dopiero po kilkunastu dniach.
 */
/** Początkowy tryb odczytany z przeglądarki; na serwerze zawsze "none", żeby nie rozjechać hydratacji. */
function readInitialMode(): "ios" | "none" {
  if (isStandalone() || recentlyDismissed()) return "none";
  return isIos() ? "ios" : "none";
}
const subscribeNoop = () => () => {};

export function InstallPrompt() {
  const t = useTranslations();
  const initial = useSyncExternalStore(subscribeNoop, readInitialMode, () => "none" as const);
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      if (isStandalone() || recentlyDismissed()) return;
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: "hidden" | "prompt" | "ios" = closed ? "hidden" : event ? "prompt" : initial === "ios" ? "ios" : "hidden";

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Bez localStorage baner po prostu wróci przy następnym wejściu.
    }
    setClosed(true);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") setClosed(true);
    else dismiss();
  }

  if (mode === "hidden") return null;

  return (
    <aside
      aria-label={t("shared.pwa.instalacja_aplikacji")}
      className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex-1">
        <p className="font-medium">{t("shared.pwa.dodaj_dogtrainer_do_ekranu_glownego")}</p>
        {mode === "ios" ? (
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {t.rich("shared.pwa.ios_steps", { strong: (chunks) => <strong>{chunks}</strong> })}
          </p>
        ) : (
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {t("shared.pwa.aplikacja_otworzy_sie_jak_zwykla_na")}
          </p>
        )}
        {mode === "prompt" ? (
          <button
            type="button"
            onClick={install}
            className="mt-3 inline-flex h-11 items-center rounded-full bg-primary hover:bg-primary-hover px-5 font-medium text-primary-foreground"
          >
            {t("shared.pwa.zainstaluj")}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("shared.pwa.zamknij_podpowiedz_instalacji")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-500"
      >
        <span aria-hidden>✕</span>
      </button>
    </aside>
  );
}
