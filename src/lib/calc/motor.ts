/**
 * Silniki indukcyjne — spec pkt 5.9.
 *
 * Kalkulator odpowiada na pytanie, które przy silniku jest naprawdę trudne:
 * zabezpieczenie musi PRZEPUŚCIĆ prąd rozruchowy (5–8·In przez kilka sekund),
 * a jednocześnie zadziałać przy zwarciu — te dwa wymagania ciągną w przeciwne
 * strony. Dlatego zabezpieczenie zwarciowe i przeciążeniowe są tu ROZDZIELONE:
 * przekaźnik termiczny (albo wyzwalacz przeciążeniowy wyłącznika silnikowego)
 * pilnuje przeciążenia i jest nastawiany na In silnika, a wkładka aM / wyzwalacz
 * magnetyczny pilnuje zwarcia i musi być na tyle „ślepy", żeby przespać rozruch.
 *
 * Drugi warunek, o którym łatwo zapomnieć: spadek napięcia W CHWILI ROZRUCHU.
 * Silnik przy obniżonym napięciu ma moment proporcjonalny do U², więc 15% spadku
 * to już ~28% straty momentu — przy pełnym obciążeniu maszyna może nie ruszyć
 * i utknąć na prądzie rozruchowym aż do zadziałania zabezpieczenia.
 */

import { bladWyniku, formatLiczba, ocenPodLimitem, type CalcError, type CalcResult, type Krok } from "./result";

export type SposobRozruchu = "bezposredni" | "gwiazda_trojkat";

export const SPOSOB_ROZRUCHU_LABELS: Record<SposobRozruchu, string> = {
  bezposredni: "bezpośredni (DOL)",
  gwiazda_trojkat: "gwiazda–trójkąt (Y/Δ)",
};

/**
 * Dopuszczalny spadek napięcia na zaciskach silnika w chwili rozruchu [%].
 * Kryterium praktyki projektowej (spec pkt 5.9), nie wartość z tablicy normy.
 */
export const MAKS_SPADEK_ROZRUCHOWY_PCT = 15;

/**
 * Klasy wyzwalania przekaźników termicznych wg PN-EN 60947-4-1 — maksymalny czas
 * zadziałania przy 7,2·In (stan zimny). Do dobrania klasy pod czas rozruchu.
 */
export const KLASY_WYZWALANIA: { klasa: string; maksCzas_s: number; opis: string }[] = [
  { klasa: "10A", maksCzas_s: 10, opis: "rozruch lekki i krótki (do ok. 4 s)" },
  { klasa: "10", maksCzas_s: 10, opis: "rozruch typowy (do ok. 7 s)" },
  { klasa: "20", maksCzas_s: 20, opis: "rozruch ciężki (do ok. 14 s) — wentylatory, sprężarki" },
  { klasa: "30", maksCzas_s: 30, opis: "rozruch bardzo ciężki (do ok. 20 s) — duża bezwładność" },
];

export interface SilnikWejscie {
  /** Moc znamionowa NA WALE [W]. */
  moc_W: number;
  /** Napięcie międzyfazowe [V]. */
  Un_V: number;
  cosfi: number;
  sprawnosc: number;
  /** Krotność prądu rozruchowego przy rozruchu bezpośrednim (5–8). */
  krotnoscRozruchu: number;
  sposobRozruchu: SposobRozruchu;
  /** Czas rozruchu [s] — do doboru klasy wyzwalania. */
  czasRozruchu_s?: number;
  /** Impedancja obwodu zasilającego [Ω] — do spadku napięcia przy rozruchu. */
  impedancjaObwodu_ohm?: number;
}

export interface SilnikWynik {
  In_A: number;
  /** Prąd rozruchowy przy wybranym sposobie rozruchu [A]. */
  Ir_A: number;
  /** Prąd rozruchowy przy rozruchu bezpośrednim [A] — punkt odniesienia. */
  Ir_bezposredni_A: number;
  /** Względny moment rozruchowy (1,0 = rozruch bezpośredni). */
  momentWzgledny: number;
  /** Spadek napięcia przy rozruchu [%]. `null` bez podanej impedancji. */
  spadekRozruchowy_pct: number | null;
  /** Zalecana klasa wyzwalania przekaźnika termicznego. */
  klasaWyzwalania: string | null;
  /** Minimalny prąd znamionowy stycznika w kategorii AC-3 [A] — równy In silnika. */
  stycznikAC3_A: number;
}

