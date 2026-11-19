import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { obliczSpadekNapiecia } from "@/lib/calc/voltageDrop";
import type { Izolacja, Material, ModelRezystywnosci, RodzajLinii } from "@/lib/norms/conductors";
import { U0 } from "@/lib/panel/norms";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { IZOLACJA_OPTIONS, LIMIT_SPADKU_OPCJE, MATERIAL_OPTIONS, MODEL_REZ_OPTIONS, PHASE_OPTIONS, RODZAJ_LINII_OPTIONS, SZEREG_PELNY_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Spadek napięcia na trasie o znanym przekroju — silnik `lib/calc/voltageDrop.ts`:
 * model rezystywności (zał. G albo temperaturowy), metoda pełna z reaktancją, przewody
 * równoległe i ocena z progiem „graniczny”.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorSpadku({ label }: { label: string }) {
  const duCurrentA = useCalculatorsStore((s) => s.duCurrentA);
  const duPhase = useCalculatorsStore((s) => s.duPhase);
  const duLength = useCalculatorsStore((s) => s.duLength);
  const duSection = useCalculatorsStore((s) => s.duSection);
  const duLimitPct = useCalculatorsStore((s) => s.duLimitPct);
  const duMaterial = useCalculatorsStore((s) => s.duMaterial);
  const duIzolacja = useCalculatorsStore((s) => s.duIzolacja);
  const duCosfi = useCalculatorsStore((s) => s.duCosfi);
  const duZReaktancja = useCalculatorsStore((s) => s.duZReaktancja);
  const duRodzajLinii = useCalculatorsStore((s) => s.duRodzajLinii);
  const duRownolegle = useCalculatorsStore((s) => s.duRownolegle);
  const duModel = useCalculatorsStore((s) => s.duModel);
  const patch = useCalculatorsStore((s) => s.patch);
  const setDuCurrentA = (v: number) => patch({ duCurrentA: v });
  const setDuPhase = (v: "1" | "3") => patch({ duPhase: v });
  const setDuLength = (v: number) => patch({ duLength: v });
  const setDuSection = (v: number) => patch({ duSection: v });
  const setDuLimitPct = (v: number) => patch({ duLimitPct: v });

  const spadekPelny = useMemo(
    () =>
      obliczSpadekNapiecia({
        uklad: duPhase === "3" ? "3f" : "1f",
        napiecie_V: duPhase === "3" ? 400 : U0,
        prad_A: duCurrentA,
        cosfi: duCosfi,
        dlugosc_m: duLength,
        material: duMaterial,
        przekroj_mm2: duSection,
        izolacja: duIzolacja,
        zReaktancja: duZReaktancja,
        rodzajLinii: duRodzajLinii,
        rownolegle: duRownolegle,
        limit_pct: duLimitPct,
        modelRezystywnosci: duModel,
      }),
    [duPhase, duCurrentA, duCosfi, duLength, duMaterial, duSection, duIzolacja, duZReaktancja, duRodzajLinii, duRownolegle, duLimitPct, duModel]
  );

  return (
    <Card title={label} tag="sprawdzenie trasy">
      <Alert variant="info" role="note" className="mb-3 text-xs">
        Ten kalkulator sprawdza trasę o <strong>znanym przekroju</strong> — np. kabel, który już jest ułożony
        albo narzucony z góry. Jeśli dopiero dobierasz przewód, użyj „Dobór obwodu”: tam przekrój
        jest wynikiem, dobieranym pod obciążalność i spadek naraz.
      </Alert>

      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Prąd obciążenia (Ib)"
          value={duCurrentA}
          onChange={(v) => setDuCurrentA(Number(v))}
          unit="A"
          step="0.1"
          hint="Prąd, jaki faktycznie popłynie tą trasą przy pełnym obciążeniu — z bilansu mocy odbiorników albo z pomiaru."
        />
        <Field
          label="Zasilanie"
          value={duPhase}
          onChange={(v) => setDuPhase(v as "1" | "3")}
          options={PHASE_OPTIONS}
        />
        <Field
          label="Współczynnik cos φ"
          value={duCosfi}
          onChange={(v) => patch({ duCosfi: Number(v) })}
          step="0.05"
          hint="Współczynnik mocy odbiornika — z tabliczki znamionowej. Nie znasz wartości? Zobacz podpowiedź w kalkulatorze „Dobór obwodu”: 1,0 dla grzałek, niżej dla silników i elektroniki."
        />
        <Field
          label="Długość trasy (w jedną stronę)"
          value={duLength}
          onChange={(v) => setDuLength(Number(v))}
          unit="m"
        />
        <Field
          label="Przekrój żyły"
          value={String(duSection)}
          onChange={(v) => setDuSection(Number(v))}
          options={SZEREG_PELNY_OPTIONS}
        />
        <Field
          label="Materiał żyły"
          value={duMaterial}
          onChange={(v) => patch({ duMaterial: v as Material })}
          options={MATERIAL_OPTIONS}
        />
        <Field
          label="Izolacja (temperatura pracy)"
          value={duIzolacja}
          onChange={(v) => patch({ duIzolacja: v as Izolacja })}
          options={IZOLACJA_OPTIONS}
          hint="Sprawdź na oznaczeniu kabla (np. YDY/YKY to PVC, YKYFtms/YKXS to XLPE) — wpływa nieznacznie na rezystywność przy modelu temperaturowym."
        />
        <Field
          label="Przewody równoległe na fazę"
          value={duRownolegle}
          onChange={(v) => patch({ duRownolegle: Number(v) })}
          step="1"
        />
        <Field
          label="Dopuszczalny spadek napięcia"
          value={String(duLimitPct)}
          onChange={(v) => setDuLimitPct(Number(v))}
          options={LIMIT_SPADKU_OPCJE}
        />
        {/* Wybór modelu rezystywności stoi jawnie w formularzu, bo to on
            decyduje o zgodności z doborem w Rozdzielnicy — patrz
            `ModelRezystywnosci`. Domyślne uproszczenie zał. G daje
            identyczny wynik jak dobór obwodów; model temperaturowy jest
            ok. 5% mniej konserwatywny i na styku limitu może dopuścić
            cieńszy przewód, więc użytkownik ma to wybierać świadomie. */}
        <Field
          label="Model rezystywności"
          value={duModel}
          onChange={(v) => patch({ duModel: v as ModelRezystywnosci })}
          options={MODEL_REZ_OPTIONS}
          hint="Jak dokładnie liczyć rezystywność miedzi/aluminium w warunkach ruchowych. Zostaw domyślne uproszczenie normy, żeby wynik zgadzał się z automatycznym doborem w Rozdzielnicy."
        />
      </div>

      {/* Metoda pełna jest OBOWIĄZKOWA od 35 mm² (spec pkt 7) — silnik zwraca
          wtedy twardy błąd zamiast liczyć dalej, więc checkbox musi być
          widoczny obok pola przekroju, a nie schowany w opcjach. */}
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={duZReaktancja}
          onChange={(e) => patch({ duZReaktancja: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Uwzględnij reaktancję (metoda pełna — wymagana dla przekrojów od 35 mm²)
      </label>
      {duZReaktancja && (
        <Field
          label="Rodzaj linii (reaktancja jednostkowa X′)"
          value={duRodzajLinii}
          onChange={(v) => patch({ duRodzajLinii: v as RodzajLinii })}
          options={RODZAJ_LINII_OPTIONS}
          hint="Jak fizycznie wygląda trasa — kabel wielożyłowy w jednej powłoce, kable jednożyłowe osobno, czy linia napowietrzna. Wybierz opis najbliższy rzeczywistości; przy kablach jednożyłowych i liniach gołych realna wartość zależy dodatkowo od rozstawu żył."
        />
      )}

      {spadekPelny.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Spadek napięcia na trasie", wartosc: formatLiczba(spadekPelny.wartosci.spadek_pct, 2), jednostka: "%" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">ΔU {formatLiczba(spadekPelny.wartosci.spadek_V, 2)} V</Badge>
            <Badge variant="info">
              napięcie u odbiornika {formatLiczba(spadekPelny.wartosci.napiecieKoncowe_V, 1)} V
            </Badge>
            {spadekPelny.wartosci.minPrzekroj_mm2 !== null && (
              <Badge variant="success">
                min. przekrój w limicie {String(spadekPelny.wartosci.minPrzekroj_mm2).replace(".", ",")} mm²
              </Badge>
            )}
          </div>
        </WynikGlowny>
      )}

      <CalcResultView wynik={spadekPelny} />
    </Card>
  );
}
