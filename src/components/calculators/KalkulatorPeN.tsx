import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { dobierzN, dobierzPE } from "@/lib/calc/protectiveConductor";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import type { Izolacja, Material } from "@/lib/norms/conductors";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { WynikGlowny } from "./WynikGlowny";
import { IZOLACJA_OPTIONS, MATERIAL_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";

/**
 * Kalkulator doboru przewodu ochronnego PE i neutralnego N.
 *
 * Drugi z trzech kalkulatorów wydzielonych z `CalculatorsTab` — patrz komentarz przy
 * `KalkulatorImpedancji`. Dwa wyniki w jednej karcie, bo PE i N dobiera się z tego
 * samego przekroju fazowego i w praktyce rozpatruje razem.
 */
export function KalkulatorPeN({ label }: { label: string }) {
  const peFazowy = useCalculatorsStore((s) => s.peFazowy);
  const peMaterial = useCalculatorsStore((s) => s.peMaterial);
  const peIzolacja = useCalculatorsStore((s) => s.peIzolacja);
  const pePradZwarciowy = useCalculatorsStore((s) => s.pePradZwarciowy);
  const peCzas = useCalculatorsStore((s) => s.peCzas);
  const pnPradFazowy = useCalculatorsStore((s) => s.pnPradFazowy);
  const pnH3Pct = useCalculatorsStore((s) => s.pnH3Pct);
  const patch = useCalculatorsStore((s) => s.patch);

  const przewodPE = useMemo(
    () =>
      dobierzPE({
        przekrojFazowy_mm2: peFazowy,
        material: peMaterial,
        izolacja: peIzolacja,
        pradZwarciowy_A: pePradZwarciowy > 0 ? pePradZwarciowy : undefined,
        czasWylaczenia_s: peCzas > 0 ? peCzas : undefined,
      }),
    [peFazowy, peMaterial, peIzolacja, pePradZwarciowy, peCzas],
  );

  const przewodN = useMemo(
    () => dobierzN({ przekrojFazowy_mm2: peFazowy, pradFazowy_A: pnPradFazowy, udzialH3_pct: pnH3Pct }),
    [peFazowy, pnPradFazowy, pnH3Pct],
  );

  return (
    <Card title={label} tag="PE i N">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Przekrój przewodu fazowego"
          value={String(peFazowy)}
          onChange={(v) => patch({ peFazowy: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
        />
        <Field
          label="Materiał"
          value={peMaterial}
          onChange={(v) => patch({ peMaterial: v as Material })}
          options={MATERIAL_OPTIONS}
        />
        <Field
          label="Izolacja"
          value={peIzolacja}
          onChange={(v) => patch({ peIzolacja: v as Izolacja })}
          options={IZOLACJA_OPTIONS}
          hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o współczynniku k wytrzymałości zwarciowej."
        />
        <Field
          label="Prąd zwarcia doziemnego (0 = pomiń warunek cieplny)"
          value={pePradZwarciowy}
          onChange={(v) => patch({ pePradZwarciowy: Number(v) })}
          unit="A"
          hint="Prąd zwarcia L-PE w tym miejscu — z pomiaru, z kalkulatora „Prądy zwarciowe” albo z dokumentacji projektowej. Bez niego sprawdzany jest tylko sam warunek tabelaryczny."
        />
        <Field
          label="Czas wyłączenia"
          value={peCzas}
          onChange={(v) => patch({ peCzas: Number(v) })}
          unit="s"
          step="0.1"
          hint="Rzeczywisty czas zadziałania zabezpieczenia tego obwodu przy podanym prądzie zwarciowym — z charakterystyki wyzwalania albo maksymalny czas wg normy (0,4 s dla obwodu odbiorczego TN)."
        />
      </div>

      {przewodPE.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Wymagany przekrój przewodu PE", wartosc: formatLiczba(przewodPE.wartosci.wymagany_mm2, 1), jednostka: "mm²" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">z reguły {formatLiczba(przewodPE.wartosci.zReguly_mm2, 1)} mm²</Badge>
            {przewodPE.wartosci.zWarunkuCieplnego_mm2 !== null && (
              <Badge variant="info">
                z warunku cieplnego {formatLiczba(przewodPE.wartosci.zWarunkuCieplnego_mm2, 2)} mm²
              </Badge>
            )}
            <Badge variant="success">decyduje: {przewodPE.wartosci.decyduje}</Badge>
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={przewodPE} />

      <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Przewód neutralny N</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Prąd fazowy"
          value={pnPradFazowy}
          onChange={(v) => patch({ pnPradFazowy: Number(v) })}
          unit="A"
        />
        <Field
          label="Udział 3. harmonicznej"
          value={pnH3Pct}
          onChange={(v) => patch({ pnH3Pct: Number(v) })}
          unit="%"
          step="5"
          hint="0% dla odbiorów liniowych. Dla zasilaczy impulsowych, opraw LED i falowników realnie to często 60–90% — bez tej wartości prąd w N wyjdzie zaniżony."
        />
      </div>
      {przewodN.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Prąd w przewodzie N (obciążenie symetryczne)", wartosc: formatLiczba(przewodN.wartosci.IN_A, 1), jednostka: "A" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">zalecany przekrój N {formatLiczba(przewodN.wartosci.zalecany_mm2, 1)} mm²</Badge>
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={przewodN} />
    </Card>
  );
}
