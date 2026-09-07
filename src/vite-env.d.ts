/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


/** Moduł wirtualny ze znacznikiem wersji wdrożenia — patrz `wtyczkaWersji` w vite.config.ts. */
declare module "virtual:wersja-buildu" {
  export const WERSJA_BUILDU: string;
}
