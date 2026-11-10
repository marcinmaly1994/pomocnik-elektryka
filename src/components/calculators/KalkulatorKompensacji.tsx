import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { obliczKompensacje, UKLAD_BATERII_LABELS, type UkladBaterii } from "@/lib/calc/powerFactor";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";

/**
 * Kalkulator kompensacji mocy biernej.
 *
 * Kolejny z kalkulatorów wydzielonych z `CalculatorsTab` — patrz komentarz przy
 * `KalkulatorImpedancji`. Stan siedzi w `useCalculatorsStore`, więc komponent bierze go
 * sam i przyjmuje tylko tytuł karty.
 */
/** Lista wyboru własna tego kalkulatora — nigdzie indziej nieużywana, więc zostaje przy nim. */
const UKLAD_BATERII_OPTIONS = (Object.entries(UKLAD_BATERII_LABELS) as [UkladBaterii, string][]).map(([value, label]) => ({
  value,
  label,
}));

export function KalkulatorKompensacji({ label }: { label: string }) {
  const kmPkW = useCalculatorsStore((s) => s.kmPkW);
  const kmCos1 = useCalculatorsStore((s) => s.kmCos1);
  const kmCos2 = useCalculatorsStore((s) => s.kmCos2);
  const kmUV = useCalculatorsStore((s) => s.kmUV);
  const kmUklad = useCalculatorsStore((s) => s.kmUklad);
  const kmSkKVA = useCalculatorsStore((s) => s.kmSkKVA);
  const patch = useCalculatorsStore((s) => s.patch);

  const kompensacja = useMemo(
    () =>
      obliczKompensacje({
        P_W: kmPkW * 1000,
        cosfi1: kmCos1,
        cosfi2: kmCos2,
        napiecie_V: kmUV,
        czestotliwosc_Hz: 50,
        uklad: kmUklad,
        Sk_VA: kmSkKVA > 0 ? kmSkKVA * 1000 : undefined,
      }),
    [kmPkW, kmCos1, kmCos2, kmUV, kmUklad, kmSkKVA]
  );

  return (
    <Card title={label} tag="moc bierna">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Moc czynna odbioru"
          value={kmPkW}
          onChange={(v) => patch({ kmPkW: Number(v) })}
          unit="kW"
        />
        <Field
          label="Napięcie (międzyfazowe)"
          value={kmUV}
          onChange={(v) => patch({ kmUV: Number(v) })}
          unit="V"
          hint="Napięcie międzyfazowe sieci zasilającej — w Polsce standardowo 400 V."
        />
        <Field
          label="cos φ przed kompensacją"
          value={kmCos1}
          onChange={(v) => patch({ kmCos1: Number(v) })}
          step="0.01"
          hint="Obecny współczynnik mocy instalacji — z pomiaru analizatorem sieci albo z faktury za energię (zakład energetyczny często go tam podaje, jeśli nalicza opłatę za energię bierną)."
        />
        <Field
          label="cos φ docelowy"
          value={kmCos2}
          onChange={(v) => patch({ kmCos2: Number(v) })}
          step="0.01"
          hint="Współczynnik mocy, jaki chcesz uzyskać po kompensacji — zwykle 0,93–0,95, żeby uniknąć opłat za energię bierną (sprawdź próg w umowie z operatorem)."
        />
        <Field
          label="Układ połączeń baterii"
          value={kmUklad}
          onChange={(v) => patch({ kmUklad: v as UkladBaterii })}
          options={UKLAD_BATERII_OPTIONS}
        />
        <Field
          label="Moc zwarciowa Sk (0 = nie sprawdzaj rezonansu)"
          value={kmSkKVA}
          onChange={(v) => patch({ kmSkKVA: Number(v) })}
          unit="kVA"
          hint="Moc zwarciowa sieci w punkcie przyłączenia baterii — podaje ją zakład energetyczny w warunkach przyłączenia, albo policzysz ją z impedancji transformatora (kalkulator „Prądy zwarciowe”: Sk ≈ Un²/Zk). Potrzebna do sprawdzenia ryzyka rezonansu z harmonicznymi."
        />
      </div>

      {kompensacja.wartosci && (
        <div className="mt-2 p-3 pe-result">
          <div className="text-xs text-slate-500 mb-1">Wymagana moc baterii kondensatorów</div>
          <div className="pe-mono text-lg text-blueprint">{formatLiczba(kompensacja.wartosci.Qc_var / 1000, 2)} kvar</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <Badge variant="accent">
              C = {formatLiczba(kompensacja.wartosci.C_F * 1e6, 1)} µF
              {kmUklad === "trojkat" ? " / gałąź" : ""}
            </Badge>
            <Badge variant="info">tgφ₁ = {formatLiczba(kompensacja.wartosci.tgfi1, 3)}</Badge>
            <Badge variant="info">tgφ₂ = {formatLiczba(kompensacja.wartosci.tgfi2, 3)}</Badge>
            {kompensacja.wartosci.rzadRezonansu !== null && (
              <Badge variant="success">
                rezonans przy n ≈ {formatLiczba(kompensacja.wartosci.rzadRezonansu, 2)}
              </Badge>
            )}
          </div>
        </div>
      )}

      <CalcResultView wynik={kompensacja} />
    </Card>
  );
}
