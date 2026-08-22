/**
 * Integracja z Supabase przez REST (fetch), bez SDK — działa identycznie w
 * podglądzie jak i po wdrożeniu na własnej domenie. Przeniesione z wersji JS
 * niemal 1:1; jedyna zmiana to źródło konfiguracji: zamiast wpisanych na
 * sztywno stałych w kodzie, adres i klucz projektu czytane są ze zmiennych
 * środowiskowych Vite (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), żeby
 * dało się je podać bez edycji źródeł i bez ryzyka wrzucenia klucza do gita.
 *
 * KONFIGURACJA (wymagana, aby włączyć konta i zapis w chmurze):
 * 1) Załóż darmowy projekt na supabase.com, włącz logowanie e-mail/hasło.
 * 2) Skopiuj `.env.example` do `.env` i wklej tam adres projektu oraz klucz
 *    „anon/public”.
 * 3) Utwórz tabelę i zasady dostępu (SQL Editor w Supabase):
 *
 *    create table public.projects (
 *      id uuid primary key default gen_random_uuid(),
 *      user_id uuid references auth.users not null,
 *      name text not null,
 *      data jsonb not null,
 *      updated_at timestamptz default now()
 *    );
 *    alter table public.projects enable row level security;
 *    create policy "użytkownik zarządza własnymi projektami"
 *      on public.projects for all
 *      using (auth.uid() = user_id)
 *      with check (auth.uid() = user_id);
 *
 * Bez konfiguracji aplikacja działa w pełni lokalnie — logowanie i zapis
 * w chmurze są po prostu niedostępne (`SUPABASE_CONFIGURED` = false).
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Wydzielone jako czysta funkcja, żeby dało się przetestować bez mockowania `import.meta.env`. */
export function isSupabaseConfigured(url: string, anonKey: string): boolean {
  return url.startsWith("https://") && !url.includes("YOUR-PROJECT") && anonKey.length > 0 && !anonKey.includes("YOUR-ANON");
}

export const SUPABASE_CONFIGURED = isSupabaseConfigured(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface SupaUser {
  id: string;
  email?: string;
  [key: string]: unknown;
}

export interface Session {
  token: string;
  user: SupaUser;
}

export interface CloudProjectListItem {
  id: string;
  name: string;
  updated_at: string;
  /** `null` dla zapisow sprzed rozdzielenia rodzajow — patrz `rodzajDokumentu`. */
  kind?: string | null;
}

export interface CloudProjectRow {
  id: string;
  name: string;
  data: Record<string, unknown>;
  updated_at: string;
}

interface SbFetchOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function sbFetch<T>(path: string, { method = "GET", body, token }: SbFetchOptions = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.message || `Błąd ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function supaSignUp(email: string, password: string) {
  return sbFetch<{ access_token?: string; user: SupaUser }>("/auth/v1/signup", { method: "POST", body: { email, password } });
}

export function supaSignIn(email: string, password: string) {
  return sbFetch<{ access_token: string; user: SupaUser }>("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
}

/** Wysyła e-mail z linkiem do zresetowania hasła. Supabase zawsze odpowiada 200
 *  niezależnie od tego, czy konto istnieje (żeby nie zdradzać, które e-maile są
 *  zarejestrowane) — komunikat po stronie UI musi więc być identyczny w obu przypadkach. */
export function supaRecover(email: string) {
  return sbFetch<Record<string, never>>("/auth/v1/recover", { method: "POST", body: { email } });
}

/** Zmiana hasła zalogowanego użytkownika — działa na zwykłym `anon` kluczu +
 *  tokenie sesji, bez klucza `service_role`, więc jest bezpieczna do wywołania
 *  wprost z przeglądarki (patrz panel „Profil"). */
export function supaUpdateUser(token: string, patch: { password?: string; email?: string }) {
  return sbFetch<SupaUser>("/auth/v1/user", { method: "PUT", body: patch, token });
}

/**
 * Lista WSZYSTKICH dokumentow konta — projektow i zestawow protokolow razem.
 * Rodzaj siedzi w `data->>kind`, wiec wyciagamy go aliasem i rozdzielamy po stronie
 * aplikacji (patrz `lib/dokumenty.ts`). Filtrowanie po stronie serwera wymagaloby
 * skladni `or=(...)` dla zapisow bez `kind`, a te trzeba i tak obsluzyc — prosciej
 * i pewniej zrobic to w jednym miejscu.
 */
export function supaListProjects(token: string, userId: string) {
  return sbFetch<CloudProjectListItem[]>(
    `/rest/v1/projects?user_id=eq.${userId}&select=id,name,updated_at,kind:data->>kind&order=updated_at.desc`,
    { token },
  );
}

export function supaInsertProject(token: string, row: { user_id: string; name: string; data: Record<string, unknown> }) {
  return sbFetch<CloudProjectRow[]>("/rest/v1/projects", { method: "POST", body: row, token });
}

export function supaUpdateProject(token: string, id: string, row: { name: string; data?: Record<string, unknown>; updated_at: string }) {
  return sbFetch<CloudProjectRow[]>(`/rest/v1/projects?id=eq.${id}`, { method: "PATCH", body: row, token });
}

export function supaGetProject(token: string, id: string) {
  return sbFetch<CloudProjectRow[]>(`/rest/v1/projects?id=eq.${id}&select=*`, { token });
}

export function supaDeleteProject(token: string, id: string) {
  return sbFetch<void>(`/rest/v1/projects?id=eq.${id}`, { method: "DELETE", token });
}
