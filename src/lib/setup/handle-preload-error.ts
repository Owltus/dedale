/// Détection et récupération automatique des erreurs d'imports dynamiques.
///
/// En mode dev Vite, après un `app.restart()` Tauri ou pendant un rebuild HMR,
/// un `import()` dynamique peut échouer transitoirement. Selon le contexte,
/// l'erreur arrive de trois façons distinctes :
///
/// 1. **`vite:preloadError`** (mode prod) — émis par le runtime `__vitePreload`
///    injecté par le bundler quand un chunk preloadé échoue.
/// 2. **`unhandledrejection`** — un `import()` direct hors `React.lazy` qui
///    rejette sans être catché.
/// 3. **`ErrorBoundary` React** — quand `React.lazy()` échoue, la promise est
///    catchée par Suspense et l'erreur remonte dans la boundary la plus proche
///    (cas le plus fréquent dans cette app).
///
/// On centralise ici la détection (via patterns de message) et la stratégie
/// de récupération (reload avec cooldown anti-boucle), et on couvre les trois
/// chemins. Référence : https://vite.dev/guide/build (Load Error Handling).
const RELOAD_TIMESTAMP_KEY = "vite-preload-reload-at";
const COOLDOWN_MS = 5_000;

const DYNAMIC_IMPORT_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
] as const;

export function isDynamicImportError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const msg = String((error as { message?: unknown }).message ?? "");
  return DYNAMIC_IMPORT_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/// Déclenche un reload de la page si on n'en a pas déjà fait un récemment.
/// Retourne `true` si le reload est lancé, `false` si on est en cooldown
/// (l'appelant peut alors laisser l'erreur s'afficher normalement).
export function reloadAfterDynamicImportError(): boolean {
  const lastReloadAt = Number(sessionStorage.getItem(RELOAD_TIMESTAMP_KEY) ?? 0);
  if (Date.now() - lastReloadAt < COOLDOWN_MS) {
    return false;
  }
  sessionStorage.setItem(RELOAD_TIMESTAMP_KEY, String(Date.now()));
  window.location.reload();
  return true;
}

export function setupVitePreloadErrorHandler() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadAfterDynamicImportError()) {
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!isDynamicImportError(event.reason)) return;
    if (reloadAfterDynamicImportError()) {
      event.preventDefault();
    }
  });
}
