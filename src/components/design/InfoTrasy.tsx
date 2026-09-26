import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ELEMENT_TYPES } from "@/lib/elements";
import { formatLiczba } from "@/lib/liczby";
import { dlugoscOdcinka } from "@/lib/punktTrasy";
import type { CableRoute } from "@/types";

/**
 * Okno z informacjami o przewodzie — otwierane dwuklikiem (podwójnym dotknięciem)
 * trasy na rzucie albo z menu pod PPM.
 *
 * Odpowiada na pytanie, które stoi za tym gestem: „co to za kabel i ile go jest".
 * Kolor trasy mówi tylko, że obwody się różnią; nazwy obwodu, zabezpieczenia,
 * przekroju ani długości z rysunku odczytać się nie da.
 *
 * Długości są długościami NA RZUCIE — bez zapasów montażowych i zejść do puszek,
 * które dolicza dobór przewodów i kosztorys. Mówimy to wprost, żeby liczba z tego
 * okna nie trafiła do zamówienia jako metraż kabla.
 */
export function InfoTrasy({
  trasa,
  odcinek,
  mpu,
  reczna,
  onClose,
}: {
  trasa: CableRoute;
  /** Indeks wskazanego odcinka w `trasa.points`. */
  odcinek: number;
  /** Metrów na jednostkę planu na kondygnacji trasy; `null` = brak kalibracji. */
  mpu: number | null;
  /** Trasa ma ręczną poprawkę (`routeOverrides`). */
  reczna: boolean;
  onClose: () => void;
}) {
  const dlugosc = (jednostki: number) =>
    mpu !== null && mpu > 0 ? `${formatLiczba(jednostki * mpu, 2)} m` : `${Math.round(jednostki)} jedn. rysunku`;
  const sterowanie = trasa.kind === "sterowanie";
  const cel = ELEMENT_TYPES[trasa.type]?.label ?? trasa.type;
  const przebieg = reczna
    ? "poprawiona ręcznie"
    : trasa.viaWalls
      ? "wzdłuż ścian"
      : "szacunek — brak ścian, po których dałoby się ją poprowadzić";

  const wiersze: [string, string][] = [
    ["Obwód", trasa.circuitName || "bez obwodu"],
    ...(trasa.breaker ? ([["Zabezpieczenie", trasa.breaker]] as [string, string][]) : []),
    ["Przewód", trasa.cable],
    ["Rodzaj", sterowanie ? "sterowanie (łącznik → oprawa)" : "zasilanie (rozdzielnica → punkt)"],
    ["Do", trasa.room ? `${cel} — ${trasa.room}` : cel],
    ["Ten odcinek", dlugosc(dlugoscOdcinka(trasa.points, odcinek))],
    ["Cała trasa", `${dlugosc(trasa.lengthUnits)} (odcinków: ${Math.max(1, trasa.points.length - 1)})`],
    ["Przebieg", przebieg],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Informacje o przewodzie" className="max-w-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm" data-testid="info-trasy">
          {wiersze.map(([etykieta, wartosc]) => (
            <div key={etykieta} className="contents">
              <dt className="text-slate-500">{etykieta}</dt>
              <dd className="text-ink">{wartosc}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-400">
          Długości na rzucie, bez zapasów montażowych i zejść do puszek — te dolicza kosztorys.
          {mpu === null && " Skalibruj skalę rzutu, żeby zobaczyć metry."}
        </p>
      </DialogContent>
    </Dialog>
  );
}
