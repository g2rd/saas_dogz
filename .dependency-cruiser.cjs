/** Granice modułów: moduł importuje inne moduły wyłącznie przez ich index.ts. */
module.exports = {
  forbidden: [
    {
      name: "module-public-api-only",
      comment: "Importuj inny moduł wyłącznie przez src/modules/<moduł>/index.ts",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/([^/]+)/(?!index\\.ts$)",
        pathNot: "^src/modules/$1/",
      },
    },
    {
      name: "domain-is-pure",
      comment: "domain nie zależy od frameworka, bazy ani infrastruktury",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain/" },
      to: {
        path: ["^node_modules/(next|react|@supabase)", "^src/modules/[^/]+/(infrastructure|application|ui)/", "^src/shared/supabase/"],
      },
    },
    {
      name: "shared-has-no-module-deps",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "no-service-client-in-app-ui",
      comment: "Klient service_role tylko w zadaniach, webhookach i panelu admina",
      severity: "error",
      from: { path: "^src/app/\\((trainer|client|auth|marketing)\\)/" },
      to: { path: "^src/shared/supabase/admin\\.ts$" },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "\\.test\\.ts$" },
  },
};
