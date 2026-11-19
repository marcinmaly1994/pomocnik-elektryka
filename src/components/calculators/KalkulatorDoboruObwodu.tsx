import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { WynikGlowny } from "./WynikGlowny";
import { useMemo } from "react";
import { Download } from "lucide-react";
import { KRYTERIUM_LABELS, pelnyDoborPrzekroju } from "@/lib/calc/fullSizing";
import type { MetodaOdniesienia3 } from "@/lib/norms/ampacity3";
import { CalcResultView, PasekWerdyktu } from "./CalcResultView";
import type { Izolacja, Material, RodzajObwoduCzasu } from "@/lib/norms/conductors";
import { formatLiczba } from "@/lib/calc/result";
import { calcPowerBalance } from "@/lib/electrical";
import { limitSpadkuPct, SECTIONS, type LayingMethod } from "@/lib/panel/norms";
import {
  sizeBreakerForSection,
  voltageDropPct,
  sizeCircuit,
  sizeFeeder,
  type CircuitKind,
} from "@/lib/panel/sizing";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { Card } from "./Card";
import {
  CIRCUIT_KIND_OPTIONS,
  COSPHI_EXAMPLES,
  IZOLACJA_OPTIONS,
  LAYING_METHOD_OPTIONS,
  MATERIAL_OPTIONS,
  METODA3_OPTIONS,
  PHASE_OPTIONS,
  RODZAJ_OBWODU_HINT,
  RODZAJ_OBWODU_OPTIONS,
  SECTION_OPTIONS,
  UKLAD_OPTIONS,
} from "./opcje";
import { KryteriaObwodu, PrzelacznikTrybu } from "./DoborObwodu";
import { ocenKryteria, podsumowanieObwodu, type OcenaKryterium } from "@/lib/calc/kryteriaObwodu";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { Button } from "@/components/ui/button";

/**
 * „Dobór obwodu" od `xl`: pola po lewej, wynik po prawej.
 *
 * Jedyny kalkulator, w którym wynik spadał pod krawędź ekranu — przy 1440×900 zaczynał
 * się na 874–901 px w trzech z czterech trybów (przełącznik trybu, ściąga cos φ i warunki
 * ułożenia stoją przed nim). W pozostałych osiemnastu wynik jest na pierwszym ekranie,
 * więc zostają w jednej kolumnie. Pola i wynik mają podobną wysokość, więc skutek zmiany
 * pola widać obok, bez przewijania w dół i z powrotem. Poniżej `xl` — bez zmian, wynik
 * pod polami.
 */
const UKLAD_POLA_WYNIK = "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] xl:items-start xl:gap-x-6";

/**
 * „Dobór obwodu” — cztery tryby (szukam przekroju, mam przekrój, pełny dobór, WLZ) i wspólna
 * stopka z czterema kryteriami. Jeden komponent, bo tryby dzielą wejścia (moc, faza, ułożenie)
 * i jedną ocenę kryteriów.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 * Tryb z adresu (`?tryb=`) i przekierowania starych adresów zostają w `CalculatorsTab`,
 * bo to nawigacja zakładki, nie obliczenie.
 */