export function obliczSilnik(w: SilnikWejscie): CalcResult<SilnikWynik> {
  const bledy: CalcError[] = [];
  if (!(w.moc_W > 0)) bledy.push({ code: "MOC", pole: "moc_W", message: "Moc silnika musi być większa od zera." });
  if (!(w.Un_V > 0)) bledy.push({ code: "UN", pole: "Un_V", message: "Napięcie musi być większe od zera." });
  if (!(w.cosfi > 0) || w.cosfi > 1)
    bledy.push({ code: "COSFI", pole: "cosfi", message: "cosφ musi mieścić się w przedziale (0; 1]." });
  if (!(w.sprawnosc > 0) || w.sprawnosc > 1)
    bledy.push({ code: "SPRAWNOSC", pole: "sprawnosc", message: "Sprawność musi mieścić się w przedziale (0; 1]." });
  // Zakres 5–8 to nie kaprys: poza nim albo dane pochodzą z innej wielkości
  // (np. podano prąd zamiast krotności), albo silnik ma nietypową konstrukcję
  // i krotność trzeba wziąć z tabliczki, a nie z widełek.
  if (!(w.krotnoscRozruchu >= 3 && w.krotnoscRozruchu <= 12))
    bledy.push({
      code: "KROTNOSC_POZA_ZAKRESEM",
      pole: "krotnoscRozruchu",
      message: "Krotność prądu rozruchowego poza typowym zakresem 3–12. Dla silników klatkowych to zwykle 5–8 — odczytaj wartość z tabliczki znamionowej zamiast zgadywać.",
    });
  if (bledy.length > 0) return bladWyniku(bledy);

  const In = w.moc_W / (Math.sqrt(3) * w.Un_V * w.cosfi * w.sprawnosc);
  const IrDOL = w.krotnoscRozruchu * In;
  // Y/Δ: prąd pobierany z sieci i moment spadają do 1/3 wartości przy DOL.
  const wspY = w.sposobRozruchu === "gwiazda_trojkat" ? 1 / 3 : 1;
  const Ir = IrDOL * wspY;

  const kroki: Krok[] = [
    {
      opis: "Prąd znamionowy silnika",
      wzor: "In = P / (√3 · U · cosφ · η)",
      podstawienie: `${formatLiczba(w.moc_W / 1000, 2)} kW / (√3 · ${formatLiczba(w.Un_V, 0)} · ${formatLiczba(w.cosfi, 2)} · ${formatLiczba(w.sprawnosc, 2)})`,
      wynik: `${formatLiczba(In, 2)} A`,
    },
    {
      opis: `Prąd rozruchowy — rozruch ${SPOSOB_ROZRUCHU_LABELS[w.sposobRozruchu]}`,
      wzor: w.sposobRozruchu === "gwiazda_trojkat" ? "Ir = (kr · In) / 3" : "Ir = kr · In",
      podstawienie: `${formatLiczba(w.krotnoscRozruchu, 1)} · ${formatLiczba(In, 2)}${w.sposobRozruchu === "gwiazda_trojkat" ? " / 3" : ""}`,
      wynik: `${formatLiczba(Ir, 1)} A`,
    },
  ];

  const zalozenia: string[] = [
    "Moc podana jako moc NA WALE (mechaniczna) — moc pobierana z sieci jest o 1/η większa.",
    `Stycznik dobierany w kategorii AC-3 (rozruch i wyłączanie silników klatkowych w ruchu) na prąd co najmniej ${formatLiczba(In, 1)} A. Kategoria AC-1 jest tu niewystarczająca.`,
    "Zabezpieczenie zwarciowe (wkładka aM / wyzwalacz magnetyczny) musi przepuścić prąd rozruchowy, a przeciążeniowe (przekaźnik termiczny) — nastawione na In silnika. To DWA różne aparaty albo dwie różne nastawy jednego wyłącznika silnikowego.",
  ];

  if (w.sposobRozruchu === "gwiazda_trojkat") {
    zalozenia.push(
      "Rozruch Y/Δ obniża prąd rozruchowy do 1/3, ale w tej samej proporcji obniża MOMENT rozruchowy — nadaje się tylko do napędów ruszających bez obciążenia albo z małym momentem oporowym (pompy, wentylatory), nie do sprężarek startujących pod ciśnieniem."
    );
  }

  // --- spadek napięcia przy rozruchu ----------------------------------------
  let spadekRozruchowy: number | null = null;
  let ocena = null;
  if (w.impedancjaObwodu_ohm !== undefined && w.impedancjaObwodu_ohm > 0) {
    const dU = Math.sqrt(3) * Ir * w.impedancjaObwodu_ohm;
    spadekRozruchowy = (dU / w.Un_V) * 100;
    kroki.push({
      opis: "Spadek napięcia na zaciskach silnika w chwili rozruchu",
      wzor: "ΔU = √3 · Ir · Z;  ΔU% = ΔU / U · 100%",
      podstawienie: `√3 · ${formatLiczba(Ir, 1)} · ${formatLiczba(w.impedancjaObwodu_ohm, 4)} = ${formatLiczba(dU, 1)} V`,
      wynik: `${formatLiczba(spadekRozruchowy, 2)} %`,
    });
    // Moment ∝ U² — pokazujemy skutek, bo sam procent spadku nic nie mówi.
    const stratMomentu = (1 - Math.pow(1 - spadekRozruchowy / 100, 2)) * 100;
    kroki.push({
      opis: "Skutek dla momentu rozruchowego (moment ∝ U²)",
      wzor: "M/Mn = (U/Un)²",
      podstawienie: `(1 − ${formatLiczba(spadekRozruchowy / 100, 4)})²`,
      wynik: `moment spada o ${formatLiczba(stratMomentu, 1)} %`,
    });
    ocena = ocenPodLimitem(spadekRozruchowy, MAKS_SPADEK_ROZRUCHOWY_PCT, {
      co: "Spadek napięcia przy rozruchu",
      jednostka: "%",
    });
  } else {
    zalozenia.push(
      "Nie podano impedancji obwodu zasilającego — NIE sprawdzono spadku napięcia przy rozruchu. Przy długich trasach i silnikach rozruchowo „twardych” to często warunek decydujący o przekroju, ostrzejszy niż obciążalność."
    );
  }

  // --- klasa wyzwalania przekaźnika termicznego ------------------------------
  let klasa: string | null = null;
  if (w.czasRozruchu_s !== undefined && w.czasRozruchu_s > 0) {
    // Klasa musi mieć czas zadziałania DŁUŻSZY od rozruchu, z zapasem —
    // przyjmujemy, że rozruch nie może przekroczyć ~70% czasu klasy.
    const wybrana = KLASY_WYZWALANIA.find((k) => w.czasRozruchu_s! <= k.maksCzas_s * 0.7);
    klasa = wybrana?.klasa ?? null;
    kroki.push({
      opis: "Klasa wyzwalania przekaźnika termicznego",
      wzor: "czas rozruchu ≤ 0,7 · czas zadziałania klasy (przy 7,2·In)",
      podstawienie: `rozruch ${formatLiczba(w.czasRozruchu_s, 1)} s`,
      wynik: klasa ? `klasa ${klasa}` : "żadna standardowa klasa nie wystarcza",
    });
    if (!klasa)
      zalozenia.push(
        "Czas rozruchu przekracza możliwości standardowych klas wyzwalania (10A/10/20/30) — potrzebne zabezpieczenie z pomiarem temperatury uzwojeń (termistory PTC) albo softstart."
      );
  }

  return {
    wartosci: {
      In_A: In,
      Ir_A: Ir,
      Ir_bezposredni_A: IrDOL,
      momentWzgledny: wspY,
      spadekRozruchowy_pct: spadekRozruchowy,
      klasaWyzwalania: klasa,
      stycznikAC3_A: In,
    },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-EN 60947-4-1", czego: "styczniki i rozruszniki, klasy wyzwalania" },
      { norma: "PN-HD 60364-4-43", czego: "ochrona przetężeniowa obwodów silnikowych" },
    ],
    bledy: [],
  };
}
