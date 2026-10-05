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
 * 4) Dodaj funkcję kasującą konto (SQL Editor). Usunięcie użytkownika z
 *    `auth.users` wymaga uprawnień, których klucz „anon” nie ma i mieć nie
 *    może — dlatego robi to funkcja `security definer`, kasująca WYŁĄCZNIE
 *    konto wyliczone z `auth.uid()`, czyli właściciela przesłanego tokenu:
 *
 *    create or replace function public.usun_moje_konto()
 *    returns void
 *    language plpgsql
 *    security definer
 *    set search_path = public, auth
 *    as $$
 *    declare uid uuid := auth.uid();
 *    begin
 *      if uid is null then
 *        raise exception 'Brak zalogowanego użytkownika';
 *      end if;
 *      -- Najpierw projekty: `projects.user_id` nie ma ON DELETE CASCADE, więc
 *      -- kasowanie użytkownika odbiłoby się o klucz obcy.
 *      delete from public.projects where user_id = uid;
 *      delete from auth.users where id = uid;
 *    end $$;
 *    revoke all on function public.usun_moje_konto() from public, anon;
 *    grant execute on function public.usun_moje_konto() to authenticated;
 *
 *    Bez tego kroku reszta aplikacji działa normalnie — nie działa jedynie
 *    przycisk „Usuń konto" w panelu konta.
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
  /**
   * Token odnawiający. Bez niego sesja umiera po godzinie (tyle żyje `access_token`
   * w Supabase) i każdy zapis w chmurze zaczyna wracać z 401 — po cichu, bo
   * autozapis nie ma komu tego zgłosić. Sesje zapisane przed wprowadzeniem
   * odświeżania go NIE MAJĄ; takie traktujemy jak wygasłe i prosimy o ponowne
   * zalogowanie, zamiast udawać, że zapis działa.
   */
  refreshToken?: string;
  /** Moment wygaśnięcia `token` (ms epoch). Brak = sesja sprzed tej zmiany. */
  expiresAt?: number;
}

/** Błąd z API z zachowanym kodem HTTP — po 401 trzeba odświeżyć sesję i ponowić. */
export interface SupaError extends Error {
  status?: number;
}

/**
 * Zapas przed wygaśnięciem [ms]. Odświeżamy z wyprzedzeniem, bo token, który
 * wygasa w trakcie lotu żądania, i tak wróci z 401 — a wtedy użytkownik zobaczy
 * błąd zamiast zapisu.
 */
const MARGINES_ODSWIEZENIA = 60_000;

/** Czy sesja wymaga odświeżenia przed użyciem. Czysta funkcja — testowalna bez sieci. */
export function wymagaOdswiezenia(sesja: Pick<Session, "expiresAt">, teraz = Date.now()): boolean {
  // Brak `expiresAt` = sesja sprzed wprowadzenia odświeżania. Nie wiemy, ile jej
  // zostało, a najczęściej nie zostało nic — traktujemy jak wymagającą odnowienia.
  if (!sesja.expiresAt) return true;
  return sesja.expiresAt - teraz <= MARGINES_ODSWIEZENIA;
}

