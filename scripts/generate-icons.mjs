// Generuje ikony PWA (public/icons/*.png) z prostego rysunku łapy. Uruchom: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { ImageResponse } from "next/og.js";
import React from "react";

const h = React.createElement;
const BG = "#059669";
const FG = "#ffffff";

/** Łapa: cztery palce i poduszka; `scale` zmniejsza rysunek (maskable wymaga marginesu bezpiecznej strefy). */
function icon(size, { rounded, scale }) {
  const u = (size * scale) / 100; // jednostka rysunku (100 x 100)
  const ox = (size - 100 * u) / 2;
  const oy = (size - 100 * u) / 2;
  const blob = (x, y, w, hh, extra = {}) =>
    h("div", {
      style: { position: "absolute", left: ox + x * u, top: oy + y * u, width: w * u, height: hh * u, background: FG, borderRadius: "50%", ...extra },
    });
  return h(
    "div",
    { style: { width: size, height: size, display: "flex", position: "relative", background: BG, borderRadius: rounded ? size * 0.22 : 0 } },
    blob(12, 30, 20, 26, { transform: "rotate(-20deg)" }),
    blob(33, 10, 20, 28, { transform: "rotate(-6deg)" }),
    blob(55, 10, 20, 28, { transform: "rotate(6deg)" }),
    blob(76, 30, 20, 26, { transform: "rotate(20deg)" }),
    blob(26, 50, 48, 40, { borderRadius: "48% 48% 50% 50% / 40% 40% 60% 60%" }),
  );
}

const targets = [
  ["icon-192.png", 192, { rounded: true, scale: 0.78 }],
  ["icon-512.png", 512, { rounded: true, scale: 0.78 }],
  ["icon-maskable-512.png", 512, { rounded: false, scale: 0.55 }],
  ["apple-touch-icon.png", 180, { rounded: false, scale: 0.68 }],
];

mkdirSync("public/icons", { recursive: true });
for (const [name, size, opts] of targets) {
  const response = new ImageResponse(icon(size, opts), { width: size, height: size });
  writeFileSync(`public/icons/${name}`, Buffer.from(await response.arrayBuffer()));
  console.log("zapisano", name);
}
