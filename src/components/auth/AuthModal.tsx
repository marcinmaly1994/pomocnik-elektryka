import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { LogIn, Loader2, MailCheck, Send } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { wrocFokusDoOtwieracza } from "@/lib/wrocFokus";
import { Button } from "@/components/ui/button";
import { SUPABASE_CONFIGURED, sesjaZOdpowiedzi, supaRecover, supaResend, supaSignIn, supaSignUp } from "@/lib/supabase";
import type { Session, SupaError } from "@/lib/supabase";
import { PODPOWIEDZ_HASLA, bladEmaila, bladNowegoHasla } from "@/lib/walidacjaKonta";
import { PoleHasla } from "./PoleHasla";

interface AuthModalProps {
  open: boolean;
  /** Komunikat do pokazania od razu po otwarciu — np. „hasło zmienione, zaloguj się"
   *  albo wyjaśnienie, że link z maila wygasł. Okno otwiera wtedy ktoś inny niż
   *  użytkownik i musi mu powiedzieć, dlaczego. */
  komunikat?: string;
  onClose: () => void;
  onSignedIn: (session: Session) => void;
}

type Mode = "login" | "register" | "recover";

const TITLES: Record<Mode, string> = {
  login: "Zaloguj się",
  register: "Załóż konto",
  recover: "Zresetuj hasło",
};

/** Logowanie / rejestracja / reset hasła przez Supabase (REST, bez SDK). Bez
 *  skonfigurowanego backendu (`.env` z `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`)
 *  pokazuje ostrzeżenie zamiast próbować się łączyć — tak jak w oryginale.
 *
 *  Prawdziwy `<form>`: Enter wysyła sam, a menedżery haseł rozpoznają parę pól
 *  (razem z `autocomplete`) i proponują zapis lub wypełnienie. `noValidate`, bo
 *  dymki przeglądarki są w jej języku i znikają po chwili — błędy pokazujemy sami,
 *  pod formularzem, po polsku. Przycisk jest aktywny także przy pustych polach:
 *  wyszarzony bez słowa wyjaśnienia nie mówił, czego brakuje. */
