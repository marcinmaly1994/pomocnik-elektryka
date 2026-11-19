import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { obliczSilnik, type SposobRozruchu } from "@/lib/calc/motor";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { ROZRUCH_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Silnik indukcyjny — prąd znamionowy, rozruch (bezpośredni, gwiazda-trójkąt, softstart),
 * dobór zabezpieczenia i klasy wyzwalania, spadek napięcia przy rozruchu. Silnik `lib/calc/motor.ts`.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorSilnika({ label }: { label: string }) {
  const slMocKW = useCalculatorsStore((s) => s.slMocKW);
  const slUn = useCalculatorsStore((s) => s.slUn);
  const slCosfi = useCalculatorsStore((s) => s.slCosfi);
  const slSprawnosc = useCalculatorsStore((s) => s.slSprawnosc);
  const slKrotnosc = useCalculatorsStore((s) => s.slKrotnosc);
  const slRozruch = useCalculatorsStore((s) => s.slRozruch);
  const slCzasRozruchu = useCalculatorsStore((s) => s.slCzasRozruchu);
  const slImpedancja = useCalculatorsStore((s) => s.slImpedancja);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- silnik indukcyjny ---
  const silnik = useMemo(
    () =>
      obliczSilnik({
        moc_W: slMocKW * 1000,
        Un_V: slUn,
        cosfi: slCosfi,
        sprawnosc: slSprawnosc,
        krotnoscRozruchu: slKrotnosc,
        sposobRozruchu: slRozruch,
        czasRozruchu_s: slCzasRozruchu > 0 ? slCzasRozruchu : undefined,
        impedancjaObwodu_ohm: slImpedancja > 0 ? slImpedancja : undefined,
      }),
    [slMocKW, slUn, slCosfi, slSprawnosc, slKrotnosc, slRozruch, slCzasRozruchu, slImpedancja]
  );

  return (
    <Card title={label} tag="rozruch i zabezpieczenia">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Moc na wale"
          value={slMocKW}
          onChange={(v) => patch({ slMocKW: Number(v) })}
          unit="kW"
          step="0.1"
          hint="Moc MECHANICZNA silnika z tabliczki znamionowej (oznaczenie „Pn” albo „kW”) — to NIE jest moc pobierana z sieci, ta jest o 1/η większa."
        />
        <Field
          label="Napięcie międzyfazowe"
          value={slUn}
          onChange={(v) => patch({ slUn: Number(v) })}
          unit="V"
          hint="Napięcie znamionowe silnika z tabliczki — dla silnika 3-fazowego w Polsce zwykle 400 V (połączenie w gwiazdę)."
        />
        <Field
          label="Współczynnik mocy cos φ"
          value={slCosfi}
          onChange={(v) => patch({ slCosfi: Number(v) })}
          step="0.01"
          hint="Z tabliczki znamionowej silnika (oznaczenie „cos φ”) — typowo 0,80–0,90 dla silników klatkowych przy pełnym obciążeniu."
        />
        <Field
          label="Sprawność η"
          value={slSprawnosc}
          onChange={(v) => patch({ slSprawnosc: Number(v) })}
          step="0.01"
          hint="Sprawność silnika z tabliczki znamionowej (oznaczenie „η”, w procentach — wpisz jako ułamek, np. 0,88 dla 88%)."
        />
        <Field
          label="Krotność prądu rozruchowego (z tabliczki)"
          value={slKrotnosc}
          onChange={(v) => patch({ slKrotnosc: Number(v) })}
          step="0.5"
          hint="Stosunek Ir/In z tabliczki znamionowej (oznaczenie „Ir/In” albo „Isr/In”) — dla silników klatkowych zwykle 5–8. Nie zgaduj: poza tym zakresem odczytaj wartość wprost z tabliczki."
        />
        <Field
          label="Sposób rozruchu"
          value={slRozruch}
          onChange={(v) => patch({ slRozruch: v as SposobRozruchu })}
          options={ROZRUCH_OPTIONS}
          hint="Jak silnik jest uruchamiany — bezpośredni (DOL) daje pełny prąd i moment rozruchowy; gwiazda-trójkąt obniża oba do 1/3, więc nadaje się tylko do napędów ruszających bez dużego obciążenia."
        />
        <Field
          label="Czas rozruchu (0 = pomiń)"
          value={slCzasRozruchu}
          onChange={(v) => patch({ slCzasRozruchu: Number(v) })}
          unit="s"
          step="0.5"
          hint="Ile realnie trwa rozruch tego napędu — z pomiaru albo doświadczenia z podobną maszyną. Potrzebne do doboru klasy wyzwalania przekaźnika termicznego."
        />
        <Field
          label="Impedancja obwodu zasilającego (0 = pomiń)"
          value={slImpedancja}
          onChange={(v) => patch({ slImpedancja: Number(v) })}
          unit="Ω"
          step="0.01"
          hint="Impedancja przewodu i źródła od rozdzielnicy do silnika — policzysz ją w kalkulatorze „Impedancja przewodu”. Potrzebna do sprawdzenia spadku napięcia w chwili rozruchu."
        />
      </div>

      {silnik.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Prąd znamionowy silnika", wartosc: formatLiczba(silnik.wartosci.In_A, 2), jednostka: "A" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            <Badge variant="accent">prąd rozruchowy {formatLiczba(silnik.wartosci.Ir_A, 1)} A</Badge>
            {slRozruch === "gwiazda_trojkat" && (
              <Badge variant="info">
                przy DOL byłoby {formatLiczba(silnik.wartosci.Ir_bezposredni_A, 1)} A
              </Badge>
            )}
            <Badge variant="info">stycznik AC-3 ≥ {formatLiczba(silnik.wartosci.stycznikAC3_A, 1)} A</Badge>
            {silnik.wartosci.klasaWyzwalania && (
              <Badge variant="success">przekaźnik klasy {silnik.wartosci.klasaWyzwalania}</Badge>
            )}
            <Badge>
              moment {formatLiczba(silnik.wartosci.momentWzgledny * 100, 0)}% momentu przy DOL
            </Badge>
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={silnik} />
    </Card>
  );
}
