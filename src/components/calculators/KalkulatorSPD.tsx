import { useMemo } from "react";
import { obliczKoordynacjeSPD, KATEGORIE_PRZEPIECIOWE, TYP_SPD_LABELS, type TypSPD } from "@/lib/calc/spd";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";

/**
 * Kalkulator koordynacji ograniczników przepięć.
 *
 * Trzeci z kalkulatorów wydzielonych z `CalculatorsTab` — patrz komentarz przy
 * `KalkulatorImpedancji`.
 */
/** Listy wyboru własne tego kalkulatora — nigdzie indziej nieużywane, więc zostają
 *  przy nim, a nie w module wspólnych opcji. */
const TYP_SPD_OPTIONS = (Object.entries(TYP_SPD_LABELS) as [TypSPD, string][]).map(([value, label]) => ({ value, label }));
const UW_OPTIONS = KATEGORIE_PRZEPIECIOWE.map((k) => ({
  value: String(k.Uw_V),
  label: `Kat. ${k.kategoria} — ${k.Uw_V} V (${k.opis})`,
}));

export function KalkulatorSPD({ label }: { label: string }) {
  const spdTyp = useCalculatorsStore((s) => s.spdTyp);
  const spdUp = useCalculatorsStore((s) => s.spdUp);
  const spdUw = useCalculatorsStore((s) => s.spdUw);
  const spdDlugosc = useCalculatorsStore((s) => s.spdDlugosc);
  const patch = useCalculatorsStore((s) => s.patch);

  const spd = useMemo(
    () => obliczKoordynacjeSPD({ typ: spdTyp, Up_V: spdUp, Uw_V: spdUw, dlugoscPrzewodow_m: spdDlugosc }),
    [spdTyp, spdUp, spdUw, spdDlugosc],
  );

  return (
    <Card title={label} tag="koordynacja ochrony">
      <div className="mb-3 rounded-md p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#2D5A8C10", color: "#2D5A8C" }}>
        Skuteczny poziom ochrony <strong>nie równa się Up z tabliczki</strong> — dochodzi do niego spadek
        indukcyjny na przewodach przyłączeniowych, rzędu 1 kV na metr przy udarze 8/20 µs. Stąd bierze się reguła
        „przewody ≤ 0,5 m”: to wynik rachunku, nie zalecenie montażowe.
      </div>

      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Typ ogranicznika"
          value={spdTyp}
          onChange={(v) => patch({ spdTyp: v as TypSPD })}
          options={TYP_SPD_OPTIONS}
        />
        <Field
          label="Poziom ochrony Up (z tabliczki)"
          value={spdUp}
          onChange={(v) => patch({ spdUp: Number(v) })}
          unit="V"
          hint="Napięciowy poziom ochrony ogranicznika — z jego tabliczki znamionowej albo karty katalogowej (oznaczenie „Up”)."
        />
        <Field
          label="Wytrzymałość udarowa urządzenia U_w"
          value={String(spdUw)}
          onChange={(v) => patch({ spdUw: Number(v) })}
          options={UW_OPTIONS}
          hint="Wpisz wartość z karty katalogowej chronionego urządzenia, jeśli ją znasz — w przeciwnym razie wybierz kategorię przepięciową odpowiadającą jego miejscu w instalacji (im dalej od wejścia, tym niższa kategoria i mniejsza wytrzymałość)."
        />
        <Field
          label="Długość przewodów przyłączeniowych (łącznie)"
          value={spdDlugosc}
          onChange={(v) => patch({ spdDlugosc: Number(v) })}
          unit="m"
          step="0.1"
          hint="Suma długości przewodu doprowadzającego i odprowadzającego ogranicznik (faza + PE) — nie tylko jednego z nich."
        />
      </div>

      {spd.wartosci && (
        <div className="mt-2 p-3 pe-result">
          <div className="text-xs text-slate-500 mb-1">Skuteczny poziom ochrony na zaciskach urządzenia</div>
          <div className="pe-mono text-lg text-blueprint">{formatLiczba(spd.wartosci.UpSkuteczne_V, 0)} V</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="pe-chip pe-tag-copper">
              przyrost na przewodach {formatLiczba(spd.wartosci.przyrostNaPrzewodach_V, 0)} V
            </span>
            <span className="pe-chip pe-tag-blue">U_w urządzenia {formatLiczba(spdUw, 0)} V</span>
            <span className="pe-chip pe-tag-green">
              maks. długość przewodów {formatLiczba(spd.wartosci.maksDlugosc_m, 2)} m
            </span>
          </div>
        </div>
      )}
      <CalcResultView wynik={spd} />
    </Card>
  );
}
