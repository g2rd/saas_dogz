import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { getLocaleContext } from "@/shared/i18n/server";

/**
 * Manifest PWA. `start_url` wskazuje `/start`, który kieruje zalogowanego do panelu trenera lub klienta,
 * a niezalogowanego do logowania, więc ikona na ekranie głównym zawsze otwiera właściwy ekran.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [t, { locale }] = await Promise.all([getTranslations(), getLocaleContext()]);
  return {
    id: "/",
    name: "DogTrainer",
    short_name: "DogTrainer",
    description: t("common.meta.manifest_description"),
    lang: locale,
    start_url: "/start",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t("common.meta.shortcut_today"), url: "/app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: t("common.meta.shortcut_notifications"), url: "/app/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
