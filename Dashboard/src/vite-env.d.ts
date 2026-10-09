/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FLEET_API_MODE?: "mock" | "backend";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
