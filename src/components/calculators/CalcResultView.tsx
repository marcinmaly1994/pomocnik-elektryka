import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Info, TriangleAlert } from "lucide-react";
import type { CalcResult, Ocena } from "@/lib/calc/result";
import { formatLiczba } from "@/lib/calc/result";
import { KOLORY } from "@/lib/tokeny";

/**
 * Wspólna prezentacja koperty wyniku (`CalcResult`) — rachunek krok po kroku,
 * ocena warunku, założenia i źródła normatywne.
 *
 * Jeden komponent dla wszystkich kalkulatorów inżynierskich, bo wymaganie
 * „pokaż wzór z podstawionymi wartościami i podaj źródło" jest wspólne dla
 * każdego z nich — a rozpisane osobno w każdej karcie rozjechałoby się przy
 * pierwszej zmianie. Sam rachunek przychodzi gotowy z warstwy obliczeniowej;
 * tutaj nie ma ŻADNEJ matematyki, żeby prezentacja nie mogła zacząć pokazywać
 * czegoś innego, niż policzył silnik.
 */

/**
 * Tła są NIEPRZEZROCZYSTE, a nie w wersji z kanałem alfa (dawniej `#3B8C631A`).
 * Pasek werdyktu przykleja się do góry przy przewijaniu, więc przez półprzezroczyste
 * tło przejeżdżałby pod nim rachunek krok po kroku. Wartości to dokładnie te same
 * barwy zmieszane z bielą karty (10%), więc wygląd bez przewijania się nie zmienia.
 */
const WERDYKT_STYL = {
  spelniony: { bg: KOLORY.successTlo, fg: KOLORY.success, Icon: Check, etykieta: "Warunek spełniony" },
  graniczny: { bg: KOLORY.cautionTlo, fg: KOLORY.caution, Icon: TriangleAlert, etykieta: "Wynik graniczny" },
  niespelniony: { bg: KOLORY.dangerTlo, fg: KOLORY.danger, Icon: AlertTriangle, etykieta: "Warunek niespełniony" },
  nieoceniany: { bg: KOLORY.paper, fg: "#475569", Icon: Info, etykieta: "Bez oceny warunku" },
} as const;

/**
 * Pasek werdyktu PRZYKLEJONY do góry przy przewijaniu.
 *
 * Rachunek krok po kroku, założenia i źródła potrafią mieć kilka ekranów, więc
 * werdykt — jedyna rzecz, dla której użytkownik tu przyszedł — znikał z widoku
 * dokładnie wtedy, gdy czytał uzasadnienie albo poprawiał dane wejściowe.
 *
 * Osobny, eksportowany komponent, bo ten sam pasek stoi też nad kompletem czterech
 * kryteriów w „Doborze obwodu", który nie przechodzi przez `CalcResult`. Werdykt ma
 * wyglądać i brzmieć tak samo w całej zakładce, niezależnie od tego, skąd pochodzi.
 */
export function PasekWerdyktu({ ocena }: { ocena: Ocena }) {
  const styl = WERDYKT_STYL[ocena.verdict];
  return (
    <div
      className="sticky top-2 z-10 mt-2 flex items-start gap-2 rounded-lg p-3 text-sm shadow-sm"
      style={{ background: styl.bg, color: styl.fg }}
    >
      <styl.Icon size={16} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-semibold">
          {styl.etykieta}
          {ocena.margines_pct !== null && ` — margines ${formatLiczba(ocena.margines_pct, 1)}%`}
        </div>
        <div className="mt-0.5 leading-relaxed">{ocena.komunikat}</div>
      </div>
    </div>
  );
}

export function CalcResultView<T>({ wynik }: { wynik: CalcResult<T> }) {
  // Błędy walidacji wykluczają wynik — pokazujemy WYŁĄCZNIE je, żeby nie dało
  // się odczytać nieistniejącej liczby obok komunikatu o błędnych danych.
  if (wynik.bledy.length > 0) {
    return (
      <div className="mt-2 space-y-1.5">
        {wynik.bledy.map((b) => (
          <Alert key={b.code} variant="danger">
            {b.message}
          </Alert>
        ))}
      </div>
    );
  }

  const ocena = wynik.ocena;

  return (
    <>
      {ocena && <PasekWerdyktu ocena={ocena} />}

      {wynik.kroki.length > 0 && (
        <details className="mt-2 rounded-lg border border-border bg-white/60" open>
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-copper">
            Rachunek krok po kroku
          </summary>
          <div className="space-y-2 border-t border-border px-3 py-2">
            {wynik.kroki.map((k, i) => (
              <div key={i}>
                <div className="text-xs text-slate-500">{k.opis}</div>
                <div className="pe-mono text-xs text-slate-600">{k.wzor}</div>
                {/* Podstawienie łamie się na wąskim ekranie zamiast rozpychać kartę —
                    to najdłuższa linia w całym widoku. Najpierw na spacjach, w środku
                    słowa dopiero, gdy nie ma innego wyjścia: `break-all` cięło „tablicy"
                    na „tab/licy" nawet tam, gdzie spacja była tuż obok. */}
                <div className="pe-mono text-xs text-slate-500 [overflow-wrap:anywhere]">= {k.podstawienie}</div>
                <div className="pe-mono text-sm font-semibold text-blueprint">= {k.wynik}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {wynik.zalozenia.length > 0 && (
        <div className="mt-2 rounded-lg border border-border bg-white/60 px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-slate-600">Przyjęte założenia</div>
          <ul className="space-y-1 text-xs leading-relaxed text-slate-500">
            {wynik.zalozenia.map((z, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden="true">•</span>
                <span>{z}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {wynik.zrodla.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {wynik.zrodla.map((z, i) => (
            <Badge key={i}>
              {z.norma}
              {z.miejsce ? ` ${z.miejsce}` : ""}
              {z.czego ? ` — ${z.czego}` : ""}
            </Badge>
          ))}
        </div>
      )}

      {/* Stopka merytoryczna wymagana przez specyfikację (pkt 3.7). Stoi przy KAŻDYM
          wyniku, a nie raz na dole zakładki: kalkulatory bywają czytane pojedynczo
          i zrzut ekranu jednego wyniku ma nieść to zastrzeżenie ze sobą. */}
      <div className="mt-2 text-xs leading-relaxed text-slate-400">
        Obliczenie wspomagające. Nie zastępuje projektu ani sprawdzenia wykonanego przez osobę z uprawnieniami — wynik
        jest ważny tylko dla podanych wyżej założeń.
      </div>
    </>
  );
}
