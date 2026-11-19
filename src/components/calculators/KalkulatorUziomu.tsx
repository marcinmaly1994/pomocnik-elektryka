import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { obliczUziom, type TypUziomu } from "@/lib/calc/earthing";
import { formatLiczba } from "@/lib/calc/result";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { CalcResultView } from "./CalcResultView";
import { Card } from "./Card";
import { Field } from "./Field";
import { GRUNT_OPTIONS, TYP_UZIOMU_OPTIONS } from "./opcje";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Uziom — dobór geometrii: pręt, bednarka, otok; układ n uziomów i potrzebna długość.
 * Silnik `lib/calc/earthing.ts`; rezystywność gruntu z tablicy ORIENTACYJNEJ albo z pomiaru.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorUziomu({ label }: { label: string }) {
  const uzTyp = useCalculatorsStore((s) => s.uzTyp);
  const uzRho = useCalculatorsStore((s) => s.uzRho);
  const uzDlugosc = useCalculatorsStore((s) => s.uzDlugosc);
  const uzSrednicaMm = useCalculatorsStore((s) => s.uzSrednicaMm);
  const uzSzerokoscMm = useCalculatorsStore((s) => s.uzSzerokoscMm);
  const uzGlebokosc = useCalculatorsStore((s) => s.uzGlebokosc);
  const uzLiczba = useCalculatorsStore((s) => s.uzLiczba);
  const uzEta = useCalculatorsStore((s) => s.uzEta);
  const uzWymagana = useCalculatorsStore((s) => s.uzWymagana);
  const patch = useCalculatorsStore((s) => s.patch);

  // --- uziom (geometria) ---
  // Średnica i szerokość podawane w MILIMETRACH (tak są w katalogach), silnik
  // liczy w metrach — konwersja tutaj, na granicy wejścia, zgodnie z zasadą
  // „SI w rdzeniu, konwersja tylko na wejściu/wyjściu" (spec pkt 3.1).
  const uziom = useMemo(
    () =>
      obliczUziom({
        typ: uzTyp,
        rho_ohm_m: uzRho,
        dlugosc_m: uzDlugosc,
        srednica_m: uzSrednicaMm / 1000,
        szerokosc_m: uzSzerokoscMm / 1000,
        glebokosc_m: uzGlebokosc,
        liczba: uzLiczba,
        wspWykorzystania: uzEta,
        wymagana_ohm: uzWymagana > 0 ? uzWymagana : undefined,
      }),
    [uzTyp, uzRho, uzDlugosc, uzSrednicaMm, uzSzerokoscMm, uzGlebokosc, uzLiczba, uzEta, uzWymagana]
  );

  return (
    <Card title={label} tag="geometria uziomu">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Typ uziomu"
          value={uzTyp}
          onChange={(v) => patch({ uzTyp: v as TypUziomu })}
          options={TYP_UZIOMU_OPTIONS}
        />
        <Field
          label="Rodzaj gruntu (wartości orientacyjne)"
          value={String(uzRho)}
          onChange={(v) => patch({ uzRho: Number(v) })}
          options={GRUNT_OPTIONS}
          hint="Skrót do pola „Rezystywność gruntu” niżej — wybierz najbliższy opis, żeby wstawić typową wartość. To tylko orientacyjny punkt startowy: do projektu wykonawczego rezystywność trzeba ZMIERZYĆ na działce."
        />
        <Field
          label="Rezystywność gruntu ρ"
          value={uzRho}
          onChange={(v) => patch({ uzRho: Number(v) })}
          unit="Ω·m"
          hint="Im mniejsza wartość, tym lepiej przewodzący grunt i mniejsza rezystancja uziomu. Z pomiaru miernikiem rezystywności gruntu — albo orientacyjnie z listy „Rodzaj gruntu” obok."
        />
        <Field
          label="Długość uziomu"
          value={uzDlugosc}
          onChange={(v) => patch({ uzDlugosc: Number(v) })}
          unit="m"
          step="0.1"
        />
        {uzTyp === "pionowy" && (
          <Field
            label="Średnica pręta"
            value={uzSrednicaMm}
            onChange={(v) => patch({ uzSrednicaMm: Number(v) })}
            unit="mm"
            hint="Średnica pręta uziomowego — typowo 16–20 mm dla prętów stalowych ocynkowanych/miedziowanych."
          />
        )}
        {uzTyp === "poziomy" && (
          <>
            <Field
              label="Szerokość bednarki"
              value={uzSzerokoscMm}
              onChange={(v) => patch({ uzSzerokoscMm: Number(v) })}
              unit="mm"
              hint="Szerokość taśmy (bednarki) uziomowej — typowo 25 lub 30 mm."
            />
            <Field
              label="Głębokość ułożenia"
              value={uzGlebokosc}
              onChange={(v) => patch({ uzGlebokosc: Number(v) })}
              unit="m"
              step="0.1"
              hint="Głębokość, na jakiej bednarka leży w wykopie — typowo 0,6–0,8 m, poniżej strefy przemarzania."
            />
          </>
        )}
        <Field
          label="Liczba uziomów równolegle"
          value={uzLiczba}
          onChange={(v) => patch({ uzLiczba: Number(v) })}
          step="1"
          hint="Ile identycznych uziomów połączono ze sobą — więcej obniża wypadkową rezystancję, ale coraz mniej przy zbyt bliskim rozstawie (patrz współczynnik wykorzystania η niżej)."
        />
        {uzLiczba > 1 && (
          <Field
            label="Wsp. wykorzystania η (0,6–0,9)"
            value={uzEta}
            onChange={(v) => patch({ uzEta: Number(v) })}
            step="0.05"
            hint="Im uziomy stoją bliżej siebie, tym bardziej sobie „przeszkadzają” i tym niższą wartość przyjmij z zakresu 0,6–0,9. Przy rozstawie większym niż dwie długości uziomu bliżej 0,9."
          />
        )}
        <Field
          label="Wymagana rezystancja (0 = bez oceny)"
          value={uzWymagana}
          onChange={(v) => patch({ uzWymagana: Number(v) })}
          unit="Ω"
          hint="Docelowa maksymalna rezystancja uziemienia, np. z warunku ochrony w układzie TT (patrz kalkulator „Rezystancja uziemienia”) albo z wymagań instalacji odgromowej. Zostaw 0, żeby policzyć samą rezystancję bez oceny."
        />
      </div>

      {uziom.wartosci && (
        <WynikGlowny
          wartosci={[
            { etykieta: "Rezystancja uziemienia", wartosc: formatLiczba(uziom.wartosci.R_wypadkowa_ohm, 2), jednostka: "Ω" },
          ]}
        >
          <div className="flex gap-2 flex-wrap">
            {uzLiczba > 1 && (
              <Badge variant="accent">
                pojedynczy {formatLiczba(uziom.wartosci.R_pojedynczy_ohm, 2)} Ω
              </Badge>
            )}
            {uziom.wartosci.potrzebnaDlugosc_m !== null && (
              <Badge variant="success">
                długość dla {formatLiczba(uzWymagana, 0)} Ω: {formatLiczba(uziom.wartosci.potrzebnaDlugosc_m, 1)} m
              </Badge>
            )}
          </div>
        </WynikGlowny>
      )}
      <CalcResultView wynik={uziom} />
    </Card>
  );
}
