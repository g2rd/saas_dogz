import type { MetadataRoute } from "next";

/**
 * Manifest PWA. `start_url` wskazuje `/start`, który kieruje zalogowanego do panelu trenera lub klienta,
 * a niezalogowanego do logowania, więc ikona na ekranie głównym zawsze otwiera właściwy ekran.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DogTrainer",
    short_name: "DogTrainer",
    description: "Klienci, pakiety zajęć, terminy i płatności dla trenerów psów oraz ich klientów.",
    lang: "pl",
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
      { name: "Dziś", url: "/app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Powiadomienia", url: "/app/notifications", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