export function AuthModal({ open, komunikat, onClose, onSignedIn }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [powtorz, setPowtorz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Komunikat pozytywny (rejestracja/reset) — osobno od błędu, żeby dwa różne
   *  style (czerwony/neutralny) nie zależały od treści tekstu. */
  const [info, setInfo] = useState("");
  /** Adres, na który da się ponownie wysłać link potwierdzający — ustawiany po
   *  rejestracji i po próbie logowania na niepotwierdzone konto. */
  const [doPotwierdzenia, setDoPotwierdzenia] = useState<string | null>(null);

  useEffect(() => {
    if (open && komunikat) setInfo(komunikat);
  }, [open, komunikat]);

  function switchMode(next: Mode) {
    setMode(next);
    setErr("");
    setInfo("");
    setPowtorz("");
    setDoPotwierdzenia(null);
  }

  function walidacja(): string | null {
    const zlyEmail = bladEmaila(email);
    if (zlyEmail) return zlyEmail;
    if (mode === "login" && !password) return "Podaj hasło.";
    if (mode === "register") return bladNowegoHasla(password, powtorz);
    return null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    setInfo("");
    const blad = walidacja();
    if (blad) {
      setErr(blad);
      return;
    }
    // Spacje na brzegach to najczęściej ślad wklejenia — serwer by je odrzucił.
    const adres = email.trim();
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await supaSignIn(adres, password);
        // `sesjaZOdpowiedzi`, a nie ręczne składanie obiektu: zabiera też token
        // odnawiający i czas wygaśnięcia. Bez nich sesja umierała po godzinie,
        // a zapisy w chmurze zaczynały po cichu wracać z 401.
        onSignedIn(sesjaZOdpowiedzi(r));
      } else if (mode === "register") {
        const r = await supaSignUp(adres, password);
        if (r.access_token) {
          onSignedIn(sesjaZOdpowiedzi(r));
        } else {
          // Supabase przy włączonym potwierdzaniu odpowiada TAK SAMO, gdy adres jest
          // już zajęty (żeby nie dało się sprawdzać cudzych kont) — stąd druga część
          // zdania, zamiast obiecywać maila, który wtedy nie wyjdzie.
          setMode("login");
          setPowtorz("");
          setInfo(
            "Wysłaliśmy link potwierdzający — kliknij go, a potem zaloguj się. Jeśli konto z tym adresem już istnieje, po prostu się zaloguj albo zresetuj hasło."
          );
          setDoPotwierdzenia(adres);
        }
      } else {
        await supaRecover(adres);
        // Ten sam komunikat niezależnie od tego, czy e-mail faktycznie istnieje
        // w bazie — inaczej pole stałoby się sposobem na sprawdzanie cudzych kont.
        setInfo("Jeśli to konto istnieje, wysłaliśmy na ten adres link do zresetowania hasła.");
      }
    } catch (e) {
      if ((e as SupaError).kod === "email_not_confirmed") setDoPotwierdzenia(adres);
      setErr(e instanceof Error ? e.message : "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }

  async function wyslijPonownie() {
    if (!doPotwierdzenia || busy) return;
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      await supaResend(doPotwierdzenia);
      setInfo(`Jeśli konto czeka na potwierdzenie, wysłaliśmy nowy link na ${doPotwierdzenia}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się wysłać linku.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          // Reset dopiero po zamknięciu — inaczej treść migałaby na "Zaloguj się"
          // w trakcie animacji zamykania, zanim modal faktycznie zniknie.
          setTimeout(() => switchMode("login"), 150);
        }
      }}
    >
      {/* Bez DialogTrigger (otwierane z nagłówka, z chipu w menu i z edytora) — patrz
          `wrocFokusDoOtwieracza`; wraca do „Zaloguj się”, a na telefonie do „Menu”. */}
      <DialogContent title={TITLES[mode]} onCloseAutoFocus={wrocFokusDoOtwieracza("konto")}>
        {!SUPABASE_CONFIGURED && (
          <Alert variant="danger" className="mb-3">
            Backend nie jest jeszcze skonfigurowany (uzupełnij <span className="pe-mono">VITE_SUPABASE_URL</span> i{" "}
            <span className="pe-mono">VITE_SUPABASE_ANON_KEY</span> w pliku <span className="pe-mono">.env</span>), więc
            logowanie się nie powiedzie.
          </Alert>
        )}
        <form className="space-y-3" onSubmit={submit} noValidate>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">E-mail</div>
            <input
              type="email"
              inputMode="email"
              autoComplete={mode === "register" ? "email" : "username"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pe-input w-full text-sm"
            />
          </label>
          {mode !== "recover" && (
            <PoleHasla
              etykieta="Hasło"
              value={password}
              onChange={setPassword}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              podpowiedz={mode === "register" ? PODPOWIEDZ_HASLA : undefined}
            />
          )}
          {mode === "register" && (
            <PoleHasla etykieta="Powtórz hasło" value={powtorz} onChange={setPowtorz} autoComplete="new-password" />
          )}
          {mode === "login" && (
            <button type="button" onClick={() => switchMode("recover")} className="block text-xs text-slate-500 hover:underline">
              Zapomniałeś hasła?
            </button>
          )}
          {err && (
            <div role="alert" className="text-xs text-red-600">
              {err}
            </div>
          )}
          {info && (
            <div role="status" className="text-xs" style={{ color: "#2C6B4A" }}>
              {info}
            </div>
          )}
          {doPotwierdzenia && (
            <button
              type="button"
              onClick={wyslijPonownie}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-ink"
            >
              <MailCheck size={13} /> Wyślij link potwierdzający ponownie
            </button>
          )}
          <Button type="submit" variant="copper" className="w-full" disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : mode === "recover" ? (
              <Send size={14} />
            ) : (
              <LogIn size={14} />
            )}
            {mode === "login" ? "Zaloguj się" : mode === "register" ? "Załóż konto" : "Wyślij link resetujący"}
          </Button>
          {/* Informacja, a NIE blokujący checkbox: zaznaczanie kwadracika niczego tu
              nie dodaje — zgody na przetwarzanie danych potrzebnych do prowadzenia
              konta się nie zbiera, bo podstawą jest umowa, a nie zgoda. Obowiązek
              informacyjny (art. 13 RODO) spełnia dostęp do dokumentu w momencie
              zakładania konta, więc wystarczy, żeby link tu BYŁ i działał.

              `target="_blank"` jest tu konieczny, a nie kosmetyczny: przejście na
              politykę w tej samej karcie zamyka to okno razem z wpisanym już adresem
              e-mail i hasłem — czyli karze za przeczytanie tego, co się podpisuje. */}
          {mode === "register" && (
            <p className="text-xs leading-relaxed text-slate-500">
              Zakładając konto akceptujesz{" "}
              <a
                href="/regulamin"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-300 underline-offset-2 hover:text-ink"
              >
                regulamin
              </a>{" "}
              i zgadzasz się na przetwarzanie swoich danych zgodnie z{" "}
              <a
                href="/prywatnosc"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-slate-300 underline-offset-2 hover:text-ink"
              >
                polityką prywatności
              </a>
              .
            </p>
          )}
        </form>
        {mode === "recover" ? (
          <button onClick={() => switchMode("login")} className="mt-3 text-xs text-slate-500 hover:underline">
            Wróć do logowania
          </button>
        ) : (
          <button onClick={() => switchMode(mode === "login" ? "register" : "login")} className="mt-3 text-xs text-slate-500 hover:underline">
            {mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
