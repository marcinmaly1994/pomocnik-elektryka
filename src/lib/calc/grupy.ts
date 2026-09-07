import type { CalcId } from "@/store/useCalculatorsStore";

/**
 * Kalkulatory pogrupowane wg ETAPU PRACY, nie wg tego, co która funkcja liczy.
 *
 * Lista osiemnastu pozycji jednym ciągiem wymagała od użytkownika, żeby najpierw
 * znał nazwy — a nazwa „Impedancja pętli zwarcia" nic nie mówi komuś, kto po prostu
 * sprawdza, czy jego instalacja jest bezpieczna. Kolejność grup to kolejność, w jakiej
 * robi się projekt: najpierw ile prądu potrzeba, potem czym to poprowadzić, potem czy
 * ochrona zadziała, na końcu odbiorniki specjalne.
 *
 * „Zaawansowane" są zwinięte domyślnie: to narzędzia, po które sięga się świadomie
 * (kompensacja mocy biernej nie zdarza się w domu jednorodzinnym), a ich stała
 * obecność w liście rozpraszała przy tych czterech, których używa się codziennie.
 */

export type GrupaId = "start" | "obwod" | "ochrona" | "odbiorniki" | "zaawansowane";

export interface Grupa {
  id: GrupaId;
  tytul: string;
  opis: string;
  /** Zwinięta przy pierwszym wejściu — patrz komentarz wyżej. */
  domyslnieZwinieta?: boolean;
  pozycje: CalcId[];
}

export const GRUPY: Grupa[] = [
  {
    id: "start",
    tytul: "Start",
    opis: "od czego zacząć projekt",
    pozycje: ["moc"],
  },
  {
    id: "obwod",
    tytul: "Obwód odbiorczy",
    opis: "przewód, zabezpieczenie, spadek napięcia",
    pozycje: ["obwod", "spadek", "dlugosc", "peN"],
  },
  {
    id: "ochrona",
    tytul: "Ochrona",
    opis: "porażeniowa, zwarciowa i przepięciowa",
    pozycje: ["petla", "uziemienieTT", "uziom", "rcd", "zwarcie", "spd"],
  },
  {
    id: "odbiorniki",
    tytul: "Odbiorniki",
    opis: "instalacje o własnych wymaganiach",
    pozycje: ["ev", "pv", "silnik", "oswietlenie"],
  },
  {
    id: "zaawansowane",
    tytul: "Zaawansowane",
    opis: "rzadziej, ale wtedy niezbędne",
    domyslnieZwinieta: true,
    pozycje: ["gGWkladka", "impedancja", "kompensacja", "bilansFaz"],
  },
];

export interface PozycjaKalkulatora {
  id: CalcId;
  label: string;
  desc: string;
}

/**
 * Grupy wypełnione pozycjami z listy kalkulatorów.
 *
 * Pozycja spoza jakiejkolwiek grupy trafia na koniec „Zaawansowanych", a nie znika:
 * dołożenie kalkulatora bez dopisania go do grupy to zwykłe przeoczenie, a nie powód,
 * żeby użytkownik przestał go widzieć.
 */
export function pogrupuj(lista: PozycjaKalkulatora[]): { grupa: Grupa; pozycje: PozycjaKalkulatora[] }[] {
  const poId = new Map(lista.map((p) => [p.id, p]));
  const przypisane = new Set<CalcId>();
  const wynik = GRUPY.map((grupa) => {
    const pozycje = grupa.pozycje.map((id) => poId.get(id)).filter((p): p is PozycjaKalkulatora => p !== undefined);
    pozycje.forEach((p) => przypisane.add(p.id));
    return { grupa, pozycje };
  });
  const osierocone = lista.filter((p) => !przypisane.has(p.id));
  if (osierocone.length > 0) {
    const zaawansowane = wynik.find((g) => g.grupa.id === "zaawansowane")!;
    zaawansowane.pozycje = [...zaawansowane.pozycje, ...osierocone];
  }
  return wynik;
}

/** Do porównywania fraz: bez wielkości liter i bez polskich ogonków. */
export function normalizuj(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize("NFD")
    // Znaki łączące (ogonki) po rozłożeniu przez NFD — zapisane kodami, bo same
    // w sobie są niewidoczne i w edytorze wyglądałyby jak pusta klasa znaków.
    .replace(/[̀-ͯ]/g, "")
    // „ł" nie rozkłada się przez NFD — to osobny znak, nie „l" z kreską.
    .replace(/ł/g, "l");
}

/**
 * Filtrowanie po nazwie I OPISIE.
 *
 * Opis jest tu równie ważny co nazwa: kto szuka „uziemienia", ma trafić w „Rezystancję
 * uziemienia", choć w nazwie nie ma słowa „ochrona", a kto wpisze „RCD" — w kalkulator
 * różnicówki, mimo że pełna nazwa brzmi „Dobór wyłącznika różnicowoprądowego".
 */
export function filtruj(lista: PozycjaKalkulatora[], fraza: string): PozycjaKalkulatora[] {
  const szukane = normalizuj(fraza.trim());
  if (!szukane) return lista;
  return lista.filter((p) => normalizuj(`${p.label} ${p.desc}`).includes(szukane));
}
