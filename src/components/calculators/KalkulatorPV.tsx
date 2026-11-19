import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { dobierzPrzewodACFalownika, obliczStringPV } from "@/lib/calc/pv";
import { formatLiczba } from "@/lib/calc/result";
import type { Material } from "@/lib/norms/conductors";
import type { LayingMethod } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { LAYING_METHOD_OPTIONS, MATERIAL_OPTIONS, PHASE_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Instalacja fotowoltaiczna — string DC (prąd projektowy przewodu, zakres bezpiecznika,
 * Voc na zimno, MPPT w upale, spadek DC) i dobór przewodu strony AC falownika.
 * Silnik `lib/calc/pv.ts`.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorPV({ label }: { label: string }) {
  const pvIsc = useCalculatorsStore((s) => s.pvIsc);
  const pvVoc = useCalculatorsStore((s) => s.pvVoc);
  const pvVmpp = useCalculatorsStore((s) => s.pvVmpp);
  const pvImpp = useCalculatorsStore((s) => s.pvImpp);
  const pvLiczbaModulow = useCalculatorsStore((s) => s.pvLiczbaModulow);
  const pvBeta = useCalculatorsStore((s) => s.pvBeta);
  const pvTempMin = useCalculatorsStore((s) => s.pvTempMin);
  const pvTempMax = useCalculatorsStore((s) => s.pvTempMax);
  const pvSprawdzMppt = useCalculatorsStore((s) => s.pvSprawdzMppt);
  const pvFalownikVocMax = useCalculatorsStore((s) => s.pvFalownikVocMax);
  const pvFalownikMpptMin = useCalculatorsStore((s) => s.pvFalownikMpptMin);
  const pvDlugoscDC = useCalculatorsStore((s) => s.pvDlugoscDC);
  const pvPrzekrojDC = useCalculatorsStore((s) => s.pvPrzekrojDC);
  const pvMaterialDC = useCalculatorsStore((s) => s.pvMaterialDC);
  const pvLimitSpadkuDC = useCalculatorsStore((s) => s.pvLimitSpadkuDC);
  const pvMocAC = useCalculatorsStore((s) => s.pvMocAC);
  const pvFazaAC = useCalculatorsStore((s) => s.pvFazaAC);
  const pvDlugoscAC = useCalculatorsStore((s) => s.pvDlugoscAC);
  const pvSposobUlozeniaAC = useCalculatorsStore((s) => s.pvSposobUlozeniaAC);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- fotowoltaika ---
  const stringPV = useMemo(
    () =>
      obliczStringPV({
        Isc_A: pvIsc,
        Voc_V: pvVoc,
        Vmpp_V: pvVmpp > 0 ? pvVmpp : undefined,
        Impp_A: pvImpp > 0 ? pvImpp : undefined,
        liczbaModulowSzeregowo: pvLiczbaModulow,
        betaNapiecia_pct_na_C: pvBeta,
        tempMin_C: pvTempMin,
        tempMax_C: pvSprawdzMppt ? pvTempMax : undefined,
        falownikVocMax_V: pvFalownikVocMax,
        falownikMpptMin_V: pvSprawdzMppt ? pvFalownikMpptMin : undefined,
        dlugoscDC_m: pvDlugoscDC,
        przekrojDC_mm2: pvPrzekrojDC,
        materialDC: pvMaterialDC,
        limitSpadkuDC_pct: pvLimitSpadkuDC,
      }),
    [
      pvIsc,
      pvVoc,
      pvVmpp,
      pvImpp,
      pvLiczbaModulow,
      pvBeta,
      pvTempMin,
      pvTempMax,
      pvSprawdzMppt,
      pvFalownikVocMax,
      pvFalownikMpptMin,
      pvDlugoscDC,
      pvPrzekrojDC,
      pvMaterialDC,
      pvLimitSpadkuDC,
    ]
  );
  const falownikAC = useMemo(
    () =>
      dobierzPrzewodACFalownika({
        mocAC_W: pvMocAC,
        liczba_faz: pvFazaAC,
        cos_phi: 1,
        dlugosc_m: pvDlugoscAC,
        sposob_ulozenia: pvSposobUlozeniaAC,
      }),
    [pvMocAC, pvFazaAC, pvDlugoscAC, pvSposobUlozeniaAC]
  );

  return (
    <Card title={label} tag="string DC">
      <div className="mb-2 text-xs font-semibold text-slate-600">Moduł i string (dane z karty katalogowej)</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Prąd zwarciowy Isc (STC)"
          value={pvIsc}
          onChange={(v) => patch({ pvIsc: Number(v) })}
          unit="A"
          step="0.1"
          hint="Prąd zwarciowy modułu w warunkach standardowych (STC) — z karty katalogowej modułu, oznaczenie „Isc”."
        />
        <Field
          label="Napięcie jałowe Voc (STC)"
          value={pvVoc}
          onChange={(v) => patch({ pvVoc: Number(v) })}
          unit="V"
          step="0.1"
          hint="Napięcie jałowe (bez obciążenia) modułu w warunkach STC — z karty katalogowej, oznaczenie „Voc”."
        />
        <Field
          label="Napięcie Vmpp (STC, opcjonalne)"
          value={pvVmpp}
          onChange={(v) => patch({ pvVmpp: Number(v) })}
          unit="V"
          step="0.1"
          hint="Napięcie w punkcie mocy maksymalnej — z karty katalogowej (oznaczenie „Vmpp”/„Vmp”). Bez niego spadek % liczony jest względem Voc, mniej dokładnie."
        />
        <Field
          label="Prąd Impp (STC, opcjonalne)"
          value={pvImpp}
          onChange={(v) => patch({ pvImpp: Number(v) })}
          unit="A"
          step="0.1"
          hint="Prąd w punkcie mocy maksymalnej — z karty katalogowej. Bez niego spadek napięcia liczony jest prądem Isc, co go zawyża (bezpieczna, ale mniej dokładna strona)."
        />
        <Field
          label="Liczba modułów w szeregu"
          value={pvLiczbaModulow}
          onChange={(v) => patch({ pvLiczbaModulow: Number(v) })}
          step="1"
          hint="Ile modułów jest połączonych szeregowo w jednym stringu podłączonym do jednego wejścia MPPT falownika."
        />
        <Field
          label="Współczynnik temperaturowy napięcia β"
          value={pvBeta}
          onChange={(v) => patch({ pvBeta: Number(v) })}
          unit="%/°C"
          step="0.01"
          hint="Z karty katalogowej modułu (oznaczenie „temperature coefficient of Voc”) — zwykle wartość UJEMNA, ok. −0,25 do −0,35 %/°C: napięcie modułu ROŚNIE, gdy robi się zimno."
        />
        <Field
          label="Temperatura minimalna modułu"
          value={pvTempMin}
          onChange={(v) => patch({ pvTempMin: Number(v) })}
          unit="°C"
          hint="Najniższa spodziewana temperatura w lokalizacji instalacji — moduł na słońcu w mrozie osiąga temperaturę zbliżoną do temperatury powietrza."
        />
        <Field
          label="Maks. napięcie wejściowe falownika"
          value={pvFalownikVocMax}
          onChange={(v) => patch({ pvFalownikVocMax: Number(v) })}
          unit="V"
          hint="Maksymalne dopuszczalne napięcie DC na wejściu falownika — z jego karty katalogowej. Przekroczenie grozi zniszczeniem falownika."
        />
      </div>

      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={pvSprawdzMppt}
          onChange={(e) => patch({ pvSprawdzMppt: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Sprawdź też dolną granicę zakresu MPPT w upale (wymaga Vmpp)
      </label>
      {pvSprawdzMppt && (
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field
            label="Temperatura maksymalna modułu"
            value={pvTempMax}
            onChange={(v) => patch({ pvTempMax: Number(v) })}
            unit="°C"
            hint="Najwyższa spodziewana temperatura modułu w pełnym słońcu — zwykle wyraźnie wyższa niż temperatura powietrza, typowo 60–70°C."
          />
          <Field
            label="Minimalne napięcie zakresu MPPT falownika"
            value={pvFalownikMpptMin}
            onChange={(v) => patch({ pvFalownikMpptMin: Number(v) })}
            unit="V"
            hint="Dolna granica zakresu MPPT z karty katalogowej falownika (oznaczenie „MPPT voltage range”)."
          />
        </div>
      )}

      <div className="mb-2 mt-3 text-xs font-semibold text-slate-600">Kabel DC</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Długość trasy DC (w jedną stronę)"
          value={pvDlugoscDC}
          onChange={(v) => patch({ pvDlugoscDC: Number(v) })}
          unit="m"
        />
        <Field
          label="Przekrój żyły DC"
          value={String(pvPrzekrojDC)}
          onChange={(v) => patch({ pvPrzekrojDC: Number(v) })}
          options={SZEREG_PELNY_OPTIONS}
          hint="Przekrój kabla solarnego DC — typowo 4 lub 6 mm² dla pojedynczego stringu."
        />
        <Field
          label="Materiał"
          value={pvMaterialDC}
          onChange={(v) => patch({ pvMaterialDC: v as Material })}
          options={MATERIAL_OPTIONS}
        />
        <Field
          label="Dopuszczalny spadek DC"
          value={pvLimitSpadkuDC}
          onChange={(v) => patch({ pvLimitSpadkuDC: Number(v) })}
          unit="%"
          step="0.1"
          hint="W praktyce projektowej instalacji PV przyjmuje się zwykle do 1% — większy spadek to bezpowrotna strata energii z produkcji."
        />
      </div>

      {stringPV.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Napięcie stringu w zimnie", wartosc: formatLiczba(stringPV.wartosci.VocZimny_V, 1), jednostka: "V" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">I projektowy przewodu (1,25×Isc) {formatLiczba(stringPV.wartosci.IprojektowyA, 2)} A</Badge>
            <Badge variant="neutral">
              Bezpiecznik stringu {formatLiczba(stringPV.wartosci.bezpiecznikMin_A, 1)}–{formatLiczba(stringPV.wartosci.bezpiecznikMax_A, 1)} A
            </Badge>
            <Badge variant="info">spadek DC {formatLiczba(stringPV.wartosci.spadekDC_pct, 2)}%</Badge>
            {stringPV.wartosci.VmppGoracy_V !== null && (
              <Badge variant="success">Vmpp w upale {formatLiczba(stringPV.wartosci.VmppGoracy_V, 1)} V</Badge>
            )}
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={stringPV} />

      <div className="mb-2 mt-4 text-xs font-semibold text-slate-600">Wyjście AC falownika</div>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Moc AC falownika"
          value={pvMocAC}
          onChange={(v) => patch({ pvMocAC: Number(v) })}
          unit="W"
        />
        <Field
          label="Zasilanie"
          value={pvFazaAC}
          onChange={(v) => patch({ pvFazaAC: v as "1" | "3" })}
          options={PHASE_OPTIONS}
        />
        <Field
          label="Długość trasy AC"
          value={pvDlugoscAC}
          onChange={(v) => patch({ pvDlugoscAC: Number(v) })}
          unit="m"
        />
        <Field
          label="Sposób ułożenia"
          value={pvSposobUlozeniaAC}
          onChange={(v) => patch({ pvSposobUlozeniaAC: v as LayingMethod })}
          options={LAYING_METHOD_OPTIONS}
        />
      </div>
      {falownikAC.przekroj_mm2 && falownikAC.aparat && (
        // Przewód i aparat to wynik tego bloku (dotąd same znaczniki) — wartości główne jak w
        // „Doborze obwodu”; znacznik z kablem zostaje, bo opisuje typ przewodu, nie przekrój.
        <WynikGlowny
          wartosci={[
            { etykieta: "Przekrój żyły", wartosc: String(falownikAC.przekroj_mm2).replace(".", ","), jednostka: "mm²" },
            {
              etykieta: "Wyłącznik nadprądowy",
              wartosc: (
                <>
                  {falownikAC.aparat.charakterystyka}
                  {falownikAC.aparat.In_A} {falownikAC.aparat.bieguny}
                </>
              ),
            },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">{falownikAC.kabel}</Badge>
          </div>
        </WynikGlowny>
      )}
      {!falownikAC.przekroj_mm2 && (
        <Alert variant="danger" role="note" className="mt-2">
          nie udało się dobrać przewodu AC
        </Alert>
      )}
    </Card>
  );
}
