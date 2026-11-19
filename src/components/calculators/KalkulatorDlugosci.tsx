import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { obliczMaksymalnaDlugosc } from "@/lib/calc/maxLength";
import { formatLiczba } from "@/lib/calc/result";
import type { Izolacja, Material } from "@/lib/norms/conductors";
import { U0 } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { IZOLACJA_OPTIONS, LIMIT_SPADKU_OPCJE, MATERIAL_OPTIONS, PHASE_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Maksymalna długość obwodu — mniejsza z dwóch granic: spadku napięcia i samoczynnego
 * wyłączenia (Zs max z Cmin = 0,95, górna krotność wyzwalacza). Silnik `lib/calc/maxLength.ts`.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorDlugosci({ label }: { label: string }) {
  const mdPhase = useCalculatorsStore((s) => s.mdPhase);
  const mdCurrentA = useCalculatorsStore((s) => s.mdCurrentA);
  const mdSection = useCalculatorsStore((s) => s.mdSection);
  const mdSectionPE = useCalculatorsStore((s) => s.mdSectionPE);
  const mdMaterial = useCalculatorsStore((s) => s.mdMaterial);
  const mdIzolacja = useCalculatorsStore((s) => s.mdIzolacja);
  const mdCurve = useCalculatorsStore((s) => s.mdCurve);
  const mdInA = useCalculatorsStore((s) => s.mdInA);
  const mdZsPrzed = useCalculatorsStore((s) => s.mdZsPrzed);
  const mdLimitPct = useCalculatorsStore((s) => s.mdLimitPct);
  const mdPlanowana = useCalculatorsStore((s) => s.mdPlanowana);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- maksymalna długość obwodu ---
  const maksDlugosc = useMemo(
    () =>
      obliczMaksymalnaDlugosc({
        uklad: mdPhase === "3" ? "3f" : "1f",
        napiecie_V: mdPhase === "3" ? 400 : U0,
        prad_A: mdCurrentA,
        material: mdMaterial,
        izolacja: mdIzolacja,
        przekroj_mm2: mdSection,
        przekrojPE_mm2: mdSectionPE,
        charakterystyka: mdCurve,
        In_A: mdInA,
        Zs_przed_Ohm: mdZsPrzed,
        limitSpadku_pct: mdLimitPct,
        dlugoscPlanowana_m: mdPlanowana,
      }),
    [mdPhase, mdCurrentA, mdMaterial, mdIzolacja, mdSection, mdSectionPE, mdCurve, mdInA, mdZsPrzed, mdLimitPct, mdPlanowana]
  );

  return (
    <Card title={label} tag="granica trasy">
      <Alert variant="info" role="note" className="mb-3 text-xs">
        Odwrotność „Spadku napięcia": tam podajesz długość i patrzysz na wynik, tutaj dostajesz{" "}
        <strong>granicę wprost</strong>. Liczone są dwa warunki naraz — spadek napięcia i zadziałanie
        zabezpieczenia przy zwarciu na końcu trasy — a wiąże ten, który wypada krócej.
      </Alert>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Zasilanie" value={mdPhase} onChange={(v) => patch({ mdPhase: v as "1" | "3" })} options={PHASE_OPTIONS} />
        <Field
          label="Prąd obliczeniowy (Ib)"
          value={mdCurrentA}
          onChange={(v) => patch({ mdCurrentA: Number(v) })}
          unit="A"
          step="0.1"
          hint="Prąd, jaki popłynie trasą przy pełnym obciążeniu. Do warunku spadku napięcia — im większy, tym krótsza dopuszczalna trasa."
        />
        <Field
          label="Przekrój żyły fazowej"
          value={String(mdSection)}
          onChange={(v) => patch({ mdSection: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
        />
        <Field
          label="Przekrój żyły ochronnej PE"
          value={String(mdSectionPE)}
          onChange={(v) => patch({ mdSectionPE: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
          hint="Pętla zwarciowa idzie fazą TAM i przewodem PE Z POWROTEM, więc cieńszy PE skraca dopuszczalną trasę. W przewodach YDY/YKY o przekroju do 16 mm² PE ma zwykle taki sam przekrój jak faza."
        />
        <Field label="Materiał żyły" value={mdMaterial} onChange={(v) => patch({ mdMaterial: v as Material })} options={MATERIAL_OPTIONS} />
        <Field
          label="Izolacja (temperatura pracy)"
          value={mdIzolacja}
          onChange={(v) => patch({ mdIzolacja: v as Izolacja })}
          options={IZOLACJA_OPTIONS}
        />
        <Field
          label="Charakterystyka zabezpieczenia"
          value={mdCurve}
          onChange={(v) => patch({ mdCurve: v as "B" | "C" | "D" })}
          options={[
            { value: "B", label: "B (5×In)" },
            { value: "C", label: "C (10×In)" },
            { value: "D", label: "D (20×In)" },
          ]}
          hint="Krotność GÓRNEJ granicy pasma wyzwalania magnetycznego. Charakterystyka C wymaga dwa razy mniejszej impedancji pętli niż B, więc skraca dopuszczalną trasę o połowę."
        />
        <Field
          label="Prąd znamionowy zabezpieczenia (In)"
          value={mdInA}
          onChange={(v) => patch({ mdInA: Number(v) })}
          unit="A"
        />
        <Field
          label="Impedancja pętli przed odcinkiem"
          value={mdZsPrzed}
          onChange={(v) => patch({ mdZsPrzed: Number(v) })}
          unit="Ω"
          step="0.01"
          hint="Impedancja od transformatora do rozdzielnicy, z której wychodzi ten obwód — zmierzona miernikiem pętli albo z kalkulatora „Prądy zwarciowe”. Dla domu jednorodzinnego typowo 0,2–0,8 Ω."
        />
        <Field
          label="Dopuszczalny spadek napięcia"
          value={String(mdLimitPct)}
          onChange={(v) => patch({ mdLimitPct: Number(v) })}
          options={LIMIT_SPADKU_OPCJE}
          hint="Budżet dla TEGO odcinka. Jeśli spadek zjada już WLZ, odejmij go tutaj — limit normy dotyczy całej drogi od złącza."
        />
        <Field
          label="Planowana długość trasy"
          value={mdPlanowana}
          onChange={(v) => patch({ mdPlanowana: Number(v) })}
          unit="m"
          hint="Trasa, którą chcesz poprowadzić — to ją oceniamy względem wyliczonej granicy. Mierz drogę przewodu, a nie odległość w linii prostej."
        />
      </div>

      {maksDlugosc.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Maksymalna długość trasy", wartosc: formatLiczba(maksDlugosc.wartosci.L_max_m, 1), jednostka: "m" },
          ]}
        >
          <div className="flex flex-wrap gap-2">
            {/* Obie granice OBOK siebie, nie tylko ta wiążąca: dopiero z nich
                widać, co poprawić — grubszą żyłę czy inne zabezpieczenie. */}
            <Badge variant={maksDlugosc.wartosci.wiazace === "spadek" ? "accent" : "info"}>
              spadek napięcia {formatLiczba(maksDlugosc.wartosci.L_spadek_m, 1)} m
            </Badge>
            <Badge variant={maksDlugosc.wartosci.wiazace === "ochrona" ? "accent" : "info"}>
              samoczynne wyłączenie {formatLiczba(maksDlugosc.wartosci.L_ochrona_m, 1)} m
            </Badge>
            <Badge variant="success">
              Zs max {formatLiczba(maksDlugosc.wartosci.Zs_max_Ohm, 2)} Ω przy Ia {formatLiczba(maksDlugosc.wartosci.Ia_A, 0)} A
            </Badge>
          </div>
        </WynikGlowny>
      )}

      <CalcResultView wynik={maksDlugosc} />

      <HowItWorks
        formulas={[
          {
            label: "Granica ze spadku napięcia",
            eq: "L ≤ ΔU_dop · S / (k · Ib · ρ)",
            where: "k = 2 dla 1 fazy, √3 dla 3 faz; ΔU_dop = limit% · U",
          },
          {
            label: "Granica z samoczynnego wyłączenia",
            eq: "L ≤ (Zs_max − Z_przed) / (ρ · (1/S_L + 1/S_PE))",
            where: "Zs_max = 0,95 · U₀ / Ia, Ia = krotność górna × In",
          },
        ]}
        notes={[
          "Warunek cieplny (S ≥ Ik·√t/k) nie ogranicza długości — dłuższy obwód to mniejszy prąd zwarcia, czyli mniejsze obciążenie cieplne żyły. Ogranicza ją za to zdolność zabezpieczenia do zadziałania, i to jest właśnie drugi z liczonych tu warunków.",
          "Obwód zabezpieczony wyłącznikiem różnicowoprądowym spełnia warunek samoczynnego wyłączenia niezależnie od impedancji pętli, więc realną granicą zostaje wtedy sam spadek napięcia.",
          "Prąd przyjęty jako skupiony na końcu trasy. Dla linii z odbiorami rozłożonymi po drodze (np. oprawy oświetleniowe) granica jest większa — policz taką trasę w kalkulatorze „Spadek napięcia”, który liczy sumę momentów prądowych.",
          "Rachunek pomija reaktancję, więc od 35 mm² kalkulator odmawia liczenia zamiast podawać wynik zaniżony — tak samo jak „Spadek napięcia” w metodzie uproszczonej.",
        ]}
      />
    </Card>
  );
}
