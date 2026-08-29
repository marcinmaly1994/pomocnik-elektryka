/**
 * Prądy zwarciowe i wytrzymałość zwarciowa cieplna — spec pkt 5.4.
 *
 * Współczynnik napięciowy `c` jest tu WYBOREM UŻYTKOWNIKA (przez `cel`), a nie
 * stałą: PN-EN 60909-0 każe liczyć c_max = 1,05 do doboru zdolności zwarciowej
 * aparatów (najgorszy przypadek to prąd NAJWIĘKSZY) i c_min = 0,95 do sprawdzania
 * skuteczności ochrony przeciwporażeniowej (najgorszy przypadek to prąd
 * NAJMNIEJSZY, bo od niego zależy, czy zabezpieczenie zdąży zadziałać).
 * Mieszanie tych dwóch jest wprost zakazane (spec pkt 7), dlatego `c` nie da się
 * tu podać wprost — wynika z zadeklarowanego celu obliczenia.
 */

import { C_NAPIECIOWE, K_ZYLA, type Izolacja, type Material } from "@/lib/norms/conductors";
import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

/** Po co liczymy zwarcie — decyduje o współczynniku napięciowym c. */
export type CelZwarcia = "dobor_aparatu" | "ochrona_przeciwporazeniowa";

export const CEL_ZWARCIA_LABELS: Record<CelZwarcia, string> = {
  dobor_aparatu: "dobór zdolności zwarciowej aparatu (c = 1,05)",
  ochrona_przeciwporazeniowa: "sprawdzenie ochrony przeciwporażeniowej (c = 0,95)",
};

export function wspolczynnikC(cel: CelZwarcia): number {
  return cel === "dobor_aparatu" ? C_NAPIECIOWE.max : C_NAPIECIOWE.min;
}

// --- impedancja transformatora ----------------------------------------------

export interface TransformatorWejscie {
  /** Moc znamionowa [VA]. */
  Sn_VA: number;
  /** Napięcie zwarcia [%]. */
  uk_pct: number;
  /** Napięcie znamionowe strony wtórnej [V] — międzyfazowe. */
  Un_V: number;
  /** Straty obciążeniowe (w miedzi) [W]. Opcjonalne — bez nich Rt = 0. */
  straty_Cu_W?: number;
}

export interface TransformatorWynik {
  Zt_ohm: number;
  Rt_ohm: number;
  Xt_ohm: number;
}

