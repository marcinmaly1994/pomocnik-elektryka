import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { obliczObwodEV } from "@/lib/calc/evCharger";
import { formatLiczba } from "@/lib/calc/result";
import type { LayingMethod } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { LAYING_METHOD_OPTIONS, PHASE_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Ładowarka pojazdu elektrycznego — obwód dedykowany pod pełny prąd ciągły i wymagany typ
 * RCD (typ B albo typ A z RDC-DD, PN-HD 60364-7-722). Silnik `lib/calc/evCharger.ts`.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorEV({ label }: { label: string }) {
  const evMoc = useCalculatorsStore((s) => s.evMoc);
  const evFaza = useCalculatorsStore((s) => s.evFaza);
  const evCosfi = useCalculatorsStore((s) => s.evCosfi);
  const evDlugosc = useCalculatorsStore((s) => s.evDlugosc);
  const evSposobUlozenia = useCalculatorsStore((s) => s.evSposobUlozenia);
  const evWbudowanaOchronaDC = useCalculatorsStore((s) => s.evWbudowanaOchronaDC);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- ładowarka EV ---
  const obwodEV = useMemo(
    () =>
      obliczObwodEV({
        mocLadowania_W: evMoc,
        liczba_faz: evFaza,
        cos_phi: evCosfi,
        dlugosc_m: evDlugosc,
        sposob_ulozenia: evSposobUlozenia,
        maWbudowanaOchroneDC: evWbudowanaOchronaDC,
      }),
    [evMoc, evFaza, evCosfi, evDlugosc, evSposobUlozenia, evWbudowanaOchronaDC]
  );

  return (
    <Card title={label} tag="EVSE">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Moc ładowania"
          value={evMoc}
          onChange={(v) => patch({ evMoc: Number(v) })}
          unit="W"
          hint="Moc ładowania z tabliczki/dokumentacji ładowarki (np. 3,7 kW dla 1-fazowej 16 A, 11 kW albo 22 kW dla 3-fazowej)."
        />
        <Field
          label="Zasilanie"
          value={evFaza}
          onChange={(v) => patch({ evFaza: v as "1" | "3" })}
          options={PHASE_OPTIONS}
        />
        <Field
          label="Współczynnik mocy cos φ"
          value={evCosfi}
          onChange={(v) => patch({ evCosfi: Number(v) })}
          step="0.01"
          hint="Nowoczesne ładowarki z korekcją współczynnika mocy (PFC) mają cos φ bliski 1,0 — sprawdź w karcie katalogowej, jeśli chcesz dokładniejszą wartość."
        />
        <Field
          label="Długość trasy"
          value={evDlugosc}
          onChange={(v) => patch({ evDlugosc: Number(v) })}
          unit="m"
        />
        <Field
          label="Sposób ułożenia"
          value={evSposobUlozenia}
          onChange={(v) => patch({ evSposobUlozenia: v as LayingMethod })}
          options={LAYING_METHOD_OPTIONS}
        />
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={evWbudowanaOchronaDC}
          onChange={(e) => patch({ evWbudowanaOchronaDC: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Ładowarka ma wbudowaną ochronę przed prądem upływu stałym (RDC-DD)
      </label>

      {obwodEV.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Prąd obliczeniowy", wartosc: formatLiczba(obwodEV.wartosci.Ib_A, 2), jednostka: "A" },
          ]}
        >
          {obwodEV.wartosci.dobor.kabel && obwodEV.wartosci.dobor.aparat ? (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="accent">{obwodEV.wartosci.dobor.kabel}</Badge>
              <Badge variant="info">
                wyłącznik {obwodEV.wartosci.dobor.aparat.charakterystyka}
                {obwodEV.wartosci.dobor.aparat.In_A} {obwodEV.wartosci.dobor.aparat.bieguny}
              </Badge>
              <Badge variant="success">
                {obwodEV.wartosci.wymaganyRCD === "typA_wystarczy" ? "RCD typu A wystarczy" : "wymagany RCD typu B / A+RDC-DD"}
              </Badge>
            </div>
          ) : (
            <Alert variant="danger" role="note">
              nie udało się dobrać — zobacz ostrzeżenia niżej
            </Alert>
          )}
        </WynikGlowny>
      )}

      {obwodEV.wartosci?.dobor.ostrzezenia && obwodEV.wartosci.dobor.ostrzezenia.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {obwodEV.wartosci.dobor.ostrzezenia.map((o, i) => (
            <Alert key={i} role="note" variant={o.level === "error" ? "danger" : "caution"}>
              {o.message}
            </Alert>
          ))}
        </div>
      )}
      <CalcResultView wynik={obwodEV} />
    </Card>
  );
}
