/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRI_DATA_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
/// <reference types="vite-plugin-pwa/client" />

// Injected at build time by Vite's `define` (see vite.config.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
