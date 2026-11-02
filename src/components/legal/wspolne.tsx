import type { ReactNode } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { SZKIC, USLUGODAWCA } from "./daneUslugodawcy";

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

/**
 * Adres kontaktowy: dopóki go nie ma — podświetlone miejsce do uzupełnienia, a gdy
 * jest — odnośnik `mailto:`.
 *
 * To nie ozdoba. Oba dokumenty każą pisać pod ten adres w sprawach, które mają
 * TERMIN: usunięcie danych i reklamacja rozpatrywana w 14 dni. Adres, który trzeba
 * ręcznie przepisać, zniechęca dokładnie w tym momencie, w którym zależy nam, żeby
 * wiadomość jednak wyszła.
 */
export function AdresKontaktowy() {
  if (USLUGODAWCA.email.startsWith("[")) return <DoUzupelnienia>{USLUGODAWCA.email}</DoUzupelnienia>;
  return (
    <a
      href={`mailto:${USLUGODAWCA.email}`}
      className="text-blueprint underline decoration-blueprint/40 underline-offset-2 hover:decoration-blueprint"
    >
      {USLUGODAWCA.email}
    </a>
  );
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
