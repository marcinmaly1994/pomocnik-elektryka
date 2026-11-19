import { ChevronRight } from "lucide-react";
import { Card } from "./Card";
import { HowItWorks } from "./HowItWorks";

/**
 * Dobór wyłącznika różnicowoprądowego — lista zasad, bez obliczeń.
 *
 * Wydzielony z `CalculatorsTab`; nie ma stanu, przyjmuje tylko tytuł karty.
 */
export function KalkulatorRCD({ label }: { label: string }) {
  return (
    <Card title={label} tag="lista kontrolna">
      {/* Lista zasad, nie kalkulator — mówimy to wprost, żeby nikt nie szukał tu wyniku.
          Treść poprawiona po audycie 2026-11-04 (B14): typ A zamiast „AC/A" (spójnie
          z doborem w Rozdzielnicy), SPD nazwany po imieniu, reguła liczby obwodów
          oznaczona jako praktyka, a nie wymóg normy. */}
      <p className="mb-3 text-sm text-slate-500">
        Zasady doboru do sprawdzenia przy projekcie — bez obliczeń. Typ RCD dla konkretnego obwodu podaje „Dobór obwodu”
        i tabela doboru w Rozdzielnicy.
      </p>
      <ul className="text-sm space-y-2.5 text-slate-700">
        <li className="flex gap-2">
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Obwody gniazd wtyczkowych do 32 A — RCD 30 mA (PN-HD 60364-4-41, ochrona uzupełniająca). Typ A jako minimum: zasilacze impulsowe i elektronika w odbiornikach dają prąd różnicowy pulsujący, na który typ AC nie reaguje.
        </li>
        <li className="flex gap-2">
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Łazienka, kuchnia, tarasy — RCD 30 mA, zalecany osobny obwód i osobna ochrona.
        </li>
        <li className="flex gap-2">
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Pralka, pompa ciepła i inne odbiorniki z przemiennikiem częstotliwości — typ F albo wg zaleceń producenta. Ładowarka EV i falownik PV, które mogą wprowadzić gładki prąd stały — typ B (albo A z urządzeniem RDC-DD), pod własnym RCD.
        </li>
        <li className="flex gap-2">
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Praktyka projektowa (nie wymóg normy): kilka obwodów, zwykle do 6–8, na jedną różnicówkę — upływy odbiorników się sumują, a jedno zadziałanie nie powinno odciąć całego domu.
        </li>
        <li className="flex gap-2">
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-copper" /> Rozważ ogranicznik przepięć (SPD) typu 2 — albo typu 1+2 przy instalacji odgromowej lub zasilaniu napowietrznym — na początku instalacji.
        </li>
      </ul>
      <HowItWorks
        formulas={[
          { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: "RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = 50 V" },
          { label: "Maksymalna rezystancja uziemienia (RCD 30 mA)", eq: "RA ≤ 50 / 0,03 = 1667 Ω", where: "dlatego w układzie TT z RCD 30 mA wymagania wobec uziemienia są łagodne" },
          { label: "Dobór prądu znamionowego RCD", eq: "In(RCD) ≥ In zabezpieczenia przed nim", where: "RCD nie ma własnego wyzwalacza nadprądowego — przed przeciążeniem i zwarciem chroni go aparat nadrzędny (tak dobiera go Rozdzielnica)" },
        ]}
        notes={[
          "Typ AC reaguje tylko na prąd różnicowy sinusoidalny; typ A dodatkowo na pulsujący stały — dziś to praktyczne minimum przy zasilaczach impulsowych i elektronice.",
          "Typ B jest wymagany m.in. przy ładowarkach pojazdów elektrycznych i falownikach, gdzie może pojawić się gładki prąd stały.",
          "Rozdzielenie instalacji na kilka RCD ogranicza skutki zadziałania — awaria w jednym obwodzie nie pozbawia zasilania całego domu.",
          "Prądy upływowe odbiorników sumują się. Zbyt wiele obwodów za jednym RCD 30 mA prowadzi do przypadkowych wyłączeń bez rzeczywistej usterki.",
          "Wyłącznik różnicowoprądowy należy regularnie testować przyciskiem TEST, z częstotliwością podaną przez producenta — sprawdza to mechanizm wyzwalający, ale nie zastępuje pomiaru prądu i czasu zadziałania w protokole.",
        ]}
      />
    </Card>
  );
}
