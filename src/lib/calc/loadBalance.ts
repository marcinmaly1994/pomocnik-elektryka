/**
 * Bilans obciążeń, asymetria faz i prąd w przewodzie neutralnym — spec pkt 5.8.
 *
 * Sedno tego kalkulatora to prąd w przewodzie N, a nie sam bilans mocy: przy
 * odbiorach LINIOWYCH prąd w N wynika z asymetrii i jest zawsze mniejszy od
 * największego prądu fazowego, ale przy odbiorach NIELINIOWYCH (zasilacze
 * impulsowe, LED, falowniki) trzecia harmoniczna sumuje się arytmetycznie
 * w przewodzie neutralnym zamiast się znosić — i prąd w N potrafi przekroczyć
 * prąd fazowy nawet przy idealnie symetrycznym obciążeniu. Przewód N dobrany
 * „na oko" jako połowa fazowego jest wtedy przeciążony, a nic tego nie
 * zabezpiecza, bo w N nie ma wyłącznika.
 */

import { bladWyniku, formatLiczba, type CalcError, type CalcResult, type Krok } from "./result";

export type Faza = "L1" | "L2" | "L3";

export interface Odbior {
  nazwa: string;
  /** Moc czynna [W]. */
  moc_W: number;
  cosfi: number;
  /** Sprawność (silniki); 1 dla odbiorów rezystancyjnych i elektroniki. */
  sprawnosc?: number;
  /** Przypisanie do fazy. `null` = odbiór trójfazowy (obciąża wszystkie równo). */
  faza: Faza | null;
  /** Współczynnik jednoczesności tego odbioru. */
  wspJednoczesnosci?: number;
}

export interface BilansWejscie {
  odbiory: Odbior[];
  /** Napięcie fazowe [V]. */
  U0_V: number;
  /** Napięcie międzyfazowe [V]. */
  Un_V: number;
  /** Udział 3. harmonicznej w prądzie fazowym [%] — 0 dla odbiorów liniowych. */
  udzialH3_pct: number;
}

export interface BilansWynik {
  /** Moc zainstalowana [W]. */
  Pi_W: number;
  /** Moc szczytowa po współczynnikach jednoczesności [W]. */
  Ps_W: number;
  Q_var: number;
  S_VA: number;
  /** Wypadkowy cosφ całego bilansu. */
  cosfi: number;
  prady: Record<Faza, number>;
  /** Asymetria: (I_max − I_min) / I_max · 100%. */
  asymetria_pct: number;
  /** Prąd w przewodzie neutralnym — składowa od asymetrii [A]. */
  IN_asymetria_A: number;
  /** Prąd w N z uwzględnieniem 3. harmonicznej [A]. */
  IN_calkowity_A: number;
  /** Największy prąd fazowy [A] — do porównania z prądem w N. */
  Imax_faza_A: number;
}

function walidacja(w: BilansWejscie): CalcError[] {
  const b: CalcError[] = [];
  if (!(w.U0_V > 0)) b.push({ code: "U0", pole: "U0_V", message: "Napięcie fazowe musi być większe od zera." });
  if (!(w.Un_V > 0)) b.push({ code: "UN", pole: "Un_V", message: "Napięcie międzyfazowe musi być większe od zera." });
  if (w.odbiory.length === 0) b.push({ code: "BRAK_ODBIOROW", message: "Dodaj co najmniej jeden odbiór." });
  if (w.udzialH3_pct < 0 || w.udzialH3_pct > 100)
    b.push({ code: "H3", pole: "udzialH3_pct", message: "Udział 3. harmonicznej musi mieścić się w przedziale 0–100%." });
  for (const o of w.odbiory) {
    if (!(o.cosfi > 0) || o.cosfi > 1)
      b.push({ code: "COSFI", message: `Odbiór „${o.nazwa}": cosφ musi mieścić się w przedziale (0; 1].` });
    if (o.sprawnosc !== undefined && (o.sprawnosc <= 0 || o.sprawnosc > 1))
      b.push({ code: "SPRAWNOSC", message: `Odbiór „${o.nazwa}": sprawność musi mieścić się w przedziale (0; 1].` });
  }
  return b;
}

