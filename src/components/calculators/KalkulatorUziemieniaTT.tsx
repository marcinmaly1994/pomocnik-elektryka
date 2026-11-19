import { Alert } from "@/components/ui/alert";
import { useMemo } from "react";
import { formatLiczba } from "@/lib/calc/result";
import { maxGroundingResistance, UL } from "@/lib/electrical";
import { useCalculatorsStore } from "@/store/useCalculatorsStore";
import { Card } from "./Card";
import { Field } from "./Field";
import { HowItWorks } from "./HowItWorks";
import { WynikGlowny } from "./WynikGlowny";

/**
 * Rezystancja uziemienia w układzie TT — warunek RA·IΔn ≤ UL (PN-HD 60364-4-41, 411.5.3).
 *
 * Wydzielony z `CalculatorsTab` wzorcem `KalkulatorImpedancji`: stan bierze sam ze store'a.
 */
export function KalkulatorUziemieniaTT({ label }: { label: string }) {
  const ttIdnMa = useCalculatorsStore((s) => s.ttIdnMa);
  const ttMeasuredRa = useCalculatorsStore((s) => s.ttMeasuredRa);
  const patch = useCalculatorsStore((s) => s.patch);
  const setTtIdnMa = (v: number) => patch({ ttIdnMa: v });
  const setTtMeasuredRa = (v: number) => patch({ ttMeasuredRa: v });

  // --- 5. rezystancja uziemienia (układ TT) ---
  const groundingCheck = useMemo(() => {
    const raMax = maxGroundingResistance(ttIdnMa / 1000);
    return { raMax, ok: raMax > 0 && ttMeasuredRa > 0 ? ttMeasuredRa <= raMax : null };
  }, [ttIdnMa, ttMeasuredRa]);

  return (
    <Card title={label} tag="ochrona przeciwporażeniowa">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field
          label="Prąd różnicowy RCD (IΔn)"
          value={ttIdnMa}
          onChange={(v) => setTtIdnMa(Number(v))}
          options={[
            { value: "30", label: "30 mA" },
            { value: "100", label: "100 mA" },
            { value: "300", label: "300 mA" },
            { value: "500", label: "500 mA" },
          ]}
          hint="Prąd zadziałania wyłącznika różnicowoprądowego chroniącego ten obwód — sprawdź na obudowie RCD (oznaczenie „IΔn”). 30 mA to standard dla obwodów odbiorczych, wyższe wartości typowe dla wyłączników na początku instalacji."
        />
        <Field
          label="Zmierzona rezystancja uziemienia RA"
          value={ttMeasuredRa}
          onChange={(v) => setTtMeasuredRa(Number(v))}
          unit="Ω"
          step="0.5"
          hint="Wynik pomiaru uziomu miernikiem rezystancji uziemienia — patrz protokół „Pomiar rezystancji uziemienia” w zakładce Protokoły."
        />
      </div>
      <WynikGlowny
        wartosci={[
          { etykieta: "Maksymalna dopuszczalna RA", wartosc: formatLiczba(groundingCheck.raMax, 0), jednostka: "Ω", ton: "akcent" },
        ]}
      />
      {groundingCheck.ok !== null && (
        /* role="status" jawnie: wynik przelicza się przy każdej zmianie pola, a `alert` (wariant danger)
            przerywałby czytnikowi ekranu przy każdym znaku. */
        <Alert variant={groundingCheck.ok ? "success" : "danger"} role="status" className="mt-2">
          {groundingCheck.ok
            ? "Warunek spełniony — RCD zadziała, zanim napięcie dotykowe przekroczy 50 V."
            : "Warunek niespełniony — zmierzona RA przekracza wartość dopuszczalną. Popraw uziom (dodatkowy uziomik, głębsze wbicie) albo zastosuj RCD o niższym IΔn."}
        </Alert>
      )}
      <HowItWorks
        formulas={[
          { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: `RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = ${UL} V` },
          { label: "Maksymalna dopuszczalna rezystancja uziemienia", eq: "RA max = UL / IΔn", where: "wartość, której zmierzona RA nie może przekroczyć" },
        ]}
        notes={[
          "W układzie TT (w przeciwieństwie do TN — patrz „Impedancja pętli zwarcia”) skuteczność ochrony nie zależy od impedancji pętli zwarcia, tylko od rezystancji uziomu i prądu różnicowego wyłącznika, który ten uziom chroni.",
          "Im niższy prąd IΔn wyłącznika różnicowoprądowego, tym łagodniejsze wymaganie wobec uziemienia — dla typowego RCD 30 mA wystarczy RA ≤ 1667 Ω, co w praktyce spełnia niemal każdy uziom.",
          "300-500 mA to typowe wartości dla wyłączników różnicowoprądowych na początku instalacji (ochrona przeciwpożarowa, selektywność względem RCD 30 mA na obwodach odbiorczych) — tam wymaganie wobec RA jest już wyraźnie ostrzejsze.",
          "Pomiar wykonuje się miernikiem rezystancji uziemienia (metoda techniczna, udarowa albo cęgowa) — patrz protokół „Pomiar rezystancji uziemienia” w zakładce Protokoły.",
        ]}
      />
    </Card>
  );
}