export function KalkulatorDoboruObwodu({ label }: { label: string }) {
  const circuitKind = useCalculatorsStore((s) => s.circuitKind);
  const power = useCalculatorsStore((s) => s.power);
  const phase = useCalculatorsStore((s) => s.phase);
  const cosphi = useCalculatorsStore((s) => s.cosphi);
  const length = useCalculatorsStore((s) => s.length);
  const layingMethod = useCalculatorsStore((s) => s.layingMethod);
  const ambientC = useCalculatorsStore((s) => s.ambientC);
  const bundleCount = useCalculatorsStore((s) => s.bundleCount);
  const motorStart = useCalculatorsStore((s) => s.motorStart);
  const trybObwodu = useCalculatorsStore((s) => s.trybObwodu);
  const obwodZsOhm = useCalculatorsStore((s) => s.obwodZsOhm);
  const obwodIkA = useCalculatorsStore((s) => s.obwodIkA);
  const obwodCzasS = useCalculatorsStore((s) => s.obwodCzasS);
  const obwodI2tA2s = useCalculatorsStore((s) => s.obwodI2tA2s);
  const spadekWlzPct = useCalculatorsStore((s) => s.spadekWlzPct);
  const wlasnaStacja = useCalculatorsStore((s) => s.wlasnaStacja);
  const breakerSection = useCalculatorsStore((s) => s.breakerSection);
  const pdIb = useCalculatorsStore((s) => s.pdIb);
  const pdNapiecie = useCalculatorsStore((s) => s.pdNapiecie);
  const pdMaterial = useCalculatorsStore((s) => s.pdMaterial);
  const pdIzolacja = useCalculatorsStore((s) => s.pdIzolacja);
  const pdMetoda = useCalculatorsStore((s) => s.pdMetoda);
  const pdTemperatura = useCalculatorsStore((s) => s.pdTemperatura);
  const pdWiazka = useCalculatorsStore((s) => s.pdWiazka);
  const pdRozruch = useCalculatorsStore((s) => s.pdRozruch);
  const pdDlugosc = useCalculatorsStore((s) => s.pdDlugosc);
  const pdCosfi = useCalculatorsStore((s) => s.pdCosfi);
  const pdLimitSpadku = useCalculatorsStore((s) => s.pdLimitSpadku);
  const pdSprawdzOchrone = useCalculatorsStore((s) => s.pdSprawdzOchrone);
  const pdImpedancjaZrodla = useCalculatorsStore((s) => s.pdImpedancjaZrodla);
  const pdUklad = useCalculatorsStore((s) => s.pdUklad);
  const pdRodzajObwodu = useCalculatorsStore((s) => s.pdRodzajObwodu);
  const pdSprawdzZwarcie = useCalculatorsStore((s) => s.pdSprawdzZwarcie);
  const pdIk = useCalculatorsStore((s) => s.pdIk);
  const wlzCurrentA = useCalculatorsStore((s) => s.wlzCurrentA);
  const wlzPhase = useCalculatorsStore((s) => s.wlzPhase);
  const wlzLength = useCalculatorsStore((s) => s.wlzLength);
  const wlzLayingMethod = useCalculatorsStore((s) => s.wlzLayingMethod);
  const wlzAmbientC = useCalculatorsStore((s) => s.wlzAmbientC);
  const wlzBundleCount = useCalculatorsStore((s) => s.wlzBundleCount);
  const wlzDropLimit = useCalculatorsStore((s) => s.wlzDropLimit);
  const patch = useCalculatorsStore((s) => s.patch);
  // Odbiorniki bilansu mocy — do „Wczytaj z bilansu mocy” w trybie WLZ; sam kalkulator
  // bilansu (`KalkulatorBilansuMocy`) czyta je i liczy osobno.
  const devices = useCalculatorsStore((s) => s.devices);
  const ks = useCalculatorsStore((s) => s.ks);
  const ksCosfi = useCalculatorsStore((s) => s.ksCosfi);
  const balance = useMemo(() => calcPowerBalance(devices, ks, ksCosfi), [devices, ks, ksCosfi]);
  const setCircuitKind = (v: CircuitKind) => patch({ circuitKind: v });
  const setPower = (v: number) => patch({ power: v });
  const setPhase = (v: "1" | "3") => patch({ phase: v });
  const setCosphi = (v: number) => patch({ cosphi: v });
  const setLength = (v: number) => patch({ length: v });
  const setLayingMethod = (v: LayingMethod) => patch({ layingMethod: v });
  const setAmbientC = (v: number) => patch({ ambientC: v });
  const setBundleCount = (v: number) => patch({ bundleCount: v });
  const setMotorStart = (v: boolean) => patch({ motorStart: v });
  const setObwodZsOhm = (v: number) => patch({ obwodZsOhm: v });
  const setObwodIkA = (v: number) => patch({ obwodIkA: v });
  const setObwodCzasS = (v: number) => patch({ obwodCzasS: v });
  const setObwodI2tA2s = (v: number) => patch({ obwodI2tA2s: v });
  const setSpadekWlzPct = (v: number) => patch({ spadekWlzPct: v });
  const setWlasnaStacja = (v: boolean) => patch({ wlasnaStacja: v });
  const setBreakerSection = (v: number) => patch({ breakerSection: v });
  const setWlzCurrentA = (v: number) => patch({ wlzCurrentA: v });
  const setWlzPhase = (v: "1" | "3") => patch({ wlzPhase: v });
  const setWlzLength = (v: number) => patch({ wlzLength: v });
  const setWlzLayingMethod = (v: LayingMethod) => patch({ wlzLayingMethod: v });
  const setWlzAmbientC = (v: number) => patch({ wlzAmbientC: v });
  const setWlzBundleCount = (v: number) => patch({ wlzBundleCount: v });
  const setWlzDropLimit = (v: number) => patch({ wlzDropLimit: v });

  // --- 1. dobór przewodu, zabezpieczenia i spadku napięcia ---
  // Ten sam silnik (`sizeCircuit`), co automatyczny dobór w zakładce Rozdzielnica
  // (`lib/panel/project.ts`) — jedno źródło prawdy, więc obie zakładki nigdy nie
  // podadzą różnego wyniku dla tych samych danych wejściowych.
  const sized = useMemo(
    () =>
      sizeCircuit({
        id: "kalkulator",
        nazwa: "Obwód",
        typ: circuitKind,
        moc_W: power,
        liczba_faz: phase,
        cos_phi: cosphi,
        dlugosc_m: length > 0 ? length : undefined,
        sposob_ulozenia: layingMethod,
        temperatura_otoczenia_C: ambientC,
        obwodow_w_wiazce: bundleCount,
        rozruch_silnikowy: motorStart,
        spadek_wlz_pct: spadekWlzPct,
        wlasna_stacja: wlasnaStacja,
      }),
    [circuitKind, power, phase, cosphi, length, layingMethod, ambientC, bundleCount, motorStart, spadekWlzPct, wlasnaStacja]
  );

  /**
   * Ten sam dobór (`sized`) policzony dla KAŻDEGO sposobu ułożenia — do tabelki
   * porównawczej pod wynikiem.
   *
   * Sposób ułożenia był polem formularza od dawna, ale jego wpływ pozostawał
   * niewidoczny: użytkownik przestawiał listę i albo wynik się nie zmieniał, albo
   * zmieniał się bez wyjaśnienia. Tymczasem to jeden z najmocniej działających
   * parametrów — ta sama żyła 2,5 mm² uniesie 27 A natynkowo i tylko 19,5 A
   * w ścianie ocieplonej (tabl. B.52.4), czyli różnicę większą niż niejeden stopień
   * przekroju. Pokazanie wszystkich czterech wariantów naraz robi z tego pola
   * świadomy wybór zamiast ustawienia, które się pomija.
   */
  const layingComparison = useMemo(
    () =>
      LAYING_METHOD_OPTIONS.map((opt) => {
        const r = sizeCircuit({
          id: "porownanie",
          nazwa: "Obwód",
          typ: circuitKind,
          moc_W: power,
          liczba_faz: phase,
          cos_phi: cosphi,
          dlugosc_m: length > 0 ? length : undefined,
          sposob_ulozenia: opt.value,
          temperatura_otoczenia_C: ambientC,
          obwodow_w_wiazce: bundleCount,
          rozruch_silnikowy: motorStart,
        });
        return { ...opt, przekroj: r.przekroj_mm2, Iz: r.Iz_A };
      }),
    [circuitKind, power, phase, cosphi, length, ambientC, bundleCount, motorStart]
  );

  // --- 3. dobór zabezpieczenia do ZNANEGO przekroju ---
  // Odwrotna strona `sizeCircuit`: przekrój jest wejściem, aparat wyjściem.
  // Jednostkowy test w `sizing.test.ts` pilnuje, że dla tych samych danych oba
  // dobory podają TEN SAM aparat — inaczej dwa kalkulatory przeczyłyby sobie.
  const sizedBreaker = useMemo(
    () =>
      sizeBreakerForSection({
        prad_A: sized.Ib_A ?? 0,
        liczba_faz: phase,
        przekroj_mm2: breakerSection as (typeof SECTIONS)[number],
        sposob_ulozenia: layingMethod,
        temperatura_otoczenia_C: ambientC,
        obwodow_w_wiazce: bundleCount,
        rozruch_silnikowy: motorStart,
        typ: circuitKind,
      }),
    [sized.Ib_A, phase, breakerSection, layingMethod, ambientC, bundleCount, motorStart, circuitKind]
  );

  // --- kalkulatory uzupełniające ---
  // --- pełny dobór (4 kryteria) ---
  const pelnyDobor = useMemo(
    () =>
      pelnyDoborPrzekroju({
        Ib_A: pdIb,
        napiecie_V: pdNapiecie,
        material: pdMaterial,
        izolacja: pdIzolacja,
        metoda: pdMetoda,
        temperatura_otoczenia_C: pdTemperatura,
        obwodow_w_wiazce: pdWiazka,
        rozruch_silnikowy: pdRozruch,
        dlugosc_m: pdDlugosc,
        cosfi: pdCosfi,
        limitSpadku_pct: pdLimitSpadku,
        impedancjaZrodla_ohm: pdSprawdzOchrone ? pdImpedancjaZrodla : undefined,
        uklad: pdUklad,
        rodzajObwodu: pdRodzajObwodu,
        Ik_A: pdSprawdzZwarcie ? pdIk : undefined,
      }),
    [
      pdIb,
      pdNapiecie,
      pdMaterial,
      pdIzolacja,
      pdMetoda,
      pdTemperatura,
      pdWiazka,
      pdRozruch,
      pdDlugosc,
      pdCosfi,
      pdLimitSpadku,
      pdSprawdzOchrone,
      pdImpedancjaZrodla,
      pdUklad,
      pdRodzajObwodu,
      pdSprawdzZwarcie,
      pdIk,
    ]
  );

  // Ta zakładka NIE czyta projektowanej instalacji — świadomie. Kalkulatory (tak samo
  // jak Protokoły pomiarowe) są narzędziem OBOK przepływu 1→2→3→4, a nie jego krokiem:
  // elektryk liczy tu przekrój dla roboty, która z otwartym rzutem nie ma nic wspólnego.
  // Były tu trzy zejścia do `useProjectStore` — „Wczytaj z projektu" w bilansie mocy
  // i „Wczytaj obwód z projektu" w doborze przekroju oraz w pętli zwarcia — usunięte,
  // bo zamieniały samodzielne narzędzie w akcesorium aktualnie rysowanego budynku.
  // Jedyne wczytanie, jakie tu zostaje, biegnie MIĘDZY kalkulatorami („Wczytaj
  // z bilansu mocy" w WLZ) i nie wyprowadza zakładki poza jej własne dane.

  // --- 4. WLZ (linia zasilająca) ---
  const sizedFeeder = useMemo(
    () =>
      sizeFeeder({
        prad_A: wlzCurrentA,
        liczba_faz: wlzPhase,
        dlugosc_m: wlzLength > 0 ? wlzLength : undefined,
        sposob_ulozenia: wlzLayingMethod,
        temperatura_otoczenia_C: wlzAmbientC,
        obwodow_w_wiazce: wlzBundleCount,
        limit_spadku_pct: wlzDropLimit,
      }),
    [wlzCurrentA, wlzPhase, wlzLength, wlzLayingMethod, wlzAmbientC, wlzBundleCount, wlzDropLimit]
  );

  function loadWlzCurrentFromBalance() {
    setWlzCurrentA(Math.round((wlzPhase === "3" ? balance.demandCurrent3 : balance.demandCurrent1) * 10) / 10);
  }

  /**
   * Cztery kryteria dla AKTYWNEGO trybu — wspolna stopka scalonego kalkulatora.
   *
   * Tryby przekroj/zabezpieczenie/WLZ jada tym samym silnikiem (`lib/panel/sizing.ts`),
   * wiec ocena idzie po jego wyniku. Tryb „pelny dobor" ma wlasny silnik z szersza
   * dziedzina (Al, XLPE, kabel w gruncie) i liczy kryteria sam — tu tylko
   * przepisujemy jego werdykt na te sama liste, zeby uzytkownik widzial ZAWSZE
   * te same cztery pozycje, niezaleznie od trybu.
   */
  const kryteriaObwodu = useMemo<OcenaKryterium[]>(() => {
    const dodatkowe = {
      Zs_Ohm: obwodZsOhm > 0 ? obwodZsOhm : undefined,
      Ik_A: obwodIkA > 0 ? obwodIkA : undefined,
      czas_s: obwodCzasS > 0 ? obwodCzasS : undefined,
      I2t_A2s: obwodI2tA2s > 0 ? obwodI2tA2s : undefined,
      material: "Cu" as const,
      izolacja: "PVC" as const,
    };
    if (trybObwodu === "pelny") {
      const w = pelnyDobor.wartosci;
      if (!w) return ocenKryteria({ ...dodatkowe, Ib_A: null, In_A: null, Iz_A: null, spadek_pct: null, spadek_limit_pct: 5, Zs_max_Ohm: null, przekroj_mm2: null });
      return (Object.keys(KRYTERIUM_LABELS) as (keyof typeof KRYTERIUM_LABELS)[]).map((k) => {
        const kr = w.kryteria[k];
        return {
          kryterium: k,
          etykieta: KRYTERIUM_LABELS[k],
          // Kryterium OCENIONE jest w tym trybie zawsze spelnione — silnik bierze
          // najwiekszy z wymaganych przekrojow, wiec wynik z definicji przechodzi
          // kazde ze sprawdzonych kryteriow. Ryzykiem jest tu tylko kryterium
          // POMINIETE, i to widac po stanie „nieoceniono".
          stan: kr.ocenione ? ("ok" as const) : ("nieoceniono" as const),
          opis: kr.ocenione
            ? `wymaga min. ${formatLiczba(kr.minPrzekroj_mm2 ?? 0, 2)} mm² — dobrano ${formatLiczba(w.przekroj_mm2, 1)} mm²`
            : (kr.powod_pominiecia ?? "Brak danych do oceny."),
          // Zapas liczony w przekroju: ile brakuje wymaganej zyle do dobranej.
          // Bez tego pasek werdyktu nie mial w tym trybie czego pokazac.
          margines_pct:
            kr.ocenione && kr.minPrzekroj_mm2 !== null && w.przekroj_mm2 > 0
              ? (1 - kr.minPrzekroj_mm2 / w.przekroj_mm2) * 100
              : undefined,
        };
      });
    }
    if (trybObwodu === "zabezpieczenie") {
      // Dobor do znanego przekroju nie liczy spadku (przekroj jest dana, nie wynikiem),
      // ale wszystkie skladniki sa pod reka — liczymy go tym samym wzorem co reszta.
      const drop = length > 0 && sized.Ib_A ? voltageDropPct(length, sized.Ib_A, breakerSection, phase) : null;
      return ocenKryteria({
        ...dodatkowe,
        Ib_A: sized.Ib_A,
        In_A: sizedBreaker.aparat?.In_A ?? null,
        Iz_A: sizedBreaker.Iz_A,
        spadek_pct: drop,
        spadek_limit_pct: limitSpadkuPct(circuitKind === "oswietlenie", wlasnaStacja),
        Zs_max_Ohm: sizedBreaker.Zs_max_Ohm,
        Ia_A: sizedBreaker.Ia_A,
        przekroj_mm2: breakerSection,
      });
    }
    if (trybObwodu === "wlz") {
      return ocenKryteria({
        ...dodatkowe,
        Ib_A: wlzCurrentA,
        In_A: sizedFeeder.aparat?.In_A ?? null,
        Iz_A: sizedFeeder.Iz_A,
        spadek_pct: sizedFeeder.spadek_napiecia_pct,
        spadek_limit_pct: sizedFeeder.spadek_napiecia_limit_pct,
        // WLZ nie dobiera aparatu pod warunek zwarciowy — to zadanie obwodow za
        // rozdzielnica, wiec kryterium zostaje nieocenione zamiast udawac wynik.
        Zs_max_Ohm: null,
        przekroj_mm2: sizedFeeder.przekroj_mm2,
      });
    }
    return ocenKryteria({
      ...dodatkowe,
      Ib_A: sized.Ib_A,
      In_A: sized.aparat?.In_A ?? null,
      Iz_A: sized.Iz_A,
      spadek_pct: sized.spadek_calkowity_pct,
      spadek_limit_pct: sized.spadek_napiecia_limit_pct,
      Zs_max_Ohm: sized.Zs_max_Ohm,
      Ia_A: sized.Ia_A,
      przekroj_mm2: sized.przekroj_mm2,
    });
  }, [trybObwodu, sized, sizedBreaker, sizedFeeder, pelnyDobor, breakerSection, length, phase, circuitKind, wlasnaStacja, wlzCurrentA, obwodZsOhm, obwodIkA, obwodCzasS, obwodI2tA2s]);

  return (
    <>
      {/* Przelacznik trybu STOI NAD karta trybu, a nie w niej: to wybor pytania,
          nie jedno z pol formularza. Cztery dawne kalkulatory (przekroj,
          zabezpieczenie, WLZ, pelny dobor) pytaly o to samo z czterech stron. */}
      <div className="pe-card mb-4 p-4">
        <PrzelacznikTrybu tryb={trybObwodu} onZmien={(t) => patch({ trybObwodu: t })} />
      </div>
      {trybObwodu === "przekroj" && (
        <Card title={label} tag="przekrój żyły">
          <div className={UKLAD_POLA_WYNIK}>
            <div className="min-w-0">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field
                  label="Moc odbiornika"
                  value={power}
                  onChange={(v) => setPower(Number(v))}
                  unit="W"
                />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik cos φ"
                  value={cosphi}
                  onChange={(v) => setCosphi(Number(v))}
                  step="0.05"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej albo karty katalogowej. Nie znasz wartości? Rozwiń podpowiedź „Nie znasz cos φ?” poniżej."
                />
              </div>

              {/* Ściąga cos φ — patrz `COSPHI_EXAMPLES`. Wiersze są KLIKALNE i wpisują
                  wartość do pola wyżej: to jedyne pole formularza, którego laik nie ma
                  skąd wziąć, a przepisywanie liczby ręcznie z tabelki obok pola byłoby
                  krokiem bez powodu. Aktywny wiersz jest podświetlony, żeby było widać,
                  która wartość siedzi w formularzu. */}
              <details className="mb-3 rounded-lg border border-border bg-white/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600 hover:text-copper">
                  Nie znasz cos φ? Zobacz orientacyjne wartości dla typowych odbiorników
                </summary>
                <div className="border-t border-border px-1.5 py-1.5">
                  {COSPHI_EXAMPLES.map((e) => {
                    const on = Math.abs(cosphi - e.cos) < 0.001;
                    return (
                      <button
                        key={e.cos}
                        type="button"
                        onClick={() => setCosphi(e.cos)}
                        title={`Wpisz cos φ = ${String(e.cos).replace(".", ",")}`}
                        className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left ${on ? "bg-blueprint-tlo" : "hover:bg-slate-50"}`}
                      >
                        <span
                          className="pe-mono shrink-0 text-xs font-semibold"
                          style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                        >
                          {e.cos.toFixed(2).replace(".", ",")}
                        </span>
                        <span className="text-xs leading-snug text-slate-600">{e.odbiorniki}</span>
                      </button>
                    );
                  })}
                  <div className="px-2 pb-1 pt-1.5 text-xs leading-relaxed text-slate-500">
                    Wartości orientacyjne, dla pracy przy pełnym obciążeniu — jeśli tabliczka znamionowa albo karta
                    katalogowa podaje cos φ, wpisz TĘ wartość. Silnik obciążony częściowo ma cos φ wyraźnie niższy niż
                    znamionowy (nawet 0,3–0,5 na biegu jałowym), więc dla odbiorników silnikowych pracujących z zapasem
                    mocy przyjmij wartość niższą od podanej tutaj.
                  </div>
                </div>
              </details>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Długość trasy (w jedną stronę)"
                  value={length}
                  onChange={(v) => setLength(Number(v))}
                  unit="m"
                />
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field
                  label="Temperatura otoczenia"
                  value={ambientC}
                  onChange={(v) => setAmbientC(Number(v))}
                  unit="°C"
                />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                  hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy. Więcej przewodów obok siebie gorzej oddaje ciepło, więc obniża dopuszczalną obciążalność każdego z nich."
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={motorStart}
                  onChange={(e) => setMotorStart(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
              </label>

              {/* Budżet spadku napięcia dotyczy CAŁEJ drogi od złącza. Te dwa pola
                  domykają rachunek: pierwsze odejmuje to, co zjadła już WLZ, drugie
                  podnosi limit tam, gdzie transformator stoi na terenie obiektu. */}
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field
                  label="Spadek napięcia na WLZ"
                  value={spadekWlzPct}
                  onChange={(v) => setSpadekWlzPct(Number(v))}
                  unit="%"
                  step="0.1"
                  hint="Ile z budżetu spadku zużywa już odcinek od złącza do rozdzielnicy. Typowo 0,5-1%. Limit 3/5% liczy się od ZŁĄCZA, więc obwód odbiorczy ma do dyspozycji resztę — zostaw 0, jeśli liczysz sam obwód."
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={wlasnaStacja}
                  onChange={(e) => setWlasnaStacja(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Zasilanie z własnej stacji transformatorowej — limit spadku 6% oświetlenie / 8% pozostałe (zamiast 3% / 5%)
              </label>

            </div>
            <div className="min-w-0" data-testid="wynik-obok">
              <WynikGlowny
                data-testid="wynik-doboru"
                wartosci={
                  sized.przekroj_mm2
                    ? [
                        { etykieta: "Przekrój żyły", wartosc: String(sized.przekroj_mm2).replace(".", ","), jednostka: "mm²" },
                        ...(sized.aparat
                          ? [
                              {
                                etykieta: "Wyłącznik nadprądowy",
                                wartosc: (
                                  <>
                                    {sized.aparat.charakterystyka}
                                    {sized.aparat.In_A} {sized.aparat.bieguny}
                                  </>
                                ),
                              },
                            ]
                          : []),
                      ]
                    : []
                }
              >
                {sized.przekroj_mm2 ? (
                  <>
                    {/* Dwa wyniki na równi: przekrój i aparat. Dotąd karta pokazywała sam
                        przekrój, a wyłącznik — połowę wyniku tego kalkulatora — trzeba było
                        wyczytać z kryteriów („In 20 A"), bez charakterystyki i biegunów
                        (audyt 2026-11-04, B11). */}
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="info"  title="Typ wyłącznika różnicowoprądowego wymagany dla tego odbiornika">
                        {circuitKind === "gniazda" ? "RCD 30 mA " : "RCD "}typ {sized.rcd_typ}
                      </Badge>
                      {sized.Zs_max_Ohm !== null && (
                        <Badge variant="success">Zs max {formatLiczba(sized.Zs_max_Ohm, 2)} Ω</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      <Badge variant="accent">{sized.kabel}</Badge>
                      <Badge variant="info">Ib {formatLiczba((sized.Ib_A ?? 0), 2)} A</Badge>
                      <Badge variant="success">obc. dop. {sized.Iz_A} A</Badge>
                      {sized.spadek_napiecia_pct !== null && (
                        // Z podanym spadkiem na WLZ pokazujemy SUMĘ — bo to ona jest
                        // porównywana z limitem — i rozbicie, żeby było widać, skąd wyszła.
                        <Badge>
                          {sized.spadek_wlz_pct > 0
                            ? `ΔU ${formatLiczba(sized.spadek_calkowity_pct, 2)}% = WLZ ${formatLiczba(sized.spadek_wlz_pct, 2)}% + obwód ${formatLiczba(sized.spadek_napiecia_pct, 2)}% (limit ${sized.spadek_napiecia_limit_pct}%)`
                            : `ΔU ${formatLiczba(sized.spadek_napiecia_pct, 2)}% (limit ${sized.spadek_napiecia_limit_pct}%)`}
                        </Badge>
                      )}
                    </div>
                  </>
                ) : (
                  <Alert variant="danger" role="note">
                    nie udało się dobrać — zobacz komunikat niżej
                  </Alert>
                )}
              </WynikGlowny>

              {/* Wpływ sposobu ułożenia — patrz `layingComparison`. Tabelka stoi POD
                  wynikiem, bo to uzasadnienie wybranej liczby, a nie kolejne pole do
                  wypełnienia. Aktualnie wybrany wariant jest podświetlony, a każdy
                  wiersz klikalny — porównanie ma prowadzić do zmiany założenia jednym
                  kliknięciem, nie do wracania w górę formularza. */}
              <div className="mt-3 rounded-lg border border-border bg-white/60">
                <div className="border-b border-border px-3 py-2 text-xs font-semibold text-slate-600">
                  Jak sposób ułożenia zmienia wynik
                </div>
                <div className="px-1.5 py-1.5">
                  {layingComparison.map((row) => {
                    const on = row.value === layingMethod;
                    return (
                      <button
                        key={row.value}
                        type="button"
                        onClick={() => setLayingMethod(row.value)}
                        title={`Przyjmij ułożenie: ${row.label}`}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${on ? "bg-blueprint-tlo" : "hover:bg-slate-50"}`}
                      >
                        <span
                          className="min-w-0 flex-1 truncate text-xs"
                          style={on ? { color: "#2D5A8C", fontWeight: 600 } : { color: "#4F5D73" }}
                        >
                          {row.label}
                        </span>
                        <span className="pe-mono shrink-0 text-xs text-slate-500">
                          {row.Iz !== null ? `${formatLiczba(row.Iz, row.Iz % 1 === 0 ? 0 : 1)} A` : "—"}
                        </span>
                        <span
                          className="pe-mono w-16 shrink-0 text-right text-xs font-semibold"
                          style={{ color: on ? "#2D5A8C" : "#8A5526" }}
                        >
                          {row.przekroj !== null ? `${String(row.przekroj).replace(".", ",")} mm²` : "—"}
                        </span>
                      </button>
                    );
                  })}
                  <div className="px-2 pb-1 pt-1.5 text-xs leading-relaxed text-slate-500">
                    Kolumny: obciążalność po współczynnikach i wynikający z niej przekrój. Ciepło musi mieć dokąd uciec —
                    przewód natynkowy chłodzi się powietrzem, a ten w ścianie ocieplonej termicznie praktycznie nie oddaje
                    ciepła, więc uniesie najmniej. Pomylenie tych dwóch przypadków to najczęstszy sposób na przegrzanie
                    przewodu w domu energooszczędnym.
                  </div>
                </div>
              </div>

              {sized.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {/* role="note": lista odświeża się przy każdym wpisanym znaku — role="alert" czytałby KAŻDĄ pozycję przerywając czytnik */}
                  {sized.ostrzezenia.map((w, i) => (
                    <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                      {w.message}
                    </Alert>
                  ))}
                </div>
              )}
            </div>
          </div>

          <HowItWorks
            formulas={[
              { label: "Prąd obliczeniowy — obwód 1-fazowy", eq: "Ib = P / (U × cos φ)", where: "P — moc czynna [W], U = 230 V, cos φ — współczynnik mocy" },
              { label: "Prąd obliczeniowy — obwód 3-fazowy", eq: "Ib = P / (√3 × U × cos φ)", where: "U = 400 V (napięcie międzyfazowe)" },
              { label: "Obciążalność po korekcie", eq: "Iz = Iz₀ × k1 × k2", where: "Iz₀ — obciążalność z tablicy dla METODY ODNIESIENIA wynikającej ze sposobu ułożenia, k1 — wsp. temperatury otoczenia, k2 — wsp. grupowania" },
              { label: "Metoda odniesienia wg sposobu ułożenia", eq: "pod tynkiem → B2, w rurce → B1, natynkowo → C, ściana ocieplona → A1", where: "każda metoda ma własny wiersz w tablicy obciążalności (PN-HD 60364-5-52 tabl. B.52.4)" },
              { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m — rezystywność miedzi przy 70°C (żyła nagrzana prądem roboczym, nie 20°C)" },
            ]}
            notes={[
              "Kalkulator szuka NAJMNIEJSZEGO przekroju, który jednocześnie spełnia obciążalność (Ib ≤ In ≤ Iz) i limit spadku napięcia — 3% dla obwodów oświetleniowych, 5% dla pozostałych. To ten sam silnik doboru, który automatycznie liczy zakładka „Rozdzielnica” dla obwodów narysowanych na planie, więc oba miejsca zawsze dają ten sam wynik dla tych samych danych.",
              "Sposób ułożenia decyduje o tym, ile ciepła przewód może oddać, a więc wprost o obciążalności: ta sama żyła 2,5 mm² uniesie 27 A natynkowo i tylko 19,5 A w ścianie ocieplonej termicznie. Tabelka pod wynikiem pokazuje wszystkie cztery warianty naraz — jeśli nie masz pewności, którym pójdzie trasa, przyjmij ostrzejszy.",
              "Przekrój bywa podnoszony ponad wynikający z samej obciążalności — decyduje wtedy spadek napięcia na długiej trasie. Kalkulator mówi o tym wprost w ostrzeżeniu.",
              "Bez podanej długości trasy (albo przy długości = 0) spadek napięcia NIE jest sprawdzany — dobór pokrywa wtedy wyłącznie obciążalność.",
              "Wyłącznik i typ RCD stoją w wyniku obok przekroju. Gdy przekrój jest już przesądzony (przewód leży w ścianie), przełącz na tryb „Mam przekrój” — dobierze sam wyłącznik z warunkiem Ib ≤ In ≤ Iz.",
              "Wynik jest orientacyjny/edukacyjny — dobór do realizacji i odbioru wykonuje osoba z uprawnieniami, z uwzględnieniem rzeczywistej trasy kabla i warunków otoczenia.",
            ]}
          />
        </Card>
      )}

      {trybObwodu === "zabezpieczenie" && (
        <Card title={label} tag="wyłącznik nadprądowy">
          <div className={UKLAD_POLA_WYNIK}>
            <div className="min-w-0">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Przekrój jest tu <strong>daną wejściową</strong> — dobierasz wyłącznik do przewodu, który już leży albo
                został narzucony projektem. Jeśli dopiero szukasz przekroju, przełącz na tryb „Szukam przekroju”;
                oba tryby dzielą te same pola, więc nic nie trzeba przepisywać.
              </Alert>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Rodzaj obwodu"
                  value={circuitKind}
                  onChange={(v) => setCircuitKind(v as CircuitKind)}
                  options={CIRCUIT_KIND_OPTIONS}
                />
                <Field
                  label="Przekrój żyły przewodu"
                  value={String(breakerSection)}
                  onChange={(v) => setBreakerSection(Number(v))}
                  options={SECTION_OPTIONS}
                />
                <Field
                  label="Moc odbiornika"
                  value={power}
                  onChange={(v) => setPower(Number(v))}
                  unit="W"
                />
                <Field
                  label="Zasilanie"
                  value={phase}
                  onChange={(v) => setPhase(v as "1" | "3")}
                  options={PHASE_OPTIONS}
                />
                <Field
                  label="Współczynnik cos φ"
                  value={cosphi}
                  onChange={(v) => setCosphi(Number(v))}
                  step="0.05"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
                />
              </div>

              <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Warunki ułożenia (decydują o obciążalności)</div>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Sposób ułożenia"
                  value={layingMethod}
                  onChange={(v) => setLayingMethod(v as LayingMethod)}
                  options={LAYING_METHOD_OPTIONS}
                />
                <Field
                  label="Temperatura otoczenia"
                  value={ambientC}
                  onChange={(v) => setAmbientC(Number(v))}
                  unit="°C"
                />
                <Field
                  label="Obwodów we wspólnej trasie"
                  value={bundleCount}
                  onChange={(v) => setBundleCount(Number(v))}
                  step="1"
                  hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy — więcej obok siebie obniża obciążalność każdego z nich."
                />
              </div>
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={motorStart}
                  onChange={(e) => setMotorStart(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Odbiornik z rozruchem silnikowym (pompa, lodówka, klimatyzacja) — charakterystyka C
              </label>

            </div>
            <div className="min-w-0" data-testid="wynik-obok">
              <WynikGlowny
                wartosci={
                  sizedBreaker.aparat
                    ? [
                        {
                          etykieta: "Dobrany wyłącznik nadprądowy",
                          wartosc: (
                            <>
                              {sizedBreaker.aparat.charakterystyka}
                              {sizedBreaker.aparat.In_A} {sizedBreaker.aparat.bieguny}
                            </>
                          ),
                        },
                      ]
                    : []
                }
              >
                {sizedBreaker.aparat ? (
                  <>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="info">Ib {formatLiczba(sizedBreaker.Ib_A, 2)} A</Badge>
                      <Badge variant="success">Iz {sizedBreaker.Iz_A} A</Badge>
                      <Badge>
                        metoda {sizedBreaker.metoda_odniesienia} · k1 {sizedBreaker.wspolczynniki.k1_temperatura} · k2{" "}
                        {sizedBreaker.wspolczynniki.k2_grupowanie}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <Alert variant="danger" role="note" title="Dobrany wyłącznik nadprądowy">
                    nie udało się dobrać — zobacz komunikat niżej
                  </Alert>
                )}
              </WynikGlowny>

              {/* Warunek Ib ≤ In ≤ Iz rozpisany na trzy liczby obok siebie: to JEDYNY
                  warunek doboru zabezpieczenia i cały sens tego kalkulatora, więc ma
                  być widoczny wprost, a nie do odtworzenia z chipów wyżej. */}
              {sizedBreaker.aparat && (
                <Alert variant="success" role="note" className="mt-2 items-start">
                  <div>
                    Warunek doboru spełniony:{" "}
                    <strong className="pe-mono">
                      {formatLiczba(sizedBreaker.Ib_A, 2)} A ≤ {sizedBreaker.aparat.In_A} A ≤ {sizedBreaker.Iz_A} A
                    </strong>{" "}
                    (Ib ≤ In ≤ Iz) — wyłącznik zadziała, zanim przewód się przegrzeje.
                  </div>
                </Alert>
              )}

              {sizedBreaker.Ia_A !== null && sizedBreaker.Zs_max_Ohm !== null && (
                <WynikGlowny
                  drugorzedny
                  wartosci={[
                    { etykieta: "Prąd zadziałania Ia", wartosc: formatLiczba(sizedBreaker.Ia_A, 0), jednostka: "A" },
                    { etykieta: "Wymagana Zs max", wartosc: formatLiczba(sizedBreaker.Zs_max_Ohm, 2), jednostka: "Ω", ton: "akcent" },
                  ]}
                />
              )}

              {sizedBreaker.ostrzezenia.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {sizedBreaker.ostrzezenia.map((w, i) => (
                    <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                      {w.message}
                    </Alert>
                  ))}
                </div>
              )}
            </div>
          </div>

          <HowItWorks
            formulas={[
              {
                label: "Warunek doboru zabezpieczenia",
                eq: "Ib ≤ In ≤ Iz",
                where: "Ib — prąd obliczeniowy, In — prąd znamionowy wyłącznika, Iz — obciążalność przewodu po współczynnikach",
              },
              {
                label: "Obciążalność przewodu po korekcie",
                eq: "Iz = Iz₀ × k1 × k2",
                where: "Iz₀ z tablicy dla metody odniesienia wynikającej ze sposobu ułożenia — to dlatego warunki ułożenia są tu polem obowiązkowym, mimo że przekrój jest już znany",
              },
              {
                label: "Prąd zadziałania wyzwalacza magnetycznego",
                eq: "Ia = k × In",
                where: "k = 5 dla charakterystyki B, 10 dla C, 20 dla D",
              },
              {
                label: "Wymaganie na pętlę zwarcia",
                eq: "Zs max = U₀ / Ia",
                where: "U₀ = 230 V — zmierzona Zs nie może przekroczyć tej wartości (patrz kalkulator „Impedancja pętli zwarcia”)",
              },
            ]}
            notes={[
              "Wyłącznik chroni PRZEWÓD, nie odbiornik — dlatego górną granicą jest obciążalność przewodu (Iz), a nie moc urządzenia. Zabezpieczenie dobrane „pod odbiornik”, bez sprawdzenia Iz, to klasyczny sposób na przegrzanie instalacji.",
              "Obwód wymiarowany jest pod docelową obsadę, nie tylko pod dzisiejszą moc — obwód gniazd dostaje typowo B16, a oświetlenia B10, nawet jeśli chwilowy pobór jest dużo niższy. Kalkulator schodzi poniżej tej wartości tylko wtedy, gdy obciążalność przewodu na to nie pozwala, i mówi o tym wprost.",
              "Charakterystyka C (zamiast B) dla odbiorników z rozruchem silnikowym zapobiega wyłączaniu przy prądzie rozruchowym — ale podnosi Ia dwukrotnie, więc ZAOSTRZA wymaganie na impedancję pętli zwarcia.",
              "Warunek Ib ≤ In ≤ Iz to dopiero połowa ochrony: drugą jest samoczynne wyłączenie w wymaganym czasie, czyli warunek na Zs. Sprawdź go w kalkulatorze „Impedancja pętli zwarcia”, wpisując pokazaną tu Zs max.",
              "Ten sam silnik doboru co „Dobór obwodu” i zakładka Rozdzielnica — dla tych samych danych wszystkie trzy miejsca podadzą ten sam aparat.",
            ]}
          />
        </Card>
      )}

      {trybObwodu === "pelny" && (
        <Card title={label} tag="4 kryteria naraz">
          <div className={UKLAD_POLA_WYNIK}>
            <div className="min-w-0">
              <Alert variant="info" role="note" className="mb-3 text-xs">
                Cztery kryteria liczone NIEZALEŻNIE — obciążalność, spadek napięcia i (opcjonalnie) ochrona
                przeciwporażeniowa oraz wytrzymałość zwarciowa. Wynikowy przekrój to <strong>maksimum</strong> z nich, nie
                pierwszy z brzegu. Tylko obwody <strong>3-fazowe</strong> — tablica dla dwóch żył obciążonych (1-fazowe)
                nie została jeszcze dostarczona.
              </Alert>

              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field
                  label="Prąd obliczeniowy Ib"
                  value={pdIb}
                  onChange={(v) => patch({ pdIb: Number(v) })}
                  unit="A"
                  hint="Prąd, jaki faktycznie popłynie tym obwodem przy pełnym obciążeniu — z bilansu mocy odbiorników (Ib = P / (√3 · U · cosφ) dla 3 faz) albo wprost z projektu."
                />
                <Field
                  label="Napięcie międzyfazowe"
                  value={pdNapiecie}
                  onChange={(v) => patch({ pdNapiecie: Number(v) })}
                  unit="V"
                  hint="Napięcie między dwiema fazami — w polskiej sieci nn to standardowo 400 V."
                />
                <Field
                  label="Materiał żyły"
                  value={pdMaterial}
                  onChange={(v) => patch({ pdMaterial: v as Material })}
                  options={MATERIAL_OPTIONS}
                />
                <Field
                  label="Izolacja"
                  value={pdIzolacja}
                  onChange={(v) => patch({ pdIzolacja: v as Izolacja })}
                  options={IZOLACJA_OPTIONS}
                  hint="Rodzaj izolacji przewodu — sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE). Wyższa dopuszczalna temperatura żyły XLPE daje większą obciążalność."
                />
                <Field
                  label="Metoda odniesienia"
                  value={pdMetoda}
                  onChange={(v) => patch({ pdMetoda: v as MetodaOdniesienia3 })}
                  options={METODA3_OPTIONS}
                />
                <Field
                  label="Długość trasy"
                  value={pdDlugosc}
                  onChange={(v) => patch({ pdDlugosc: Number(v) })}
                  unit="m"
                />
                <Field
                  label="cos φ"
                  value={pdCosfi}
                  onChange={(v) => patch({ pdCosfi: Number(v) })}
                  step="0.01"
                  hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
                />
                <Field
                  label="Dopuszczalny spadek napięcia"
                  value={pdLimitSpadku}
                  onChange={(v) => patch({ pdLimitSpadku: Number(v) })}
                  unit="%"
                  step="0.5"
                  hint="Standardowo 5% dla obwodów siłowych i 3% dla oświetlenia przy zasilaniu z sieci publicznej — pełną listę progów (też dla własnej stacji trafo) znajdziesz w kalkulatorze „Spadek napięcia”."
                />
              </div>

              {pdMetoda !== "D1" && pdMetoda !== "D2" ? (
                <div className="grid sm:grid-cols-2 gap-x-4">
                  <Field
                    label="Temperatura otoczenia"
                    value={pdTemperatura}
                    onChange={(v) => patch({ pdTemperatura: Number(v) })}
                    unit="°C"
                  />
                  <Field
                    label="Obwodów we wspólnej trasie"
                    value={pdWiazka}
                    onChange={(v) => patch({ pdWiazka: Number(v) })}
                    step="1"
                    hint="Ile obwodów biegnie razem w tej samej rurce/korytku/wiązce na dłuższym odcinku trasy — więcej obok siebie obniża obciążalność każdego z nich."
                  />
                </div>
              ) : (
                <div className="mb-3 text-xs leading-relaxed text-slate-500">
                  Metoda gruntowa — bez korekty temperatury/grupowania (brak tablic dla gruntu). Wynik ważny dla 20°C w
                  gruncie.
                </div>
              )}
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={pdRozruch} onChange={(e) => patch({ pdRozruch: e.target.checked })} className="h-4 w-4 rounded border-border" />
                Odbiornik z rozruchem silnikowym — charakterystyka C
              </label>

              <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={pdSprawdzOchrone}
                  onChange={(e) => patch({ pdSprawdzOchrone: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Sprawdź też ochronę przeciwporażeniową (wymaga impedancji źródła)
              </label>
              {pdSprawdzOchrone && (
                <div className="mb-3 grid sm:grid-cols-2 gap-x-4">
                  <Field
                    label="Impedancja źródła i reszty obwodu"
                    value={pdImpedancjaZrodla}
                    onChange={(v) => patch({ pdImpedancjaZrodla: Number(v) })}
                    unit="Ω"
                    step="0.01"
                    hint="Impedancja CAŁEJ sieci przed tym miejscem — transformatora, WLZ i wszystkiego dotąd. Weź z pomiaru pętli zwarcia w rozdzielnicy zasilającej ten odcinek albo policz w kalkulatorze „Impedancja przewodu”."
                  />
                  <Field
                    label="Układ sieci"
                    value={pdUklad}
                    onChange={(v) => patch({ pdUklad: v as "TN" | "TT" })}
                    options={UKLAD_OPTIONS}
                    hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce w budynkach zasilanych z sieci operatora). TT — własny uziom budynku, niezależny od sieci."
                  />
                </div>
              )}

              <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={pdSprawdzZwarcie}
                  onChange={(e) => patch({ pdSprawdzZwarcie: e.target.checked })}
                  className="h-4 w-4 rounded border-border"
                />
                Sprawdź też wytrzymałość zwarciową cieplną (wymaga prądu zwarciowego)
              </label>
              {pdSprawdzZwarcie && (
                <>
                  {/* Czas wyłączenia (kryterium 4) zależy od układu sieci i od tego, czy to
                      obwód odbiorczy (gniazda ≤ 63 A, odbiorniki stałe ≤ 32 A) czy rozdzielczy — inaczej niż przy kryterium 3
                      (ochrona przeciwporażeniowa), które go nie potrzebuje. Bez tych dwóch pól
                      kalkulator MILCZĄCO zakładał TN + obwód odbiorczy (0,4 s) — dla realnego
                      obwodu rozdzielczego (5 s) to zaniża wymagany przekrój z kryterium 4,
                      a ten kalkulator celuje właśnie w duże przekroje/prądy, gdzie obwody
                      rozdzielcze są normą, nie wyjątkiem. */}
                  <div className="grid sm:grid-cols-2 gap-x-4">
                    <Field
                      label="Układ sieci"
                      value={pdUklad}
                      onChange={(v) => patch({ pdUklad: v as "TN" | "TT" })}
                      options={UKLAD_OPTIONS}
                      hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce). TT — własny uziom budynku, niezależny od sieci."
                    />
                    <Field
                      label="Prąd zwarciowy w tym miejscu"
                      value={pdIk}
                      onChange={(v) => patch({ pdIk: Number(v) })}
                      unit="A"
                      hint="Prąd zwarcia jednofazowego (L-PE) w tym miejscu instalacji — z pomiaru, z kalkulatora „Prądy zwarciowe” albo z dokumentacji projektowej."
                    />
                  </div>
                  <Field
                    label="Rodzaj obwodu"
                    value={pdRodzajObwodu}
                    onChange={(v) => patch({ pdRodzajObwodu: v as RodzajObwoduCzasu })}
                    options={RODZAJ_OBWODU_OPTIONS}
                    hint={RODZAJ_OBWODU_HINT}
                  />
                </>
              )}

            </div>
            <div className="min-w-0" data-testid="wynik-obok">
              {pelnyDobor.wartosci && (
                <WynikGlowny
                  wartosci={[
                    { etykieta: "Przekrój wynikowy", wartosc: formatLiczba(pelnyDobor.wartosci.przekroj_mm2, 1), jednostka: "mm²" },
                  ]}
                >
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="accent">{pelnyDobor.wartosci.kabel}</Badge>
                    <Badge variant="info">In {pelnyDobor.wartosci.In_A} A</Badge>
                    <Badge variant="success">
                      decyduje: {pelnyDobor.wartosci.decydujace.map((k) => KRYTERIUM_LABELS[k]).join(" i ")}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    {(Object.entries(pelnyDobor.wartosci.kryteria) as [string, (typeof pelnyDobor.wartosci.kryteria)[keyof typeof pelnyDobor.wartosci.kryteria]][]).map(
                      ([k, v]) => (
                        <Badge key={k}>
                          {KRYTERIUM_LABELS[k as keyof typeof KRYTERIUM_LABELS]}:{" "}
                          {v.ocenione ? `${formatLiczba(v.minPrzekroj_mm2!, 1)} mm²` : "nieocenione"}
                        </Badge>
                      )
                    )}
                  </div>
                </WynikGlowny>
              )}
              <CalcResultView wynik={pelnyDobor} />
            </div>
          </div>
        </Card>
      )}

      {trybObwodu === "wlz" && (
        <Card title={label} tag="WLZ">
          <div className="grid sm:grid-cols-2 gap-x-4">
            <div>
              <Field
                label="Prąd obliczeniowy"
                value={wlzCurrentA}
                onChange={(v) => setWlzCurrentA(Number(v))}
                unit="A"
                hint="Prąd zapotrzebowany całego budynku (nie suma mocy zainstalowanej!) — wczytaj go przyciskiem poniżej z kalkulatora „Bilans mocy budynku” albo wpisz wartość z wniosku o przyłączenie."
              />
              <Button variant="secondary" size="sm"
                type="button"
                onClick={loadWlzCurrentFromBalance}
                className="-mt-2 mb-3"
              >
                <Download size={13} /> Wczytaj z bilansu mocy
              </Button>
            </div>
            <Field
              label="Zasilanie"
              value={wlzPhase}
              onChange={(v) => setWlzPhase(v as "1" | "3")}
              options={[
                { value: "1", label: "1-fazowe 230V" },
                { value: "3", label: "3-fazowe 400V" },
              ]}
            />
          </div>

          <div className="mb-2 mt-1 text-xs font-semibold text-slate-600">Trasa i warunki ułożenia</div>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field
              label="Długość trasy (w jedną stronę)"
              value={wlzLength}
              onChange={(v) => setWlzLength(Number(v))}
              unit="m"
            />
            <Field
              label="Sposób ułożenia"
              value={wlzLayingMethod}
              onChange={(v) => setWlzLayingMethod(v as LayingMethod)}
              options={LAYING_METHOD_OPTIONS}
              hint="Jak kabel WLZ jest ułożony WEWNĄTRZ budynku (pod tynkiem, w rurce, natynkowo…) — te tablice nie obejmują kabla ułożonego w ziemi."
            />
            <Field
              label="Temperatura otoczenia"
              value={wlzAmbientC}
              onChange={(v) => setWlzAmbientC(Number(v))}
              unit="°C"
            />
            <Field
              label="Obwodów we wspólnej trasie"
              value={wlzBundleCount}
              onChange={(v) => setWlzBundleCount(Number(v))}
              step="1"
              hint="Ile innych obwodów biegnie razem z WLZ w tej samej rurce/korytku na dłuższym odcinku trasy."
            />
            <Field
              label="Dopuszczalny spadek napięcia na WLZ"
              value={wlzDropLimit}
              onChange={(v) => setWlzDropLimit(Number(v))}
              unit="%"
              step="0.5"
              hint="Domyślnie 2% — węższy limit niż 3–5% dla obwodu odbiorczego, bo WLZ to tylko odcinek całej trasy i musi zostawić zapas na spadek za rozdzielnicą."
            />
          </div>

          <WynikGlowny
            wartosci={
              sizedFeeder.przekroj_mm2 && sizedFeeder.aparat
                ? [
                    { etykieta: "Przekrój żyły", wartosc: String(sizedFeeder.przekroj_mm2).replace(".", ","), jednostka: "mm²" },
                    {
                      etykieta: "Wyłącznik nadprądowy",
                      wartosc: (
                        <>
                          {sizedFeeder.aparat.charakterystyka}
                          {sizedFeeder.aparat.In_A} {sizedFeeder.aparat.bieguny}
                        </>
                      ),
                    },
                  ]
                : []
            }
          >
            {sizedFeeder.przekroj_mm2 && sizedFeeder.aparat ? (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="accent">{sizedFeeder.kabel}</Badge>
                <Badge variant="success">obc. dop. {sizedFeeder.Iz_A} A</Badge>
                {sizedFeeder.spadek_napiecia_pct !== null && (
                  <Badge>
                    ΔU {sizedFeeder.spadek_napiecia_pct}% (limit {sizedFeeder.spadek_napiecia_limit_pct}%)
                  </Badge>
                )}
              </div>
            ) : (
              <Alert variant="danger" role="note">
                nie udało się dobrać — zobacz komunikat niżej
              </Alert>
            )}
          </WynikGlowny>

          {sizedFeeder.ostrzezenia.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {sizedFeeder.ostrzezenia.map((w, i) => (
                <Alert key={i} role="note" variant={w.level === "error" ? "danger" : "caution"}>
                  {w.message}
                </Alert>
              ))}
            </div>
          )}

          <HowItWorks
            formulas={[
              { label: "Warunek doboru zabezpieczenia", eq: "Ib ≤ In ≤ Iz", where: "Iz = Iz₀ × k1 × k2 — obciążalność po współczynnikach temperatury i grupowania" },
              { label: "Spadek napięcia — 1-fazowy / 3-fazowy", eq: "ΔU = (2·L·Ib·ρ)/S   |   ΔU = (√3·L·Ib·ρ)/S", where: "ρ = 0,0225 Ω·mm²/m przy 70°C, ten sam wzór co w doborze obwodu odbiorczego" },
            ]}
            notes={[
              "Ten sam silnik doboru co „Dobór obwodu” i Rozdzielnica (`sizeCircuit`/`sizeFeeder` w `lib/panel/sizing.ts`) — ta sama tablica obciążalności, te same współczynniki poprawkowe.",
              "Minimalny przekrój WLZ przyjęto na 10 mm² — praktyka projektowa dla domu jednorodzinnego (kabel dźwiga cały budynek), NIE liczba wprost z normy.",
              "Domyślny limit spadku napięcia na samej WLZ to 2%, węższy niż 3-5% dla obwodu odbiorczego — WLZ to tylko odcinek całej trasy do odbiornika, więc zostawia miejsce na spadek za rozdzielnicą. Można go zmienić powyżej.",
              "Tablice dotyczą przewodu w budynku (pod tynkiem/w rurce/natynkowo) — NIE kabla ziemnego. Jeśli WLZ biegnie w ziemi od złącza kablowo-pomiarowego, ten kalkulator się nie sprawdzi — potrzebna inna metoda odniesienia.",
              "„Wczytaj z bilansu mocy” bierze prąd zapotrzebowany (Pz) z kalkulatora „Bilans mocy budynku” dla wybranej tu liczby faz — uzupełnij najpierw listę odbiorników w tamtym kalkulatorze.",
            ]}
          />
        </Card>
      )}

      {/* Wspolna stopka wszystkich trybow: te same cztery kryteria, niezaleznie
          od tego, czym uzytkownik zaczal. Dwa ostatnie wymagaja liczb, ktorych
          dobor nie ma skad wziac sam — sa wiec polami, a nieuzupelnione zostaja
          NIEOCENIONE, nigdy „spelnione". */}
      <Card title="Cztery kryteria doboru" tag="werdykt">
        {/* Tryb „pełny dobór" ma WŁASNE pola na impedancję i prąd zwarcia
            (w karcie wyżej, pod checkboxami) i tylko one wchodzą do jego
            silnika. Te trzy poniżej były dla niego martwe: dawało się je
            wypełnić, a kryteria dalej pokazywały „nie podano". */}
        {trybObwodu === "pelny" ? (
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Kryteria 3 i 4 włączasz w karcie wyżej — checkboxami „sprawdź ochronę przeciwporażeniową" i „sprawdź
            wytrzymałość zwarciową". Ten tryb liczy je z impedancji źródła i prądu zwarcia, a nie z gotowej Zs.
          </p>
        ) : (
        <div className="mb-3 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Impedancja pętli Zs"
            value={obwodZsOhm}
            onChange={(v) => setObwodZsOhm(Number(v))}
            unit="Ω"
            step="0.01"
            hint="Zmierzona albo policzona impedancja pętli zwarcia w tym punkcie. Bez niej trzecie kryterium zostaje nieocenione — dobór zna tylko wartość WYMAGANĄ, nie rzeczywistą."
          />
          <Field
            label="Spodziewany prąd zwarcia Ik"
            value={obwodIkA}
            onChange={(v) => setObwodIkA(Number(v))}
            unit="A"
            hint="Prąd zwarcia w tym punkcie — z kalkulatora „Prądy zwarciowe” albo z danych operatora. Zostaw 0, a policzy się z impedancji pętli: Ik = 0,95·230 V / Zs."
          />
          <Field
            label="Czas wyłączenia t"
            value={obwodCzasS}
            onChange={(v) => setObwodCzasS(Number(v))}
            unit="s"
            step="0.05"
            hint="RZECZYWISTY czas zadziałania zabezpieczenia przy tym prądzie zwarcia, odczytany z jego charakterystyki — nie dopuszczalny czas z tabl. 41.1. Używany tylko, gdy Ik < Ia; przy Ik ≥ Ia wyłącznik działa elektromagnetycznie (< 0,1 s) i liczy się I²t."
          />
          <Field
            label="I²t aparatu"
            value={obwodI2tA2s}
            onChange={(v) => setObwodI2tA2s(Number(v))}
            unit="A²s"
            step="100"
            hint="Energia przenoszona przez wyłącznik przy tym prądzie zwarcia — z karty katalogowej (wykres I²t albo klasa ograniczenia energii). Potrzebna, gdy Ik ≥ Ia: warunek to k²S² ≥ I²t. 0 = nie podano."
          />
        </div>
        )}
        {/* Werdykt zbiorczy STOI NAD listą kryteriów i przykleja się przy
            przewijaniu — dotąd był szarym akapitem pod czterema kartami, czyli
            najmniej widocznym elementem tego, po co się tu w ogóle przychodzi. */}
        <PasekWerdyktu ocena={podsumowanieObwodu(kryteriaObwodu)} />
        <div className="mt-2">
          <KryteriaObwodu oceny={kryteriaObwodu} />
        </div>
      </Card>
    </>
  );
}
