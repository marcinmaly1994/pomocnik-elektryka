import { useEffect, useState, type KeyboardEvent } from "react";
import { AlertTriangle, LogIn, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SUPABASE_CONFIGURED, sesjaZOdpowiedzi, supaRecover, supaSignIn, supaSignUp } from "@/lib/supabase";
import type { Session } from "@/lib/supabase";

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
 *  pokazuje ostrzeżenie zamiast próbować się łączyć — tak jak w oryginale. */
export function AuthModal({ open, komunikat, onClose, onSignedIn }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** Komunikat pozytywny (rejestracja/reset) — osobno od błędu, żeby dwa różne
   *  style (czerwony/neutralny) nie zależały od treści tekstu. */
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (open && komunikat) setInfo(komunikat);
  }, [open, komunikat]);

  function switchMode(next: Mode) {
    setMode(next);
    setErr("");
    setInfo("");
  }

  async function submit() {
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      if (mode === "login") {
        const r = await supaSignIn(email, password);
        // `sesjaZOdpowiedzi`, a nie ręczne składanie obiektu: zabiera też token
        // odnawiający i czas wygaśnięcia. Bez nich sesja umierała po godzinie,
        // a zapisy w chmurze zaczynały po cichu wracać z 401.
        onSignedIn(sesjaZOdpowiedzi(r));
      } else if (mode === "register") {
        const r = await supaSignUp(email, password);
        if (r.access_token) {
          onSignedIn(sesjaZOdpowiedzi(r));
        } else {
          setInfo("Konto utworzone. Sprawdź e-mail, aby potwierdzić rejestrację, a następnie zaloguj się.");
          setMode("login");
        }
      } else {
        await supaRecover(email);
        // Ten sam komunikat niezależnie od tego, czy e-mail faktycznie istnieje
        // w bazie — inaczej pole stałoby się sposobem na sprawdzanie cudzych kont.
        setInfo("Jeśli to konto istnieje, wysłaliśmy na ten adres link do zresetowania hasła.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }

  function onEnter(e: KeyboardEvent) {
    const ready = mode === "recover" ? !!email : email && password.length >= 6;
    if (e.key === "Enter" && ready && !busy) submit();
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
      <DialogContent title={TITLES[mode]}>
        {!SUPABASE_CONFIGURED && (
          <div className="mb-3 flex gap-2 rounded-md p-2.5 text-xs" style={{ background: "#C6433A1A", color: "#A2352C" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Backend nie jest jeszcze skonfigurowany (uzupełnij <span className="pe-mono">VITE_SUPABASE_URL</span> i{" "}
            <span className="pe-mono">VITE_SUPABASE_ANON_KEY</span> w pliku <span className="pe-mono">.env</span>), więc
            logowanie się nie powiedzie.
          </div>
        )}
        <div className="space-y-3">
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">E-mail</div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onEnter}
              className="pe-input w-full text-sm"
            />
          </label>
          {mode !== "recover" && (
            <label className="block">
              <div className="mb-1 text-xs text-slate-500">Hasło</div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onEnter}
                className="pe-input w-full text-sm"
              />
            </label>
          )}
          {mode === "login" && (
            <button type="button" onClick={() => switchMode("recover")} className="block text-xs text-slate-500 hover:underline">
              Zapomniałeś hasła?
            </button>
          )}
          {err && <div className="text-xs text-red-600">{err}</div>}
          {info && <div className="text-xs" style={{ color: "#2C6B4A" }}>{info}</div>}
          <Button
            type="button"
            variant="copper"
            className="w-full"
            onClick={submit}
            disabled={busy || !email || (mode !== "recover" && password.length < 6)}
          >
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
            <p className="text-[11px] leading-relaxed text-slate-500">
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
        </div>
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
