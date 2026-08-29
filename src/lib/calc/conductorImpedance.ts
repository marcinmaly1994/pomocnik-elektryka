/**
 * Impedancja przewodu i przewody równoległe — spec pkt 5.12.
 *
 * Część „przewody równoległe" nie jest kalkulatorem ozdobnym: norma dopuszcza
 * łączenie żył równolegle tylko przy zachowaniu warunków (ten sam materiał,
 * przekrój, długość, sposób ułożenia, brak odgałęzień po drodze), a powód jest
 * czysto ilościowy — prąd dzieli się ODWROTNIE PROPORCJONALNIE do impedancji,
 * więc krótsza żyła bierze go więcej. Przy różnych długościach jedna z żył jest
 * przeciążona, mimo że SUMA prądów mieści się w obciążalności, a zabezpieczenie
 * nadprądowe tego nie widzi, bo mierzy prąd całkowity. Ten kalkulator pokazuje
 * ten rozjazd liczbowo, zamiast poprzestawać na „przewody muszą być równe".
 */

import {
  X_JEDNOSTKOWA_OHM_KM,
  TEMP_PRACY,
  konduktywnosc,
  rezystywnosc,
  type Izolacja,
  type Material,
  type RodzajLinii,
} from "@/lib/norms/conductors";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

export interface ImpedancjaWejscie {
  dlugosc_m: number;
  przekroj_mm2: number;
  material: Material;
  izolacja: Izolacja;
  /** Temperatura żyły [°C]. Domyślnie temperatura pracy wg izolacji. */
  tempZyly_C?: number;
  rodzajLinii?: RodzajLinii;
  xJednostkowa_ohm_km?: number;
}

export interface ImpedancjaWynik {
  tempZyly_C: number;
  gamma: number;
  rho: number;
  R_ohm: number;
  X_ohm: number;
  Z_ohm: number;
  /** Stosunek R/X — potrzebny m.in. do prądu udarowego zwarcia. */
  R_do_X: number | null;
}

