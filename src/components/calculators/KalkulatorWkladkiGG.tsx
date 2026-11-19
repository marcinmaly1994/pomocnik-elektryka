import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { dobierzWkladkeGGOchrona } from "@/lib/calc/gGFuse";
import { formatLiczba } from "@/lib/calc/result";
import type { RodzajObwoduCzasu } from "@/lib/norms/conductors";
import { CZAS_GG_LABELS, TYP_WKLADKI_LABELS, type TypWkladkiGG } from "@/lib/norms/gGFuses";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { RODZAJ_OBWODU_HINT, RODZAJ_OBWODU_OPTIONS, UKLAD_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Dobór wkładki topikowej gG do warunku ochrony przeciwporażeniowej.
 *
 * Wydzielony z `CalculatorsTab` tym samym wzorcem co `KalkulatorImpedancji`: stan
 * siedzi w `useCalculatorsStore`, więc komponent bierze go sam i przyjmuje tylko tytuł.
 */
const TYP_WKLADKI_OPTIONS = (Object.entries(TYP_WKLADKI_LABELS) as [TypWkladkiGG, string][]).map(([value, label]) => ({ value, label }));

export function KalkulatorWkladkiGG({ label }: { label: string }) {
  const ggTyp = useCalculatorsStore((s) => s.ggTyp);
  const ggIb = useCalculatorsStore((s) => s.ggIb);
  const ggUklad = useCalculatorsStore((s) => s.ggUklad);
  const ggRodzajObwodu = useCalculatorsStore((s) => s.ggRodzajObwodu);
  const ggSprawdzZs = useCalculatorsStore((s) => s.ggSprawdzZs);
  const ggZmierzonaZs = useCalculatorsStore((s) => s.ggZmierzonaZs);
  const ggIz = useCalculatorsStore((s) => s.ggIz);
  const patch = useCalculatorsStore((s) => s.patch);

  const ggWkladka = useMemo(
    () =>
      dobierzWkladkeGGOchrona({
        typ: ggTyp,
        Ib_A: ggIb,
        uklad: ggUklad,
        rodzajObwodu: ggRodzajObwodu,
        zmierzonaZs_ohm: ggSprawdzZs ? ggZmierzonaZs : undefined,
        Iz_A: ggIz > 0 ? ggIz : undefined,
      }),
    [ggTyp, ggIb, ggUklad, ggRodzajObwodu, ggSprawdzZs, ggZmierzonaZs, ggIz]
  );

  return (
    <Card title={label} tag="wkładka topikowa">
      <Alert variant="info" role="note" className="mb-3 text-xs">
        Imax i Zs max pochodzą wprost z tablicy czasowo-prądowej wkładki (Poradnik Projektanta Elektryka,
        tabl. Z.10.3/Z.10.4) — NIE ze wzoru k×In jak dla wyłączników. Tablica pokrywa czasy 0,2 s / 0,4 s / 5 s;
        nie zawiera 1 s (obwód rozdzielczy w układzie TT) ani 0,1 s.
      </Alert>

      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Typ wkładki"
          value={ggTyp}
          onChange={(v) => patch({ ggTyp: v as TypWkladkiGG })}
          options={TYP_WKLADKI_OPTIONS}
        />
        <Field
          label="Prąd obliczeniowy Ib"
          value={ggIb}
          onChange={(v) => patch({ ggIb: Number(v) })}
          unit="A"
          hint="Prąd, jaki faktycznie popłynie tym obwodem przy pełnym obciążeniu."
        />
        <Field
          label="Układ sieci"
          value={ggUklad}
          onChange={(v) => patch({ ggUklad: v as "TN" | "TT" })}
          options={UKLAD_OPTIONS}
          hint="TN — przewód PE połączony z uziemionym punktem sieci (najczęstszy w Polsce). TT — własny uziom budynku, niezależny od sieci."
        />
        <Field
          label="Rodzaj obwodu"
          value={ggRodzajObwodu}
          onChange={(v) => patch({ ggRodzajObwodu: v as RodzajObwoduCzasu })}
          options={RODZAJ_OBWODU_OPTIONS}
          hint={RODZAJ_OBWODU_HINT}
        />
      </div>

      <label className="mb-2 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={ggSprawdzZs}
          onChange={(e) => patch({ ggSprawdzZs: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
        Oceń warunek ochronny wg zmierzonej/obliczonej impedancji pętli zwarcia
      </label>
      {ggSprawdzZs && (
        <Field
          label="Zmierzona impedancja pętli zwarcia Zs"
          value={ggZmierzonaZs}
          onChange={(v) => patch({ ggZmierzonaZs: Number(v) })}
          unit="Ω"
          step="0.01"
          hint="Wynik pomiaru pętli zwarcia L-PE miernikiem instalacyjnym w danym punkcie obwodu — albo wartość obliczona w kalkulatorze „Impedancja pętli zwarcia”."
        />
      )}
      <Field
        label="Obciążalność przewodu Iz"
        value={ggIz}
        onChange={(v) => patch({ ggIz: Number(v) })}
        unit="A"
        step="0.5"
        hint="Obciążalność długotrwała przewodu za wkładką, już po współczynnikach temperatury i grupowania — np. z kalkulatora „Dobór obwodu”. Do warunku przeciążeniowego I₂ ≤ 1,45·Iz. 0 = nie sprawdzaj."
      />

      {ggWkladka.wartosci && (
        // Wynikiem głównym jest sam prąd znamionowy („In 16 A”) — to liczba, której
        // szuka się na budowie. Pełna nazwa typu („D0gG (wkładka gwintowa, system D0)”)
        // w rozmiarze wyniku zawijała się na telefonie w trzy linie i spychała liczbę
        // na koniec; teraz stoi jako pierwszy znacznik pod wynikiem. Decyzja produktowa
        // do #269 (2026-11-10).
        <WynikGlowny
          wartosci={[
            {
              etykieta: "Dobrana wkładka",
              wartosc: <>In {ggWkladka.wartosci.In_A}</>,
              jednostka: "A",
            },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge>{TYP_WKLADKI_LABELS[ggTyp]}</Badge>
            <Badge variant="info">czas {CZAS_GG_LABELS[ggWkladka.wartosci.czas_s === 0.2 ? "0.2" : ggWkladka.wartosci.czas_s === 0.4 ? "0.4" : "5"]}</Badge>
            <Badge variant="accent">Imax (Ia) {formatLiczba(ggWkladka.wartosci.Imax_A, 1)} A</Badge>
            <Badge variant="success">Zs max {formatLiczba(ggWkladka.wartosci.ZsMax_ohm, 3)} Ω</Badge>
            <Badge variant="info">I₂ {formatLiczba(ggWkladka.wartosci.I2_A, 1)} A — wymaga Iz ≥ {formatLiczba(ggWkladka.wartosci.I2_A / 1.45, 1)} A</Badge>
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={ggWkladka} />
    </Card>
  );
}
