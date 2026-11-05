import { useMemo } from "react";
import { obliczImpedancjePrzewodu, obliczPrzewodyRownolegle } from "@/lib/calc/conductorImpedance";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import type { Izolacja, Material, RodzajLinii } from "@/lib/norms/conductors";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field, HintButton } from "./Field";
import { IZOLACJA_OPTIONS, MATERIAL_OPTIONS, RODZAJ_LINII_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";
import { parsujDlugosci } from "./parsujDlugosci";

/**
 * Kalkulator impedancji przewodu i przewodów równoległych.
 *
 * Wydzielony z `CalculatorsTab` (3693 linie na 19 kalkulatorów) jako pierwszy z trzech —
 * te trzy mają własne moduły obliczeniowe i własne testy jednostkowe, więc nadają się na
 * wzorzec. Przeniesienie jest tanie, bo stan kalkulatorów siedzi w store i komponent czyta
 * go sam: z zewnątrz potrzebuje wyłącznie tytułu karty.
 */
export function KalkulatorImpedancji({ label }: { label: string }) {
  const imDlugosc = useCalculatorsStore((s) => s.imDlugosc);
  const imPrzekroj = useCalculatorsStore((s) => s.imPrzekroj);
  const imMaterial = useCalculatorsStore((s) => s.imMaterial);
  const imIzolacja = useCalculatorsStore((s) => s.imIzolacja);
  const imRodzajLinii = useCalculatorsStore((s) => s.imRodzajLinii);
  const imRownoleglePrad = useCalculatorsStore((s) => s.imRownoleglePrad);
  const imRownolegleDlugosci = useCalculatorsStore((s) => s.imRownolegleDlugosci);
  const imRownolegleIz = useCalculatorsStore((s) => s.imRownolegleIz);
  const patch = useCalculatorsStore((s) => s.patch);

  const impedancja = useMemo(
    () =>
      obliczImpedancjePrzewodu({
        dlugosc_m: imDlugosc,
        przekroj_mm2: imPrzekroj,
        material: imMaterial,
        izolacja: imIzolacja,
        rodzajLinii: imRodzajLinii,
      }),
    [imDlugosc, imPrzekroj, imMaterial, imIzolacja, imRodzajLinii],
  );

  const rownolegle = useMemo(
    () =>
      obliczPrzewodyRownolegle({
        pradCalkowity_A: imRownoleglePrad,
        dlugosci_m: parsujDlugosci(imRownolegleDlugosci),
        przekroj_mm2: imPrzekroj,
        material: imMaterial,
        izolacja: imIzolacja,
        Iz_jednej_A: imRownolegleIz > 0 ? imRownolegleIz : undefined,
      }),
    [imRownoleglePrad, imRownolegleDlugosci, imPrzekroj, imMaterial, imIzolacja, imRownolegleIz],
  );

  return (
    <Card title={label} tag="R, X, Z">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Długość przewodu"
          value={imDlugosc}
          onChange={(v) => patch({ imDlugosc: Number(v) })}
          unit="m"
        />
        <Field
          label="Przekrój żyły"
          value={String(imPrzekroj)}
          onChange={(v) => patch({ imPrzekroj: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
        />
        <Field
          label="Materiał"
          value={imMaterial}
          onChange={(v) => patch({ imMaterial: v as Material })}
          options={MATERIAL_OPTIONS}
        />
        <Field
          label="Izolacja"
          value={imIzolacja}
          onChange={(v) => patch({ imIzolacja: v as Izolacja })}
          options={IZOLACJA_OPTIONS}
          hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — decyduje o temperaturze żyły przyjętej do liczenia rezystancji."
        />
        <Field
          label="Rodzaj linii (X′)"
          value={imRodzajLinii}
          onChange={(v) => patch({ imRodzajLinii: v as RodzajLinii })}
          options={RODZAJ_LINII_OPTIONS}
          hint="Jak fizycznie wygląda trasa — kabel wielożyłowy, kable jednożyłowe osobno, czy linia napowietrzna. Wybierz opis najbliższy rzeczywistości."
        />
      </div>

      {impedancja.wartosci && (
        <div className="mt-2 p-3 pe-result">
          <div className="text-xs text-slate-500 mb-1">Impedancja przewodu</div>
          <div className="pe-mono text-lg text-blueprint">{formatLiczba(impedancja.wartosci.Z_ohm, 4)} Ω</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="pe-chip pe-tag-copper">R {formatLiczba(impedancja.wartosci.R_ohm, 4)} Ω</span>
            <span className="pe-chip pe-tag-blue">X {formatLiczba(impedancja.wartosci.X_ohm, 4)} Ω</span>
            {impedancja.wartosci.R_do_X !== null && (
              <span className="pe-chip pe-tag-green">R/X {formatLiczba(impedancja.wartosci.R_do_X, 2)}</span>
            )}
            <span className="pe-chip" style={{ background: "#EEF1F4", color: "#475569" }}>
              γ {formatLiczba(impedancja.wartosci.gamma, 1)} przy {formatLiczba(impedancja.wartosci.tempZyly_C, 0)} °C
            </span>
          </div>
        </div>
      )}
      <CalcResultView wynik={impedancja} />

      <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Przewody równoległe — podział prądu</div>
      <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
        Prąd dzieli się <strong>odwrotnie proporcjonalnie do impedancji</strong>, więc krótsza żyła bierze go
        więcej. Zabezpieczenie nadprądowe mierzy prąd CAŁKOWITY, więc przeciążenia pojedynczej żyły nie wykryje —
        stąd normowy wymóg jednakowej długości i przekroju.
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Prąd całkowity obwodu"
          value={imRownoleglePrad}
          onChange={(v) => patch({ imRownoleglePrad: Number(v) })}
          unit="A"
        />
        <Field
          label="Obciążalność jednej żyły (0 = bez oceny)"
          value={imRownolegleIz}
          onChange={(v) => patch({ imRownolegleIz: Number(v) })}
          unit="A"
          hint="Dopuszczalny prąd długotrwały POJEDYNCZEJ żyły po współczynnikach korekcyjnych — z kalkulatora „Dobór obwodu” albo z Rozdzielnicy. Zostaw 0, żeby zobaczyć sam podział prądu bez oceny."
        />
      </div>
      {/* Jawne htmlFor/id z tego samego powodu co w `Field` — przycisk „i" jest
          elementem etykietowalnym i przy owinięciu obu w <label> przejąłby
          powiązanie, zostawiając pole bez nazwy dostępnej. */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-1 text-xs text-slate-500">
          <label htmlFor="im-rownolegle-dlugosci">Długości poszczególnych żył (po przecinku)</label>
          <HintButton hint="Wpisz długość KAŻDEJ żyły biegnącej równolegle, oddzieloną przecinkiem — np. dla dwóch żył o różnej długości: 40, 60. Różne długości to właśnie ten problem, który ten kalkulator pokazuje liczbowo." />
        </div>
        <input
          id="im-rownolegle-dlugosci"
          className="pe-input pe-mono w-full text-sm"
          value={imRownolegleDlugosci}
          onChange={(e) => patch({ imRownolegleDlugosci: e.target.value })}
          placeholder="np. 40, 60"
        />
      </div>

      {rownolegle.wartosci && (
        <div className="mt-2 p-3 pe-result">
          <div className="text-xs text-slate-500 mb-1">Najbardziej obciążona żyła</div>
          <div className="pe-mono text-lg text-blueprint">{formatLiczba(rownolegle.wartosci.Imax_A, 1)} A</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="pe-chip pe-tag-copper">
              podział {rownolegle.wartosci.prady_A.map((I) => formatLiczba(I, 1)).join(" / ")} A
            </span>
            <span className="pe-chip pe-tag-blue">
              przy równym podziale {formatLiczba(rownolegle.wartosci.pradRowny_A, 1)} A
            </span>
            <span className="pe-chip pe-tag-green">odchylenie {formatLiczba(rownolegle.wartosci.odchylenie_pct, 1)}%</span>
          </div>
        </div>
      )}
      <CalcResultView wynik={rownolegle} />
    </Card>
  );
}
