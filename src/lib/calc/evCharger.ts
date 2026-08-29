/**
 * Ładowarki pojazdów elektrycznych (EVSE) — spec pkt 5.12 (pozycja opcjonalna).
 *
 * Dwie rzeczy odróżniają ten dobór od zwykłego obwodu dedykowanego:
 *
 *  1. Praca CIĄGŁA. Ładowanie trwa godzinami przy PEŁNYM prądzie, bez przerw —
 *     ale to NIE znaczy, że trzeba dołożyć jakiś dodatkowy mnożnik bezpieczeństwa
 *     do obciążalności. Tablice Iz (PN-HD 60364-5-52) z DEFINICJI opisują prąd
 *     DŁUGOTRWAŁY — zwykły dobór wg Iz już to uwzględnia. Czego NIE wolno
 *     zrobić, to potraktować obwód jak gniazda ze współczynnikiem jednoczesności
 *     (jak w kalkulatorze „Bilans mocy") — ładowarka pracuje przy swoim pełnym
 *     prądzie, nie „czasami jak inne gniazda w domu", więc `sizeCircuit` jest tu
 *     wołany z pełnym Ib, bez żadnej redukcji.
 *
 *  2. Ochrona różnicowoprądowa. PN-HD 60364-7-722 wymaga więcej niż zwykły RCD
 *     typu AC/A: usterka w prostowniku ładowarki potrafi wprowadzić do sieci
 *     składową STAŁĄ prądu upływu, na którą standardowy RCD jest ślepy (nie
 *     zadziała). Wymagany jest RCD typu B, ALBO typu A razem z osobnym
 *     urządzeniem RDC-DD wykrywającym prąd stały ≥ 6 mA — chyba że sama
 *     ładowarka ma taką ochronę wbudowaną (typowe dla stacji ściennych zgodnych
 *     z IEC 62752 / 61851, tryb 3).
 *
 * Dobór przekroju i zabezpieczenia korzysta wprost z `sizeCircuit` — ten sam
 * silnik, który dobiera każdy inny obwód w aplikacji.
 */

import type { LayingMethod } from "@/lib/panel/norms";
import { sizeCircuit, type PhaseCount, type SizedCircuit } from "@/lib/panel/sizing";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

export type WymaganyRCD = "typA_wystarczy" | "typB_albo_RDC-DD";

export interface EVWejscie {
  mocLadowania_W: number;
  liczba_faz: PhaseCount;
  /** cosφ ładowarki — nowoczesne ładowarki z PFC mają blisko 1. */
  cos_phi: number;
  dlugosc_m: number;
  sposob_ulozenia: LayingMethod;
  temperatura_otoczenia_C?: number;
  obwodow_w_wiazce?: number;
  /** Czy EVSE ma wbudowaną ochronę przed prądem upływu stałym (RDC-DD albo
   *  równoważną, zadeklarowaną przez producenta — typowe dla stacji ściennych). */
  maWbudowanaOchroneDC: boolean;
}

export interface EVWynik {
  Ib_A: number;
  dobor: SizedCircuit;
  wymaganyRCD: WymaganyRCD;
}

function walidacja(w: EVWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.mocLadowania_W > 0)) b.push({ code: "MOC", pole: "mocLadowania_W", message: "Moc ładowania musi być większa od zera." });
  if (!(w.cos_phi > 0) || w.cos_phi > 1)
    b.push({ code: "COSFI", pole: "cos_phi", message: "cosφ musi mieścić się w przedziale (0; 1]." });
  return b;
}

export function obliczObwodEV(w: EVWejscie): CalcResult<EVWynik> {
  const bledy = walidacja(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const dobor = sizeCircuit({
    id: "evse",
    nazwa: "Ładowarka EV",
    typ: "dedykowany",
    moc_W: w.mocLadowania_W,
    liczba_faz: w.liczba_faz,
    cos_phi: w.cos_phi,
    dlugosc_m: w.dlugosc_m > 0 ? w.dlugosc_m : undefined,
    sposob_ulozenia: w.sposob_ulozenia,
    temperatura_otoczenia_C: w.temperatura_otoczenia_C,
    obwodow_w_wiazce: w.obwodow_w_wiazce,
  });

  const Ib = dobor.Ib_A ?? 0;
  const kroki: Krok[] = [
    {
      opis: "Prąd obliczeniowy ładowarki",
      wzor: w.liczba_faz === "3" ? "Ib = P / (√3 · U · cosφ)" : "Ib = P / (U · cosφ)",
      podstawienie:
        w.liczba_faz === "3"
          ? `${formatLiczba(w.mocLadowania_W, 0)} / (√3 · 400 · ${formatLiczba(w.cos_phi, 2)})`
          : `${formatLiczba(w.mocLadowania_W, 0)} / (230 · ${formatLiczba(w.cos_phi, 2)})`,
      wynik: `${formatLiczba(Ib, 2)} A`,
    },
  ];

  const wymaganyRCD: WymaganyRCD = w.maWbudowanaOchroneDC ? "typA_wystarczy" : "typB_albo_RDC-DD";

  const zalozenia = [
    "Obwód traktowany jako obciążony PEŁNYM prądem ciągle (bez współczynnika jednoczesności) — to jedyny odbiornik na tym obwodzie i tak go trzeba dobrać, niezależnie od tego, jak długo faktycznie trwa ładowanie.",
    "Obwód MUSI być dedykowany wyłącznie do ładowania — bez dzielenia z innymi gniazdami czy odbiornikami.",
    wymaganyRCD === "typA_wystarczy"
      ? "Ładowarka ma zadeklarowaną wbudowaną ochronę przed prądem upływu stałym (RDC-DD) — standardowy RCD typu A 30 mA przed obwodem jest wystarczający."
      : "Bez wbudowanej ochrony w ładowarce zwykły RCD typu AC/A NIE WYSTARCZA: usterka w prostowniku ładowarki potrafi wprowadzić do sieci składową stałą, na którą jest ślepy. Wymagany RCD typu B ALBO typu A + osobne urządzenie RDC-DD (≥ 6 mA DC) przed obwodem.",
  ];

  return {
    wartosci: { Ib_A: Ib, dobor, wymaganyRCD },
    kroki,
    ocena:
      dobor.przekroj_mm2 && dobor.aparat
        ? { verdict: dobor.status === "ok" ? "spelniony" : "graniczny", margines_pct: null, komunikat: `Dobrano ${dobor.kabel} z zabezpieczeniem ${dobor.aparat.charakterystyka}${dobor.aparat.In_A}.` }
        : { verdict: "niespelniony", margines_pct: null, komunikat: "Nie udało się dobrać przewodu i zabezpieczenia — zobacz ostrzeżenia niżej." },
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-7-722", czego: "zasilanie pojazdów elektrycznych — wymagania na RCD" },
      { norma: "PN-HD 60364-5-52", czego: "dobór przewodu (praca ciągła = obciążalność długotrwała)" },
    ],
    bledy: [],
  };
}
