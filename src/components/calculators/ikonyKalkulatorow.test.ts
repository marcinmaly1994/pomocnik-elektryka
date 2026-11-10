import { describe, it, expect } from "vitest";
import { IKONY_KALKULATOROW } from "./ikonyKalkulatorow";

/** Każdy kalkulator ma ikonę i żadne dwa nie mają tej samej — ikona ma pomagać
 *  odróżniać pozycje na liście, a dwie jednakowe robią dokładnie odwrotnie. */
describe("ikony kalkulatorów", () => {
  const IDS = [
    "moc", "obwod", "gGWkladka", "spadek", "dlugosc", "impedancja", "zwarcie", "petla",
    "uziemienieTT", "uziom", "rcd", "peN", "bilansFaz", "kompensacja", "silnik", "spd",
    "pv", "ev", "oswietlenie",
  ];

  it("każdy kalkulator ma ikonę", () => {
    for (const id of IDS) expect(IKONY_KALKULATOROW[id as keyof typeof IKONY_KALKULATOROW], id).toBeTruthy();
  });

  it("ikony się nie powtarzają", () => {
    const ikony = IDS.map((id) => IKONY_KALKULATOROW[id as keyof typeof IKONY_KALKULATOROW]);
    expect(new Set(ikony).size).toBe(ikony.length);
  });
});