export function impedancjaTransformatora(w: TransformatorWejscie): CalcResult<TransformatorWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Sn_VA > 0)) bledy.push({ code: "SN", pole: "Sn_VA", message: "Moc znamionowa transformatora musi być większa od zera." });
  if (!(w.uk_pct > 0)) bledy.push({ code: "UK", pole: "uk_pct", message: "Napięcie zwarcia uk musi być większe od zera." });
  if (!(w.Un_V > 0)) bledy.push({ code: "UN", pole: "Un_V", message: "Napięcie znamionowe musi być większe od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const Zt = (w.uk_pct * w.Un_V * w.Un_V) / (100 * w.Sn_VA);
  const Rt = w.straty_Cu_W && w.straty_Cu_W > 0 ? (w.straty_Cu_W * w.Un_V * w.Un_V) / (w.Sn_VA * w.Sn_VA) : 0;
  // Xt = √(Zt² − Rt²) — przy zbyt dużych stratach wynik byłby urojony, co oznacza
  // niespójne dane wejściowe, a nie „mało reaktancji": mówimy o tym wprost.
  if (Rt > Zt)
    return bladWyniku([
      {
        code: "STRATY_NIESPOJNE",
        pole: "straty_Cu_W",
        message: `Rezystancja z podanych strat obciążeniowych (${formatLiczba(Rt * 1000, 2)} mΩ) przekracza impedancję zwarcia (${formatLiczba(Zt * 1000, 2)} mΩ). Sprawdź dane z tabliczki znamionowej transformatora.`,
      },
    ]);
  const Xt = Math.sqrt(Zt * Zt - Rt * Rt);

  const kroki: Krok[] = [
    {
      opis: "Impedancja zwarciowa transformatora",
      wzor: "Zt = (uk% · Un²) / (100 · Sn)",
      podstawienie: `(${formatLiczba(w.uk_pct, 2)} · ${formatLiczba(w.Un_V, 0)}²) / (100 · ${formatLiczba(w.Sn_VA, 0)})`,
      wynik: `${formatLiczba(Zt * 1000, 2)} mΩ`,
    },
  ];
  if (Rt > 0) {
    kroki.push({
      opis: "Rezystancja transformatora ze strat obciążeniowych",
      wzor: "Rt = (ΔPCu · Un²) / Sn²",
      podstawienie: `(${formatLiczba(w.straty_Cu_W!, 0)} · ${formatLiczba(w.Un_V, 0)}²) / ${formatLiczba(w.Sn_VA, 0)}²`,
      wynik: `${formatLiczba(Rt * 1000, 2)} mΩ`,
    });
    kroki.push({
      opis: "Reaktancja transformatora",
      wzor: "Xt = √(Zt² − Rt²)",
      podstawienie: `√(${formatLiczba(Zt * 1000, 2)}² − ${formatLiczba(Rt * 1000, 2)}²) mΩ`,
      wynik: `${formatLiczba(Xt * 1000, 2)} mΩ`,
    });
  }

  return {
    wartosci: { Zt_ohm: Zt, Rt_ohm: Rt, Xt_ohm: Xt },
    kroki,
    ocena: null,
    zalozenia: Rt === 0 ? ["Pominięto rezystancję transformatora (nie podano strat obciążeniowych) — wynik Ik jest przez to nieco zawyżony."] : [],
    zrodla: [{ norma: "PN-EN 60909-0", czego: "obliczanie prądów zwarciowych" }],
    bledy: [],
  };
}

// --- prądy zwarciowe ---------------------------------------------------------

export interface ZwarcieWejscie {
  cel: CelZwarcia;
  /** Napięcie międzyfazowe [V]. */
  Un_V: number;
  /** Napięcie fazowe [V] — do zwarcia 1-fazowego. */
  U0_V: number;
  /** Impedancja zwarciowa obwodu 3-fazowego [Ω] (źródło + linia). */
  Zk_ohm: number;
  /** Impedancja pętli zwarcia L-PE [Ω] — do zwarcia 1-fazowego. Opcjonalna. */
  Zs_ohm?: number;
  /** Stosunek R/X w miejscu zwarcia — do prądu udarowego. */
  R_do_X?: number;
}

export interface ZwarcieWynik {
  c: number;
  /** Zwarcie trójfazowe [A]. */
  Ik3_A: number;
  /** Zwarcie dwufazowe [A] — Ik2 = (√3/2)·Ik3. */
  Ik2_A: number;
  /** Zwarcie jednofazowe L-PE [A]. `null`, gdy nie podano Zs. */
  Ik1_A: number | null;
  /** Prąd udarowy [A]. `null`, gdy nie podano R/X. */
  ip_A: number | null;
  kappa: number | null;
}

export function obliczPradyZwarciowe(w: ZwarcieWejscie): CalcResult<ZwarcieWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Un_V > 0)) bledy.push({ code: "UN", pole: "Un_V", message: "Napięcie międzyfazowe musi być większe od zera." });
  if (!(w.Zk_ohm > 0)) bledy.push({ code: "ZK", pole: "Zk_ohm", message: "Impedancja zwarciowa musi być większa od zera." });
  if (bledy.length > 0) return bladWyniku(bledy);

  const c = wspolczynnikC(w.cel);
  const Ik3 = (c * w.Un_V) / (Math.sqrt(3) * w.Zk_ohm);
  const Ik2 = (Math.sqrt(3) / 2) * Ik3;
  const Ik1 = w.Zs_ohm && w.Zs_ohm > 0 ? (c * w.U0_V) / w.Zs_ohm : null;

  const kroki: Krok[] = [
    {
      opis: "Zwarcie trójfazowe",
      wzor: "Ik3 = c · Un / (√3 · Zk)",
      podstawienie: `${formatLiczba(c, 2)} · ${formatLiczba(w.Un_V, 0)} / (√3 · ${formatLiczba(w.Zk_ohm, 5)})`,
      wynik: `${formatLiczba(Ik3 / 1000, 2)} kA`,
    },
    {
      opis: "Zwarcie dwufazowe",
      wzor: "Ik2 = (√3 / 2) · Ik3",
      podstawienie: `0,866 · ${formatLiczba(Ik3 / 1000, 2)} kA`,
      wynik: `${formatLiczba(Ik2 / 1000, 2)} kA`,
    },
  ];

  if (Ik1 !== null) {
    kroki.push({
      opis: "Zwarcie jednofazowe L-PE",
      wzor: "Ik1 = c · U₀ / Zs",
      podstawienie: `${formatLiczba(c, 2)} · ${formatLiczba(w.U0_V, 0)} / ${formatLiczba(w.Zs_ohm!, 3)}`,
      wynik: `${formatLiczba(Ik1, 0)} A`,
    });
  }

  let kappa: number | null = null;
  let ip: number | null = null;
  if (w.R_do_X !== undefined && w.R_do_X >= 0) {
    kappa = 1.02 + 0.98 * Math.exp(-3 * w.R_do_X);
    ip = kappa * Math.SQRT2 * Ik3;
    kroki.push({
      opis: "Prąd udarowy",
      wzor: "κ = 1,02 + 0,98·e^(−3R/X);  ip = κ · √2 · Ik″",
      podstawienie: `κ = 1,02 + 0,98·e^(−3·${formatLiczba(w.R_do_X, 3)}) = ${formatLiczba(kappa, 3)};  ip = ${formatLiczba(kappa, 3)} · √2 · ${formatLiczba(Ik3 / 1000, 2)} kA`,
      wynik: `${formatLiczba(ip / 1000, 2)} kA`,
    });
  }

  return {
    wartosci: { c, Ik3_A: Ik3, Ik2_A: Ik2, Ik1_A: Ik1, ip_A: ip, kappa },
    kroki,
    ocena: null,
    zalozenia: [
      `Współczynnik napięciowy c = ${formatLiczba(c, 2)} — ${CEL_ZWARCIA_LABELS[w.cel]}.`,
      "Zwarcie w miejscu o podanej impedancji, źródło o pomijalnej zmienności napięcia (sieć sztywna).",
    ],
    zrodla: [{ norma: "PN-EN 60909-0", czego: "prądy zwarciowe, współczynnik c i κ" }],
    bledy: [],
  };
}

