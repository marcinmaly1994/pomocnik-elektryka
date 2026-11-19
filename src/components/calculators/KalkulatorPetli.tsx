import { Alert } from "@/components/ui/alert";
import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { C_NAPIECIOWE } from "@/lib/norms/conductors";
import { BREAKER_RATINGS, U0 } from "@/lib/panel/norms";
import { ZAPAS_POMIAROWY, zsMaxForBreaker } from "@/lib/panel/sizing";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Impedancja pętli zwarcia (układ TN) — Zs max z Cmin = 0,95 dla wyłącznika B/C/D, zalecany
 * zapas odbiorczy 0,8·Zs max i prąd zwarcia z pomiaru. Te same stałe co dobór w Rozdzielnicy
 * i protokół pętli.
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorPetli({ label }: { label: string }) {
  const zCurve = useCalculatorsStore((s) => s.zCurve);
  const zIn = useCalculatorsStore((s) => s.zIn);
  const zMeasured = useCalculatorsStore((s) => s.zMeasured);
  // Zapis sprzed listy mógł mieć wartość spoza szeregu (np. 17) — liczymy i pokazujemy tę samą.
  const zInSzereg: number = (BREAKER_RATINGS as readonly number[]).includes(zIn) ? zIn : 16;
  const patch = useCalculatorsStore((s) => s.patch);
  const setZCurve = (v: string) => patch({ zCurve: v });
  const setZIn = (v: number) => patch({ zIn: v });
  const setZMeasured = (v: number) => patch({ zMeasured: v });

  // --- 3. impedancja pętli zwarcia ---
  const zCalc = useMemo(() => {
    const { ia, zsMax } = zsMaxForBreaker(zCurve, zInSzereg);
    /**
     * Prąd zwarcia liczony z Cmin = 0,95, nie z pełnego U0.
     *
     * Tu sprawdza się OCHRONĘ PRZECIWPORAŻENIOWĄ, a jej najgorszym przypadkiem jest
     * prąd NAJMNIEJSZY — ten, przy którym zabezpieczenie ma najtrudniej zadziałać.
     * Liczenie Ik z pełnych 230 V zawyżało go o 5% i mogło pokazać margines, którego
     * w rzeczywistości nie ma (PN-EN 60909-0; ten sam współczynnik co w `zsMaxDlaIa`).
     */
    const ik = zMeasured > 0 ? (C_NAPIECIOWE.min * U0) / zMeasured : 0;
    const zsZalecana = zsMax * ZAPAS_POMIAROWY;
    const zmierzona = zMeasured > 0 && zsMax > 0;
    return {
      ia,
      zsMax,
      zsZalecana,
      ik,
      ok: zmierzona ? zMeasured <= zsMax : null,
      // Drugi próg: wynik pomiaru bierze się z jednej chwili i zimnego przewodu,
      // a warunek ma być spełniony także po nagrzaniu i przy gorszym napięciu.
      okZalecany: zmierzona ? zMeasured <= zsZalecana : null,
      margines: zmierzona ? (1 - zMeasured / zsMax) * 100 : null,
    };
  }, [zCurve, zInSzereg, zMeasured]);

  return (
    <Card title={label} tag="ochrona przeciwporażeniowa">
      <div className="grid sm:grid-cols-3 gap-x-4">
        <Field
          label="Charakterystyka"
          value={zCurve}
          onChange={(v) => setZCurve(String(v))}
          options={[
            { value: "B", label: "B (5×In)" },
            { value: "C", label: "C (10×In)" },
            { value: "D", label: "D (20×In)" },
          ]}
          hint="Litera wydrukowana na wyłączniku obok prądu znamionowego (np. „B16”, „C16”) — B do zwykłych obwodów, C dla odbiorników z rozruchem silnikowym (pompy, lodówki), D dla silników o dużym prądzie rozruchowym."
        />
        {/* Lista szeregu znamionowego zamiast wolnej liczby: pole przyjmowało 17 A
            albo 0 A, a przy 0 wynik po prostu znikał bez słowa (audyt, B16). */}
        <Field
          label="Prąd znamionowy In"
          value={zInSzereg}
          onChange={(v) => setZIn(Number(v))}
          unit="A"
          options={BREAKER_RATINGS.map((r) => ({ value: String(r), label: `${r} A` }))}
        />
        <Field
          label="Zmierzona Zs"
          value={zMeasured}
          onChange={(v) => setZMeasured(Number(v))}
          unit="Ω"
          step="0.01"
          hint="Wynik pomiaru pętli zwarcia L-PE miernikiem instalacyjnym w danym punkcie obwodu. Zostaw puste/0, żeby zobaczyć samo Zs max bez oceny."
        />
      </div>
      <WynikGlowny
        wartosci={[
          { etykieta: "Prąd zadziałania Ia", wartosc: formatLiczba(zCalc.ia, 0), jednostka: "A" },
          // Dwa progi obok siebie, nie jeden: pierwszy to granica z normy, drugi —
          // z jakim zapasem powinien wyjść POMIAR, żeby obwód przeszedł odbiór
          // także przy nagrzanych przewodach i niższym napięciu sieci.
          // Brak danych to samo „—” bez jednostki, nie „— Ω”.
          {
            etykieta: "Zs max — limit normy",
            wartosc: zCalc.zsMax ? formatLiczba(zCalc.zsMax, 2) : "—",
            jednostka: zCalc.zsMax ? "Ω" : undefined,
            ton: "akcent",
          },
          {
            etykieta: "Zs — limit zalecany (0,8)",
            wartosc: zCalc.zsZalecana ? formatLiczba(zCalc.zsZalecana, 2) : "—",
            jednostka: zCalc.zsZalecana ? "Ω" : undefined,
            ton: "akcent",
          },
          {
            etykieta: "Prąd zwarcia Ik (c = 0,95)",
            wartosc: zCalc.ik ? formatLiczba(zCalc.ik, 0) : "—",
            jednostka: zCalc.ik ? "A" : undefined,
          },
        ]}
      />
      {zMeasured < 0 && (
        <Alert variant="danger" role="alert" className="mt-2">
          Impedancja pętli zwarcia nie może być ujemna — sprawdź wpisaną wartość. Zostaw 0, żeby zobaczyć samo Zs max
          bez oceny.
        </Alert>
      )}
      {zCalc.ok !== null && (
        /* role="status" jawnie: werdykt liczy się od nowa przy każdym wciśnięciu klawisza, a domyślny
          `alert` (wariant danger) czytałby czytnik ekranu na nowo po każdej cyfrze. */
        <Alert variant={!zCalc.ok ? "danger" : zCalc.okZalecany ? "success" : "caution"} role="status" className="mt-2 items-start">
          <span>
            {!zCalc.ok
              ? "Warunek niespełniony — zmierzona Zs przekracza limit normy. Skróć obwód, zwiększ przekrój lub zmień charakterystykę zabezpieczenia."
              : zCalc.okZalecany
                ? `Warunek spełniony z zapasem ${formatLiczba(zCalc.margines!, 0)}% — zabezpieczenie zadziała w wymaganym czasie.`
                : `Mieści się w normie, ale bez zapasu (do limitu ${formatLiczba(zCalc.margines!, 0)}%). Pomiar wykonuje się na zimnym przewodzie, a nagrzany ma większą rezystancję — po obciążeniu obwód może wypaść poza limit.`}
          </span>
        </Alert>
      )}
      <HowItWorks
        formulas={[
          { label: "Warunek samoczynnego wyłączenia zasilania", eq: "Zs × Ia ≤ U₀", where: "Zs — impedancja pętli zwarcia [Ω], Ia — prąd zadziałania [A], U₀ = 230 V" },
          { label: "Maksymalna dopuszczalna impedancja", eq: "Zs max = Cmin × U₀ / Ia", where: "Cmin = 0,95 (PN-EN 60909-0) — wartość, której zmierzona Zs nie może przekroczyć" },
          { label: "Prąd zadziałania wyzwalacza magnetycznego", eq: "Ia = k × In", where: "k = 5 dla char. B, 10 dla C, 20 dla D (górna granica pasma)" },
          { label: "Spodziewany prąd zwarcia", eq: "Ik = Cmin × U₀ / Zs", where: "najmniejszy prąd, jaki popłynie przy zwarciu L-PE" },
        ]}
        notes={[
          "Wymagany czas wyłączenia w układzie TN dla obwodów odbiorczych — z gniazdami do 63 A i z odbiornikami przyłączonymi na stałe do 32 A — wynosi 0,4 s, a dla obwodów rozdzielczych i odbiorczych powyżej tych granic — 5 s.",
          "Przyjęto górną granicę pasma wyzwalania magnetycznego, co jest podejściem bezpiecznym — rzeczywisty wyłącznik zadziała przy prądzie nie większym niż ta wartość.",
          "W praktyce pomiarowej często stosuje się dodatkowy zapas (np. mnożnik 0,8 dla Zs max), uwzględniający wzrost rezystancji przewodów przy nagrzaniu.",
          "Jeśli warunek nie jest spełniony, ochronę można też zapewnić wyłącznikiem różnicowoprądowym — dla RCD 30 mA warunek Zs jest znacznie łagodniejszy.",
          "Kalkulator dotyczy układu TN. Dla układu TT kryterium opiera się na rezystancji uziemienia, nie na impedancji pętli.",
        ]}
      />
    </Card>
  );
}