export function obliczBilans(w: BilansWejscie): CalcResult<BilansWynik> {
  const bledy = walidacja(w);
  if (bledy.length > 0) return bladWyniku(bledy);

  const prady: Record<Faza, number> = { L1: 0, L2: 0, L3: 0 };
  let Pi = 0;
  let Ps = 0;
  let Q = 0;

  for (const o of w.odbiory) {
    const kj = o.wspJednoczesnosci ?? 1;
    const eta = o.sprawnosc ?? 1;
    const Pszczyt = o.moc_W * kj;
    Pi += o.moc_W;
    Ps += Pszczyt;
    Q += Pszczyt * Math.sqrt(Math.max(0, 1 / (o.cosfi * o.cosfi) - 1));

    if (o.faza === null) {
      // Odbiór 3-fazowy: I = P/(√3·U·cosφ·η) płynie w KAŻDEJ fazie.
      const I = Pszczyt / (Math.sqrt(3) * w.Un_V * o.cosfi * eta);
      prady.L1 += I;
      prady.L2 += I;
      prady.L3 += I;
    } else {
      const I = Pszczyt / (w.U0_V * o.cosfi * eta);
      prady[o.faza] += I;
    }
  }

  const S = Math.hypot(Ps, Q);
  const cosfi = S > 0 ? Ps / S : 1;
  const wartosciPradow = [prady.L1, prady.L2, prady.L3];
  const Imax = Math.max(...wartosciPradow);
  const Imin = Math.min(...wartosciPradow);
  const asymetria = Imax > 0 ? ((Imax - Imin) / Imax) * 100 : 0;

  // Prąd w N od asymetrii — wzór ze specyfikacji (suma wektorowa przy przesunięciu 120°).
  const { L1, L2, L3 } = prady;
  const podPierwiastkiem = Math.max(0, L1 * L1 + L2 * L2 + L3 * L3 - L1 * L2 - L2 * L3 - L3 * L1);
  const IN_asym = Math.sqrt(podPierwiastkiem);

  // 3. harmoniczna: w przewodzie N składowe wszystkich trzech faz sumują się
  // ARYTMETYCZNIE (są w fazie), a nie wektorowo — stąd współczynnik 3.
  const h3Udzial = w.udzialH3_pct / 100;
  const IN_h3 = 3 * h3Udzial * ((L1 + L2 + L3) / 3);
  const IN_calk = Math.hypot(IN_asym, IN_h3);

  const kroki: Krok[] = [
    {
      opis: "Moc szczytowa po współczynnikach jednoczesności",
      wzor: "Ps = Σ(Pn · kj)",
      podstawienie: `moc zainstalowana ${formatLiczba(Pi / 1000, 2)} kW → po kj`,
      wynik: `${formatLiczba(Ps / 1000, 2)} kW`,
    },
    {
      opis: "Moc pozorna i wypadkowy współczynnik mocy",
      wzor: "S = √(P² + Q²);  cosφ = P / S",
      podstawienie: `√(${formatLiczba(Ps / 1000, 2)}² + ${formatLiczba(Q / 1000, 2)}²) kVA`,
      wynik: `S = ${formatLiczba(S / 1000, 2)} kVA, cosφ = ${formatLiczba(cosfi, 3)}`,
    },
    {
      opis: "Prądy fazowe",
      wzor: "I₁f = P / (U₀ · cosφ · η);  I₃f = P / (√3 · U · cosφ · η)",
      podstawienie: `L1 / L2 / L3`,
      wynik: `${formatLiczba(L1, 2)} / ${formatLiczba(L2, 2)} / ${formatLiczba(L3, 2)} A`,
    },
    {
      opis: "Prąd w przewodzie neutralnym od asymetrii",
      wzor: "I_N = √(I_L1² + I_L2² + I_L3² − I_L1·I_L2 − I_L2·I_L3 − I_L3·I_L1)",
      podstawienie: `√(${formatLiczba(L1, 2)}² + ${formatLiczba(L2, 2)}² + ${formatLiczba(L3, 2)}² − ${formatLiczba(L1, 2)}·${formatLiczba(L2, 2)} − ${formatLiczba(L2, 2)}·${formatLiczba(L3, 2)} − ${formatLiczba(L3, 2)}·${formatLiczba(L1, 2)})`,
      wynik: `${formatLiczba(IN_asym, 2)} A`,
    },
  ];

  const zalozenia: string[] = [
    "Odbiory jednofazowe obciążają wskazaną fazę, trójfazowe — wszystkie trzy równo.",
    "Prądy sumowane arytmetycznie w obrębie fazy (pominięto różnice kątów fazowych między odbiorami).",
  ];

  if (w.udzialH3_pct > 0) {
    kroki.push({
      opis: "Składowa 3. harmonicznej w przewodzie neutralnym",
      wzor: "I_N(h3) = 3 · udział_h3 · I_śr",
      podstawienie: `3 · ${formatLiczba(h3Udzial, 3)} · ${formatLiczba((L1 + L2 + L3) / 3, 2)} A`,
      wynik: `${formatLiczba(IN_h3, 2)} A`,
    });
    kroki.push({
      opis: "Całkowity prąd w przewodzie neutralnym",
      wzor: "I_N = √(I_N(asymetria)² + I_N(h3)²)",
      podstawienie: `√(${formatLiczba(IN_asym, 2)}² + ${formatLiczba(IN_h3, 2)}²)`,
      wynik: `${formatLiczba(IN_calk, 2)} A`,
    });
    zalozenia.push(
      "3. harmoniczna jest składową ZEROWĄ — w przewodzie neutralnym trzy fazy sumują się arytmetycznie, zamiast się znosić. Dlatego przy dużym udziale odbiorów nieliniowych prąd w N potrafi przekroczyć prąd fazowy mimo symetrycznego obciążenia."
    );
  } else {
    zalozenia.push(
      "Przyjęto odbiory LINIOWE (udział 3. harmonicznej = 0). Przy zasilaczach impulsowych, oprawach LED i falownikach to założenie jest nieprawdziwe — podaj rzeczywisty udział h3, inaczej prąd w N będzie zaniżony."
    );
  }

  // Ostrzeżenie, gdy N jest obciążony bardziej niż faza — to jest ten przypadek,
  // dla którego przewód N nie może być cieńszy od fazowego.
  let ocena = null;
  if (IN_calk > Imax && Imax > 0) {
    ocena = {
      verdict: "niespelniony" as const,
      margines_pct: ((Imax - IN_calk) / Imax) * 100,
      komunikat: `Prąd w przewodzie neutralnym (${formatLiczba(IN_calk, 1)} A) PRZEKRACZA największy prąd fazowy (${formatLiczba(Imax, 1)} A). Przewód N musi mieć przekrój nie mniejszy niż fazowy, a obwodu nie wolno zabezpieczać w sposób pozostawiający N bez ochrony.`,
    };
  } else if (asymetria > 15) {
    ocena = {
      verdict: "graniczny" as const,
      margines_pct: null,
      komunikat: `Asymetria obciążenia wynosi ${formatLiczba(asymetria, 1)}% — rozłóż odbiory jednofazowe równiej między fazy. Duża asymetria obciąża przewód neutralny i podnosi straty.`,
    };
  } else {
    ocena = {
      verdict: "spelniony" as const,
      margines_pct: null,
      komunikat: `Asymetria ${formatLiczba(asymetria, 1)}%, prąd w N ${formatLiczba(IN_calk, 1)} A przy największym prądzie fazowym ${formatLiczba(Imax, 1)} A.`,
    };
  }

  return {
    wartosci: {
      Pi_W: Pi,
      Ps_W: Ps,
      Q_var: Q,
      S_VA: S,
      cosfi,
      prady,
      asymetria_pct: asymetria,
      IN_asymetria_A: IN_asym,
      IN_calkowity_A: IN_calk,
      Imax_faza_A: Imax,
    },
    kroki,
    ocena,
    zalozenia,
    zrodla: [
      { norma: "PN-HD 60364-5-52", czego: "obciążenie przewodu neutralnego, udział harmonicznych" },
      { norma: "N SEP-E-002", czego: "bilans mocy instalacji w budynkach mieszkalnych" },
    ],
    bledy: [],
  };
}