// --- wytrzymałość zwarciowa cieplna -----------------------------------------

export interface WytrzymaloscWejscie {
  /** Prąd zwarciowy [A]. */
  Ik_A: number;
  /** Czas trwania zwarcia [s] — wzór ważny dla t ≤ 5 s. */
  czas_s: number;
  material: Material;
  izolacja: Izolacja;
  /** Rzeczywisty przekroj żyły [mm²] — do oceny warunku. Opcjonalny. */
  przekroj_mm2?: number;
}

export interface WytrzymaloscWynik {
  k: number;
  /** Minimalny przekrój ze względu na zwarcie [mm²]. */
  minPrzekroj_mm2: number;
  /** Maksymalny czas trwania zwarcia dla podanego przekroju [s]. */
  maksCzas_s: number | null;
}

export const MAKS_CZAS_WZORU_ADIABATYCZNEGO_S = 5;

export function obliczWytrzymaloscZwarciowa(w: WytrzymaloscWejscie): CalcResult<WytrzymaloscWynik> {
  const bledy: CalcError[] = [];
  if (!(w.Ik_A > 0)) bledy.push({ code: "IK", pole: "Ik_A", message: "Prąd zwarciowy musi być większy od zera." });
  if (!(w.czas_s > 0)) bledy.push({ code: "CZAS", pole: "czas_s", message: "Czas trwania zwarcia musi być większy od zera." });
  // Wzór adiabatyczny obowiązuje do 5 s — dłużej przewód oddaje ciepło otoczeniu
  // i założenie przestaje być prawdziwe. To błąd, nie ostrzeżenie (spec pkt 3.5).
  if (w.czas_s > MAKS_CZAS_WZORU_ADIABATYCZNEGO_S)
    bledy.push({
      code: "CZAS_POZA_ZAKRESEM",
      pole: "czas_s",
      message: `Wzór adiabatyczny S ≥ I·√t / k obowiązuje dla czasu do ${MAKS_CZAS_WZORU_ADIABATYCZNEGO_S} s. Dla dłuższych zwarć potrzebna jest metoda uwzględniająca oddawanie ciepła — ten kalkulator jej nie obejmuje.`,
    });
  if (bledy.length > 0) return bladWyniku(bledy);

  const k = K_ZYLA[w.material][w.izolacja];
  const minPrzekroj = (w.Ik_A * Math.sqrt(w.czas_s)) / k;

  const kroki: Krok[] = [
    {
      opis: "Minimalny przekrój ze względu na wytrzymałość zwarciową cieplną",
      wzor: "S ≥ I · √t / k",
      podstawienie: `${formatLiczba(w.Ik_A, 0)} · √${formatLiczba(w.czas_s, 3)} / ${k}`,
      wynik: `${formatLiczba(minPrzekroj, 2)} mm²`,
    },
  ];

  let maksCzas: number | null = null;
  let ocena = null;
  if (w.przekroj_mm2 && w.przekroj_mm2 > 0) {
    maksCzas = Math.pow((k * w.przekroj_mm2) / w.Ik_A, 2);
    kroki.push({
      opis: "Maksymalny czas trwania zwarcia dla podanego przekroju",
      wzor: "t_max = (k · S / I)²",
      podstawienie: `(${k} · ${formatLiczba(w.przekroj_mm2, 1)} / ${formatLiczba(w.Ik_A, 0)})²`,
      wynik: `${formatLiczba(maksCzas, 3)} s`,
    });
    const margines = ((w.przekroj_mm2 - minPrzekroj) / minPrzekroj) * 100;
    ocena =
      w.przekroj_mm2 >= minPrzekroj
        ? {
            verdict: (margines < 10 ? "graniczny" : "spelniony") as "graniczny" | "spelniony",
            margines_pct: margines,
            komunikat:
              margines < 10
                ? `Przekrój ${formatLiczba(w.przekroj_mm2, 1)} mm² przekracza wymagane ${formatLiczba(minPrzekroj, 2)} mm² tylko o ${formatLiczba(margines, 1)}% — wynik graniczny.`
                : `Przekrój ${formatLiczba(w.przekroj_mm2, 1)} mm² spełnia wymóg ${formatLiczba(minPrzekroj, 2)} mm² z zapasem ${formatLiczba(margines, 1)}%.`,
          }
        : {
            verdict: "niespelniony" as const,
            margines_pct: margines,
            komunikat: `Przekrój ${formatLiczba(w.przekroj_mm2, 1)} mm² jest za mały — zwarcie ${formatLiczba(w.Ik_A, 0)} A przez ${formatLiczba(w.czas_s, 3)} s wymaga co najmniej ${formatLiczba(minPrzekroj, 2)} mm². Przewód zdąży się przegrzać, zanim zabezpieczenie wyłączy obwód.`,
          };
  }

  return {
    wartosci: { k, minPrzekroj_mm2: minPrzekroj, maksCzas_s: maksCzas },
    kroki,
    ocena,
    zalozenia: [
      `Współczynnik k = ${k} dla żyły ${w.material} w izolacji ${w.izolacja}.`,
      "Wzór adiabatyczny: całe ciepło zwarcia zostaje w żyle (bez oddawania do otoczenia) — założenie bezpieczne dla czasów do 5 s.",
    ],
    zrodla: [{ norma: "PN-HD 60364-4-43", czego: "wytrzymałość zwarciowa cieplna przewodu" }],
    bledy: [],
  };
}
