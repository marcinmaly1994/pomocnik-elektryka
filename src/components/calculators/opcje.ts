import { RODZAJ_LINII_LABELS, type Izolacja, type Material, type RodzajLinii } from "@/lib/norms/conductors";

/**
 * Listy wyboru wspólne dla kilku kalkulatorów.
 *
 * Wydzielone z `CalculatorsTab` nie dla porządku, tylko z konieczności: kalkulatory
 * przenoszone do własnych plików potrzebują tych samych list, a import z
 * `CalculatorsTab` dałby cykl (to on importuje kalkulatory).
 */

/** Szereg handlowy do kalkulatorów inżynierskich — szerszy niż `SECTIONS`
 *  (te obejmują tylko zakres domowego doboru obwodów, do 25 mm²). */
export const SZEREG_PELNY = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630];

export const SZEREG_PELNY_OPTIONS = SZEREG_PELNY.map((s) => ({
  value: String(s),
  label: `${String(s).replace(".", ",")} mm²`,
}));

export const MATERIAL_OPTIONS: { value: Material; label: string }[] = [
  { value: "Cu", label: "miedź (Cu)" },
  { value: "Al", label: "aluminium (Al)" },
];

export const IZOLACJA_OPTIONS: { value: Izolacja; label: string }[] = [
  { value: "PVC", label: "PVC (70 °C)" },
  { value: "XLPE", label: "XLPE / EPR (90 °C)" },
];

export const RODZAJ_LINII_OPTIONS = (Object.entries(RODZAJ_LINII_LABELS) as [RodzajLinii, string][]).map(
  ([value, label]) => ({ value, label }),
);
