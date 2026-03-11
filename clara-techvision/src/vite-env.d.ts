/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORG_ID?: string;
  readonly VITE_PUBLIC_ORG_NAME?: string;
  readonly VITE_PUBLIC_PLAN?: string;
  readonly VITE_PUBLIC_PLATFORM_ADMIN_URL?: string;
  readonly VITE_PUBLIC_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
