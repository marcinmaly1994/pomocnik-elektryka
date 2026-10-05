import { describe, it, expect } from "vitest";
import { czytajKopie } from "./kopiaProjektu";

/**
 * Wczytywanie kopii zapasowej z pliku wybranego przez użytkownika.
 *
 * Plik jest DANYMI Z ZEWNĄTRZ — trafia tu wszystko, co ktoś kliknie w oknie wyboru:
 * cudzy JSON, CSV wzięty przez pomyłkę, plik ucięty w połowie kopiowania. Cała
 * odpowiedzialność za odróżnienie kopii projektu od reszty świata siedzi w tej jednej
 * czystej funkcji, bo bez niej zepsuty plik szedłby prosto do store'a i kończył się
 * białym ekranem — repo ma już tę bliznę po uszkodzonym zapisie w localStorage
 * (patrz komentarz w ErrorBoundary.tsx).
 */

/** Najmniejsza rzecz, którą aplikacja uznaje za kopię projektu. */
function minimalnaKopia() {
  return {
    draft: { elements: [], roomShapes: [] },
    floors: [{ id: "f1", name: "Parter" }],
    activeFloorId: "f1",
    projectName: "Mój dom",
  };
}

describe("czytajKopie", () => {
  it("przyjmuje kopię i oddaje wczytany projekt", () => {
    const wynik = czytajKopie(JSON.stringify(minimalnaKopia()));

    expect(wynik.ok).toBe(true);
    if (!wynik.ok) return;
    expect(wynik.payload.projectName).toBe("Mój dom");
    expect(wynik.payload.floors).toHaveLength(1);
  });

  it("odrzuca plik, który w ogóle nie jest JSON-em", () => {
    // Najczęstsza pomyłka: wskazanie CSV-a z cennikiem albo zupełnie innego pliku.
    const wynik = czytajKopie("nazwa,cena\nGniazdo,12.50\n");

    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.powod).toMatch(/nie jest plikiem kopii/i);
  });

  it("odrzuca poprawny JSON, który nie jest projektem", () => {
    const wynik = czytajKopie(JSON.stringify({ jakies: "dane", liczba: 7 }));

    expect(wynik.ok).toBe(false);
    if (wynik.ok) return;
    expect(wynik.powod).toMatch(/nie jest plikiem kopii/i);
  });

  it("odrzuca pusty plik", () => {
    expect(czytajKopie("").ok).toBe(false);
    expect(czytajKopie("   \n  ").ok).toBe(false);
  });

  it("odrzuca JSON, który nie jest obiektem", () => {
    // `JSON.parse("null")` i `JSON.parse("[]")` przechodzą bez wyjątku, a potem
    // `payload.draft` wywraca się dopiero w store — czyli za późno.
    expect(czytajKopie("null").ok).toBe(false);
    expect(czytajKopie("[]").ok).toBe(false);
    expect(czytajKopie("42").ok).toBe(false);
  });

  it("odrzuca kopię bez planu albo bez kondygnacji", () => {
    const bezDraftu = { ...minimalnaKopia(), draft: undefined };
    const bezKondygnacji = { ...minimalnaKopia(), floors: "parter" };

    expect(czytajKopie(JSON.stringify(bezDraftu)).ok).toBe(false);
    expect(czytajKopie(JSON.stringify(bezKondygnacji)).ok).toBe(false);
  });

  it("przyjmuje kopię sprzed dodania późniejszych pól", () => {
    // Walidacja jest PŁYTKA świadomie: `loadProjectPayload` sam uzupełnia braki
    // starszych zapisów (np. sprzed `openings` czy `warunkiDoboru`). Ostrzejsze
    // sprawdzanie odrzucałoby własne kopie użytkownika sprzed aktualizacji —
    // czyli dokładnie te, dla których kopia zapasowa ma sens.
    const stara = {
      draft: { elements: [{ id: "e1" }] },
      floors: [{ id: "f1" }],
      activeFloorId: "f1",
    };

    const wynik = czytajKopie(JSON.stringify(stara));

    expect(wynik.ok).toBe(true);
  });

  it("odrzuca kopię, w której listy planu albo kondygnacje mają zły kształt", () => {
    // Kształt szczytu (`draft` obiektem, `floors` tablicą) to za mało: plik z `elements`
    // jako napisem przechodził sito i wywracał ekran dopiero przy pierwszym `.map`.
    const zlyElements = { ...minimalnaKopia(), draft: { elements: "x", roomShapes: [] } };
    const zlaSciana = { ...minimalnaKopia(), draft: { elements: [], walls: { a: 1 } } };
    const zlaKondygnacja = { ...minimalnaKopia(), floors: [null, 5] };
    const kondygnacjaBezId = { ...minimalnaKopia(), floors: [{ name: "Parter" }] };

    for (const zepsuta of [zlyElements, zlaSciana, zlaKondygnacja, kondygnacjaBezId]) {
      expect(czytajKopie(JSON.stringify(zepsuta)).ok).toBe(false);
    }
  });
});
