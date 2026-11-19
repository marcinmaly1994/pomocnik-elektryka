import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { calcLighting } from "@/lib/electrical";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Dobór oświetlenia — potrzebny strumień świetlny i liczba opraw metodą sprawności
 * (`calcLighting` z `lib/electrical`).
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorOswietlenia({ label }: { label: string }) {
  const roomA = useCalculatorsStore((s) => s.roomA);
  const lux = useCalculatorsStore((s) => s.lux);
  const lumPerOpr = useCalculatorsStore((s) => s.lumPerOpr);
  const mf = useCalculatorsStore((s) => s.mf);
  const uf = useCalculatorsStore((s) => s.uf);
  const patch = useCalculatorsStore((s) => s.patch);
  const setRoomA = (v: number) => patch({ roomA: v });
  const setLux = (v: number) => patch({ lux: v });
  const setLumPerOpr = (v: number) => patch({ lumPerOpr: v });
  const setMf = (v: number) => patch({ mf: v });
  const setUf = (v: number) => patch({ uf: v });

  // --- 6. oświetlenie ---
  const lightCalc = useMemo(
    () =>
      calcLighting({
        roomAreaM2: roomA,
        luxRequired: lux,
        lumensPerFixture: lumPerOpr,
        maintenanceFactor: mf,
        utilizationFactor: uf,
      }),
    [roomA, lux, lumPerOpr, mf, uf]
  );

  return (
    <Card title={label} tag="natężenie oświetlenia">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Powierzchnia pomieszczenia"
          value={roomA}
          onChange={(v) => setRoomA(Number(v))}
          unit="m²"
        />
        <Field
          label="Wymagane natężenie"
          value={lux}
          onChange={(v) => setLux(Number(v))}
          unit="lx"
          hint="Docelowe natężenie oświetlenia na płaszczyźnie roboczej — orientacyjne wartości podane pod wynikiem (np. 150–300 lx dla pokoju dziennego, 500 lx dla blatu w kuchni)."
        />
        <Field
          label="Strumień jednej oprawy"
          value={lumPerOpr}
          onChange={(v) => setLumPerOpr(Number(v))}
          unit="lm"
          hint="Strumień świetlny pojedynczej oprawy — z karty katalogowej albo opakowania żarówki/opraw LED (oznaczenie „lm”, nie moc w watach)."
        />
        <Field
          label="Wsp. utrzymania (MF)"
          value={mf}
          onChange={(v) => setMf(Number(v))}
          step="0.05"
          hint="Uwzględnia spadek strumienia świetlnego w czasie (starzenie się źródeł, zabrudzenie opraw) — typowo 0,8 dla pomieszczeń czyszczonych regularnie."
        />
        <Field
          label="Wsp. wykorzystania (UF)"
          value={uf}
          onChange={(v) => setUf(Number(v))}
          step="0.05"
          hint="Zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6."
        />
      </div>
      <WynikGlowny
        wartosci={[
          { etykieta: "Wymagany strumień całkowity", wartosc: formatLiczba(lightCalc.requiredLumens, 0), jednostka: "lm" },
          { etykieta: "Liczba opraw", wartosc: Math.ceil(lightCalc.fixtureCount) || 0, jednostka: "szt." },
        ]}
      />
      <div className="text-xs text-slate-500 mt-2">
        Orientacyjne wymagania: pokój dzienny 150–300 lx, kuchnia (blat) 500 lx, łazienka 200–300 lx, biuro 500 lx, korytarz 100 lx.
      </div>
      <HowItWorks
        formulas={[
          { label: "Metoda strumienia świetlnego", eq: "Φ = (E × A) / (UF × MF)", where: "E — wymagane natężenie [lx], A — powierzchnia [m²], UF — wsp. wykorzystania, MF — wsp. utrzymania" },
          { label: "Liczba opraw", eq: "n = Φ / Φ_oprawy", where: "Φ_oprawy — strumień świetlny jednej oprawy [lm] z karty katalogowej" },
        ]}
        notes={[
          "Współczynnik wykorzystania UF zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6.",
          "Współczynnik utrzymania MF uwzględnia starzenie źródeł i zabrudzenie opraw — dla LED w warunkach domowych zwykle 0,8.",
          "Metoda daje średnie natężenie na płaszczyźnie roboczej. Nie zastępuje obliczeń rozkładu światła, gdy istotna jest równomierność lub olśnienie.",
          "Wynik zaokrąglaj w górę i rozmieszczaj oprawy równomiernie — odległość między nimi nie powinna przekraczać ok. 1,5× wysokości zawieszenia nad płaszczyzną roboczą.",
        ]}
      />
    </Card>
  );
}