export function obliczImpedancjePrzewodu(w: ImpedancjaWejscie): CalcResult<ImpedancjaWynik> {
  const bledy: CalcError[] = [];
  if (!(w.dlugosc_m > 0)) bledy.push({ code: "DLUGOSC", pole: "dlugosc_m", message: "Długość przewodu musi być większa od zera." });
  if (!(w.przekroj_mm2 > 0)) bledy.push({ code: "PRZEKROJ", pole: "przekroj_mm2", message: "Przekrój musi być większy od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const temp = w.tempZyly_C ?? TEMP_PRACY[w.izolacja];
  const rho = rezystywnosc(w.material, temp);
  const gamma = konduktywnosc(w.material, temp);
  const R = (rho * w.dlugosc_m) / w.przekroj_mm2;
  const xJedn = w.xJednostkowa_ohm_km ?? X_JEDNOSTKOWA_OHM_KM[w.rodzajLinii ?? "kabel_wielozylowy"];
  const X = (xJedn / 1000) * w.dlugosc_m;
  const Z = Math.hypot(R, X);

  return {
    wartosci: { tempZyly_C: temp, gamma, rho, R_ohm: R, X_ohm: X, Z_ohm: Z, R_do_X: X > 0 ? R / X : null },
    kroki: [
      {
        opis: `Rezystywność w temperaturze żyły ${formatLiczba(temp, 0)} °C`,
        wzor: "ρ(θ) = ρ₂₀ · [1 + α · (θ − 20)]",
        podstawienie: `1/${formatLiczba(konduktywnosc(w.material, 20), 0)} · [1 + ${w.material === "Cu" ? "0,00393" : "0,00403"} · (${formatLiczba(temp, 0)} − 20)]`,
        wynik: `${formatLiczba(rho, 5)} Ω·mm²/m  (γ = ${formatLiczba(gamma, 1)})`,
      },
      {
        opis: "Rezystancja przewodu",
        wzor: "R = ρ · L / S",
        podstawienie: `${formatLiczba(rho, 5)} · ${formatLiczba(w.dlugosc_m, 1)} / ${formatLiczba(w.przekroj_mm2, 1)}`,
        wynik: `${formatLiczba(R, 4)} Ω`,
      },
      {
        opis: "Reaktancja przewodu",
        wzor: "X = X′ · L",
        podstawienie: `${formatLiczba(xJedn, 3)} Ω/km · ${formatLiczba(w.dlugosc_m / 1000, 4)} km`,
        wynik: `${formatLiczba(X, 4)} Ω`,
      },
      {
        opis: "Impedancja",
        wzor: "Z = √(R² + X²)",
        podstawienie: `√(${formatLiczba(R, 4)}² + ${formatLiczba(X, 4)}²)`,
        wynik: `${formatLiczba(Z, 4)} Ω`,
      },
    ],
    ocena: null,
    zalozenia: [
      `Temperatura żyły ${formatLiczba(temp, 0)} °C (izolacja ${w.izolacja}). Do obliczeń zwarciowych i pętli zwarcia stosuje się WYŻSZĄ temperaturę niż do spadku napięcia — sprawdź, do czego wynik ma posłużyć.`,
      "Wartość X′ jest parametrem konfigurowalnym — dla kabli jednożyłowych i linii gołych zależy od rozstawu żył.",
    ],
    zrodla: [{ norma: "PN-HD 60364-5-52", czego: "parametry oprzewodowania" }],
    bledy: [],
  };
}

// --- przewody równoległe -----------------------------------------------------

export interface RownolegleWejscie {
  /** Prąd całkowity obwodu [A]. */
  pradCalkowity_A: number;
  /** Długości poszczególnych żył [m] — różnice są tu istotą problemu. */
  dlugosci_m: number[];
  przekroj_mm2: number;
  material: Material;
  izolacja: Izolacja;
  /** Obciążalność JEDNEJ żyły po współczynnikach [A] — do oceny przeciążenia. */
  Iz_jednej_A?: number;
}

export interface RownolegleWynik {
  /** Prąd w każdej żyle [A]. */
  prady_A: number[];
  /** Prąd, jaki popłynąłby przy idealnie równym podziale [A]. */
  pradRowny_A: number;
  /** Największe odchylenie od równego podziału [%]. */
  odchylenie_pct: number;
  /** Największy prąd w pojedynczej żyle [A]. */
  Imax_A: number;
}

export function obliczPrzewodyRownolegle(w: RownolegleWejscie): CalcResult<RownolegleWynik> {
  const bledy: CalcError[] = [];
  if (!(w.pradCalkowity_A > 0))
    bledy.push({ code: "PRAD", pole: "pradCalkowity_A", message: "Prąd całkowity musi być większy od zera." });
  if (w.dlugosci_m.length < 2)
    bledy.push({ code: "ZA_MALO_ZYL", message: "Podaj co najmniej dwie żyły — inaczej nie ma czego łączyć równolegle." });
  if (w.dlugosci_m.some((L) => !(L > 0)))
    bledy.push({ code: "DLUGOSC", message: "Każda żyła musi mieć długość większą od zera." });
  if (!(w.przekroj_mm2 > 0)) bledy.push({ code: "PRZEKROJ", pole: "przekroj_mm2", message: "Przekrój musi być większy od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const n = w.dlugosci_m.length;
  // Przy jednakowym przekroju i materiale impedancja jest wprost proporcjonalna
  // do długości, więc konduktancja ~ 1/L. Prąd dzieli się proporcjonalnie do niej.
  const konduktancje = w.dlugosci_m.map((L) => 1 / L);
  const sumaKonduktancji = konduktancje.reduce((a, b) => a + b, 0);
  const prady = konduktancje.map((g) => w.pradCalkowity_A * (g / sumaKonduktancji));
  const pradRowny = w.pradCalkowity_A / n;
  const Imax = Math.max(...prady);
  const odchylenie = ((Imax - pradRowny) / pradRowny) * 100;

  const kroki: Krok[] = [
    {
      opis: "Podział prądu między żyły (odwrotnie proporcjonalny do impedancji)",
      wzor: "Iᵢ = I · (1/Lᵢ) / Σ(1/Lⱼ)",
      podstawienie: w.dlugosci_m.map((L) => `L=${formatLiczba(L, 1)} m`).join(", "),
      wynik: prady.map((I) => `${formatLiczba(I, 1)} A`).join(" / "),
    },
    {
      opis: "Odchylenie od równego podziału",
      wzor: "δ = (I_max − I/n) / (I/n) · 100%",
      podstawienie: `(${formatLiczba(Imax, 1)} − ${formatLiczba(pradRowny, 1)}) / ${formatLiczba(pradRowny, 1)} · 100%`,
      wynik: `${formatLiczba(odchylenie, 1)} %`,
    },
  ];

  const rozneDlugosci = Math.max(...w.dlugosci_m) - Math.min(...w.dlugosci_m) > 1e-9;
  const zalozenia = [
    "Wszystkie żyły mają ten sam przekój, materiał i sposób ułożenia — bez tego podział prądu liczy się inaczej i warunek dopuszczalności połączenia równoległego nie jest spełniony.",
    "Żyły biegną bez odgałęzień na całej długości — odgałęzienie zmienia rozkład prądu i wyklucza traktowanie ich jako jednego przewodu.",
    "Pominięto wpływ wzajemnego oddziaływania (efekt zbliżenia) — przy dużych przekrojach i kablach jednożyłowych podział bywa dodatkowo nierówny.",
  ];

  // Ocena: kluczowe jest, czy NAJBARDZIEJ obciążona żyła mieści się w obciążalności,
  // a nie czy mieści się w niej suma podzielona przez liczbę żył.
  let ocena = null;
  if (w.Iz_jednej_A && w.Iz_jednej_A > 0) {
    const margines = ((w.Iz_jednej_A - Imax) / w.Iz_jednej_A) * 100;
    if (Imax > w.Iz_jednej_A) {
      ocena = {
        verdict: "niespelniony" as const,
        margines_pct: margines,
        komunikat: `Najbardziej obciążona żyła prowadzi ${formatLiczba(Imax, 1)} A przy obciążalności ${formatLiczba(w.Iz_jednej_A, 1)} A. Zabezpieczenie nadprądowe tego NIE wykryje — mierzy prąd całkowity (${formatLiczba(w.pradCalkowity_A, 1)} A), który dzielony po równo mieściłby się w normie. Wyrównaj długości żył.`,
      };
    } else if (margines < 10) {
      ocena = {
        verdict: "graniczny" as const,
        margines_pct: margines,
        komunikat: `Najbardziej obciążona żyła prowadzi ${formatLiczba(Imax, 1)} A przy obciążalności ${formatLiczba(w.Iz_jednej_A, 1)} A — zapas tylko ${formatLiczba(margines, 1)}%.`,
      };
    } else {
      ocena = {
        verdict: "spelniony" as const,
        margines_pct: margines,
        komunikat: `Najbardziej obciążona żyła prowadzi ${formatLiczba(Imax, 1)} A przy obciążalności ${formatLiczba(w.Iz_jednej_A, 1)} A — zapas ${formatLiczba(margines, 1)}%.`,
      };
    }
  }

  if (rozneDlugosci) {
    zalozenia.unshift(
      `UWAGA: podane długości NIE SĄ równe (${formatLiczba(Math.min(...w.dlugosci_m), 1)}–${formatLiczba(Math.max(...w.dlugosci_m), 1)} m). Norma wymaga jednakowej długości właśnie dlatego, że prąd dzieli się odwrotnie proporcjonalnie do impedancji — tutaj rozjazd wynosi ${formatLiczba(odchylenie, 1)}%.`
    );
  }

  return {
    wartosci: { prady_A: prady, pradRowny_A: pradRowny, odchylenie_pct: odchylenie, Imax_A: Imax },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-52", czego: "przewody połączone równolegle" },
      { norma: "PN-HD 60364-4-43", czego: "ochrona przetężeniowa przewodów równoległych" },
    ],
    bledy: [],
  };
}