/** Składa sesję z odpowiedzi endpointu auth (logowanie, rejestracja, odświeżenie). */
export function sesjaZOdpowiedzi(res: {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user: SupaUser;
}): Session {
  return {
    token: res.access_token ?? "",
    user: res.user,
    refreshToken: res.refresh_token,
    // `expires_in` przychodzi w sekundach; brak wartości traktujemy jak godzinę,
    // czyli domyślną żywotność tokenu w Supabase.
    expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000,
  };
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

/**
 * Komunikaty Supabase po polsku.
 *
 * Serwer odpowiada po angielsku, a okna logowania i konta wypisywały `e.message` wprost —
 * więc najczęstszy błąd, zła para e-mail/hasło, wychodził na ekranie jako „Invalid login
 * credentials". Rozpoznajemy po KODZIE błędu, gdy serwer go podaje (jest stabilniejszy niż
 * treść), a po treści jako zapasowo. Nieznany komunikat przechodzi bez zmian: angielskie
 * zdanie z serwera wciąż mówi więcej niż ogólnikowe „coś poszło nie tak".
 */
export function polskiKomunikatBledu(status: number, surowy: string, kod?: string): string {
  const tekst = `${kod ?? ""} ${surowy}`.toLowerCase();
  const ma = (...fragmenty: string[]) => fragmenty.some((f) => tekst.includes(f));

  if (ma("invalid_credentials", "invalid login credentials")) return "Nieprawidłowy e-mail lub hasło.";
  if (ma("email_not_confirmed", "email not confirmed"))
    return "Adres e-mail nie został jeszcze potwierdzony. Kliknij link z wiadomości wysłanej po rejestracji.";
  if (ma("user_already_exists", "user already registered", "already been registered"))
    return "Konto z tym adresem e-mail już istnieje. Zaloguj się albo zresetuj hasło.";
  if (ma("same_password", "different from the old password")) return "Nowe hasło musi być inne niż obecne.";
  if (ma("weak_password", "at least 6 characters")) return "Hasło jest za krótkie lub zbyt słabe (minimum 6 znaków).";
  if (status === 429 || ma("rate_limit", "rate limit", "too many requests"))
    return "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.";
  if (status >= 500) return "Serwer chwilowo nie odpowiada. Spróbuj ponownie za chwilę.";
  return surowy || `Błąd ${status}`;
}

const BRAK_SIECI = "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.";

async function sbFetch<T>(path: string, { method = "GET", body, token }: SbFetchOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
        ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // `fetch` rzuca TypeError („Failed to fetch") przy braku sieci, blokadzie CSP albo
    // zerwanym połączeniu. Bez `status` — wywołujący odróżnia to od odpowiedzi serwera.
    throw new Error(BRAK_SIECI);
  }
  const text = await res.text();
  // Odpowiedź niebędąca JSON-em to zwykle strona błędu bramki (502/504 jako HTML).
  // `JSON.parse` na niej rzucał SyntaxError i gubił kod HTTP.
  let data: { error_description?: string; msg?: string; message?: string; error_code?: string; code?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const surowy = data?.error_description || data?.msg || data?.message || "";
    // Kod HTTP zachowany, żeby wywołujący odróżnił „sesja wygasła" (401) od
    // każdej innej awarii i mógł ponowić po odświeżeniu tokenu.
    const err = new Error(polskiKomunikatBledu(res.status, surowy, data?.error_code ?? data?.code)) as SupaError;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** Wymienia token odnawiający na świeżą sesję. */
export function supaRefresh(refreshToken: string) {
  return sbFetch<{ access_token: string; refresh_token: string; expires_in: number; user: SupaUser }>(
    "/auth/v1/token?grant_type=refresh_token",
    { method: "POST", body: { refresh_token: refreshToken } },
  );
}

export function supaSignUp(email: string, password: string) {
  return sbFetch<{ access_token?: string; refresh_token?: string; expires_in?: number; user: SupaUser }>("/auth/v1/signup", {
    method: "POST",
    body: { email, password },
  });
}

export function supaSignIn(email: string, password: string) {
  return sbFetch<{ access_token: string; refresh_token: string; expires_in: number; user: SupaUser }>(
    "/auth/v1/token?grant_type=password",
    { method: "POST", body: { email, password } },
  );
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

/**
 * Nadpisuje zapis w chmurze — opcjonalnie TYLKO wtedy, gdy nikt inny go w międzyczasie
 * nie ruszył.
 *
 * `oczekiwaneUpdatedAt` dokłada do filtra warunek na znaczniku czasu ostatniego znanego
 * nam stanu wiersza. Gdy w bazie stoi już inna wartość — bo zapisał drugi laptop, tablet
 * albo druga karta przeglądarki — warunek nie trafia w żaden wiersz i PATCH wraca
 * z PUSTĄ tablicą zamiast po cichu skasować cudzą pracę. To zwykły optimistic locking:
 * baza rozstrzyga wyścig, a nie ten, kto akurat kliknął później.
 *
 * Bez tego parametru zachowuje się jak dawniej (ślepe nadpisanie) — potrzebne, gdy
 * użytkownik świadomie wybierze „nadpisz mimo to".
 */
export function supaUpdateProject(
  token: string,
  id: string,
  row: { name: string; data?: Record<string, unknown>; updated_at: string },
  oczekiwaneUpdatedAt?: string | null
) {
  // Znacznik czasu ma dwukropki i plus, więc MUSI być zakodowany — bez tego PostgREST
  // dostaje uciętą wartość i filtr nie trafia w nic, czyli każdy zapis wyglądałby
  // na konflikt.
  const warunek = oczekiwaneUpdatedAt ? `&updated_at=eq.${encodeURIComponent(oczekiwaneUpdatedAt)}` : "";
  return sbFetch<CloudProjectRow[]>(`/rest/v1/projects?id=eq.${id}${warunek}`, { method: "PATCH", body: row, token });
}

export function supaGetProject(token: string, id: string) {
  return sbFetch<CloudProjectRow[]>(`/rest/v1/projects?id=eq.${id}&select=*`, { token });
}

export function supaDeleteProject(token: string, id: string) {
  return sbFetch<void>(`/rest/v1/projects?id=eq.${id}`, { method: "DELETE", token });
}

/**
 * Kasuje konto wołającego — nieodwracalnie, razem ze wszystkimi jego zapisami
 * w chmurze.
 *
 * Idzie przez funkcję SQL, a nie przez admin API, bo usunięcie użytkownika
 * wymaga klucza `service_role`, którego NIE WOLNO wysłać do przeglądarki.
 * Funkcja `usun_moje_konto` jest `security definer` (działa z uprawnieniami
 * właściciela), ale kasuje wyłącznie konto wyliczone z `auth.uid()`, czyli
 * z przesłanego tokenu — nie da się jej podsunąć cudzego id. Dlatego token
 * sesji tutaj jest OBOWIĄZKOWY: z samym kluczem `anon` `auth.uid()` jest
 * puste i funkcja nie skasowałaby nic, nie zgłaszając przy tym błędu.
 *
 * Wymaga jednorazowego wklejenia definicji funkcji w SQL Editor — patrz
 * instrukcja konfiguracji na górze tego pliku.
 */
export function supaDeleteAccount(token: string) {
  return sbFetch<void>("/rest/v1/rpc/usun_moje_konto", { method: "POST", body: {}, token });
}
