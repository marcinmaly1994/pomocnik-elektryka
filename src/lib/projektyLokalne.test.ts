import { describe, it, expect } from "vitest";
import {
  czytajIndeks,
  zapiszIndeks,
  kluczProjektu,
  migrujStaryAutozapis,
  biezacyId,
  ustawBiezacy,
  usunProjekt,
  czyJestMiejsce,
  KLUCZ_INDEKSU,
  KLUCZ_BIEZACEGO,
  KLUCZ_STAREGO_AUTOZAPISU,
  type Magazyn,
  type WpisProjektu,
} from "./projektyLokalne";
import { LIMIT_ZAPISOW } from "./dokumenty";

/** Atrapa `localStorage` — zwykła mapa, bez przeglądarki. */
function magazyn(poczatkowe: Record<string, string> = {}): Magazyn & { dane: Record<string, string> } {
  const dane = { ...poczatkowe };
  return {
    dane,
    getItem: (k) => (k in dane ? dane[k] : null),
    setItem: (k, v) => {
      dane[k] = v;
    },
    removeItem: (k) => {
      delete dane[k];
    },
  };
}

function wpis(id: string, nazwa = id): WpisProjektu {
  return { id, nazwa, zmieniony: 1000 };
}

describe("czytajIndeks", () => {
  it("pusty magazyn to pusta lista, a nie wyjątek", () => {
    expect(czytajIndeks(magazyn())).toEqual([]);
  });

  it("uszkodzony indeks NIE wywraca aplikacji — wraca pusta lista", () => {
    // Zawartość `localStorage` to dane z zewnątrz: przeżyła aktualizacje, tryb
    // prywatny i cudze rozszerzenia do przeglądarki. Wyjątek tutaj zabiłby całą
    // powłokę aplikacji przy starcie, a nie tylko listę projektów.
    expect(czytajIndeks(magazyn({ [KLUCZ_INDEKSU]: "{to nie jest json" }))).toEqual([]);
    expect(czytajIndeks(magazyn({ [KLUCZ_INDEKSU]: "null" }))).toEqual([]);
    expect(czytajIndeks(magazyn({ [KLUCZ_INDEKSU]: '{"a":1}' }))).toEqual([]);
  });

  it("odsiewa wpisy bez identyfikatora, zamiast wpuszczać je dalej", () => {
    const m = magazyn({
      [KLUCZ_INDEKSU]: JSON.stringify([wpis("a"), { nazwa: "bez id" }, { id: 7 }, wpis("b")]),
    });
    expect(czytajIndeks(m).map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("uzupełnia brakującą nazwę, bo pozycja bez podpisu jest nie do kliknięcia", () => {
    const m = magazyn({ [KLUCZ_INDEKSU]: JSON.stringify([{ id: "a", zmieniony: 5 }]) });
    expect(czytajIndeks(m)[0].nazwa).toBeTruthy();
  });
});

describe("zapiszIndeks", () => {
  it("zapisuje tak, że czytajIndeks widzi to samo", () => {
    const m = magazyn();
    zapiszIndeks(m, [wpis("a", "Dom"), wpis("b", "Garaż")]);
    expect(czytajIndeks(m).map((w) => w.nazwa)).toEqual(["Dom", "Garaż"]);
  });
});

describe("migrujStaryAutozapis", () => {
  it("zamienia dotychczasowy autozapis w pierwszy projekt na liście", () => {
    // Najważniejszy test w tym pliku. Użytkownik ma w przeglądarce projekt zapisany
    // POD STARYM KLUCZEM. Aktualizacja aplikacji nie ma prawa go zgubić — a zgubiłaby,
    // gdyby nowa lista po prostu zaczęła czytać z innego miejsca.
    const m = magazyn({ [KLUCZ_STAREGO_AUTOZAPISU]: JSON.stringify({ projectName: "Mój dom", floors: [] }) });

    const id = migrujStaryAutozapis(m);

    expect(id).toBeTruthy();
    const indeks = czytajIndeks(m);
    expect(indeks).toHaveLength(1);
    expect(indeks[0].nazwa).toBe("Mój dom");
    expect(m.getItem(kluczProjektu(id!))).toContain("Mój dom");
    expect(biezacyId(m)).toBe(id);
  });

  it("nie robi nic, gdy nie ma czego migrować", () => {
    const m = magazyn();
    expect(migrujStaryAutozapis(m)).toBeNull();
    expect(czytajIndeks(m)).toEqual([]);
  });

  it("nie duplikuje przy drugim uruchomieniu", () => {
    const m = magazyn({ [KLUCZ_STAREGO_AUTOZAPISU]: JSON.stringify({ projectName: "Mój dom" }) });
    migrujStaryAutozapis(m);
    migrujStaryAutozapis(m);
    expect(czytajIndeks(m)).toHaveLength(1);
  });

  it("nie tyka listy, która już istnieje", () => {
    const m = magazyn({
      [KLUCZ_INDEKSU]: JSON.stringify([wpis("x", "Istniejący")]),
      [KLUCZ_STAREGO_AUTOZAPISU]: JSON.stringify({ projectName: "Stary" }),
    });
    expect(migrujStaryAutozapis(m)).toBeNull();
    expect(czytajIndeks(m).map((w) => w.nazwa)).toEqual(["Istniejący"]);
  });

  it("uszkodzony stary zapis nie blokuje startu — projekt powstaje z nazwą zastępczą", () => {
    const m = magazyn({ [KLUCZ_STAREGO_AUTOZAPISU]: "{niedokonczony" });
    const id = migrujStaryAutozapis(m);
    expect(id).toBeTruthy();
    expect(czytajIndeks(m)[0].nazwa).toBeTruthy();
  });
});

describe("biezacyId / ustawBiezacy", () => {
  it("pamięta, który projekt jest otwarty", () => {
    const m = magazyn();
    expect(biezacyId(m)).toBeNull();
    ustawBiezacy(m, "abc");
    expect(biezacyId(m)).toBe("abc");
    expect(m.dane[KLUCZ_BIEZACEGO]).toBe("abc");
  });
});

describe("usunProjekt", () => {
  it("kasuje i wpis na liście, i jego treść", () => {
    const m = magazyn();
    zapiszIndeks(m, [wpis("a"), wpis("b")]);
    m.setItem(kluczProjektu("a"), "{}");

    const zostalo = usunProjekt(m, "a");

    expect(zostalo.map((w) => w.id)).toEqual(["b"]);
    // Osierocona treść zajmowałaby budżet pamięci w nieskończoność — a budżet jest
    // tu wąskim gardłem (podkład rzutu potrafi zająć prawie cały).
    expect(m.getItem(kluczProjektu("a"))).toBeNull();
  });

  it("usunięcie otwartego projektu zwalnia wskaźnik bieżącego", () => {
    const m = magazyn();
    zapiszIndeks(m, [wpis("a")]);
    ustawBiezacy(m, "a");
    usunProjekt(m, "a");
    expect(biezacyId(m)).toBeNull();
  });
});

describe("czyJestMiejsce", () => {
  it("limit jest ten sam co w chmurze — jedna liczba dla obu list", () => {
    const pelno = Array.from({ length: LIMIT_ZAPISOW }, (_, i) => wpis(`p${i}`));
    expect(czyJestMiejsce(pelno.slice(0, LIMIT_ZAPISOW - 1))).toBe(true);
    expect(czyJestMiejsce(pelno)).toBe(false);
  });
});
