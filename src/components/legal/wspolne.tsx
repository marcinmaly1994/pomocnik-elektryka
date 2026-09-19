import type { ReactNode } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

/**
 * Część wspólna dokumentów formalnych: polityki prywatności i regulaminu.
 *
 * Powód wydzielenia jest jeden i konkretny: TOŻSAMOŚĆ USŁUGODAWCY. Oba dokumenty
 * muszą wskazywać tę samą osobę i ten sam adres kontaktowy, a dwa osobne miejsca na
 * te same dane to dwa miejsca do zaktualizowania — czyli gwarancja, że kiedyś zostanie
 * zaktualizowane jedno. Przy okazji wspólne są też: oznaczenie szkicu i dwa drobne
 * komponenty układu, dzięki czemu obie strony wyglądają jak jeden dokument, a nie jak
 * dwa pisane osobno.
 */

/**
 * Dane, których NIE da się wziąć z kodu — musi je podać osoba prowadząca serwis.
 *
 * Dopóki którekolwiek pole zaczyna się od „[", obie strony oznaczają się jako SZKIC
 * (patrz `SZKIC` niżej): dokument z wymyślonym usługodawcą jest GORSZY niż jego brak,
 * bo wygląda na wiążący.
 */
export const USLUGODAWCA = {
  /** Imię i nazwisko albo nazwa działalności wraz z NIP-em. */
  nazwa: "[imię i nazwisko albo nazwa firmy prowadzącej serwis]",
  /** Adres, pod który realnie trafi „proszę o usunięcie moich danych" i reklamacja. */
  email: "[adres e-mail do kontaktu]",
  /** Region serwerów Supabase: Supabase → Settings → General → Region. Od tego zależy,
   *  czy dane konta w ogóle opuszczają Europejski Obszar Gospodarczy. */
  regionDanych: "[region serwerów bazy danych, np. Frankfurt (UE)]",
} as const;

/** Czy dokumenty mają jeszcze nieuzupełnione miejsca. */
export const SZKIC = Object.values(USLUGODAWCA).some((v) => v.startsWith("["));

/**
 * Data ostatniej zmiany treści — do zaktualizowania RĘCZNIE przy każdej poprawce
 * merytorycznej w którymkolwiek dokumencie. Świadomie nie `new Date()`: automat
 * pokazywałby dzisiejszą datę przy dokumencie nietkniętym od roku, czyli kłamałby
 * w jedynym polu, które czytelnik bierze za dowód aktualności.
 */
export const OSTATNIA_ZMIANA = "19 września 2026";

/** Nagłówek sekcji z ikoną — wspólny rytm obu dokumentów. */
export function Sekcja({
  ikona: Ikona,
  tytul,
  children,
}: {
  ikona: typeof ShieldCheck;
  tytul: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="pe-display mb-2 flex items-center gap-2 text-[15px] text-ink">
        <Ikona size={16} className="shrink-0 text-blueprint" />
        {tytul}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Nieuzupełnione miejsce w szkicu — wyróżnione, żeby nie dało się go przeoczyć ani
 *  wziąć za treść dokumentu. Po wpisaniu prawdziwej wartości znacznik znika sam. */
export function DoUzupelnienia({ children }: { children: string }) {
  if (!children.startsWith("[")) return <>{children}</>;
  return <mark className="rounded bg-[#FDF0E4] px-1 py-0.5 text-[12px] font-semibold text-[#9A5B26]">{children}</mark>;
}

/** Ostrzeżenie na górze niedokończonego dokumentu. Treść mówi wprost, czego brakuje
 *  i co z tego wynika — „wersja robocza" bez konsekwencji nikomu nic nie mówi. */
export function BanerSzkicu({ czego }: { czego: string }) {
  if (!SZKIC) return null;
  return (
    <div
      className="mb-6 flex gap-2.5 rounded-lg border p-3 text-[13px] leading-relaxed"
      style={{ borderColor: "#F0D9C8", background: "#FDF6F0" }}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
      <p className="text-slate-600">
        <strong className="text-ink">To jest szkic.</strong> Wyróżnione miejsca czekają na dane osoby prowadzącej
        serwis. Dopóki nie zostaną uzupełnione, dokument opisuje wprawdzie prawdziwe działanie aplikacji, ale{" "}
        {czego}
      </p>
    </div>
  );
}

/** Podtytuł z nazwą serwisu i datą — identyczny w obu dokumentach. */
export function MetryczkaDokumentu({ nazwa }: { nazwa: string }) {
  return (
    <p className="mb-6 text-[13px] text-slate-400">
      {nazwa} serwisu pomocnikelektryka.pl · ostatnia zmiana: {OSTATNIA_ZMIANA}
    </p>
  );
}
