import { describe, it, expect } from "vitest";
import {
  FALLBACK_FONT_ADNOTACJI,
  FALLBACK_FONT_NAZWY,
  MIN_FONT_OPISU,
  WYSOKOSC_NAZWY_M,
  fontOpisuPokoju,
  fontRzutu,
  skalaOpisowRzutu,
  szerokoscTekstu,
} from "./opisPomieszczenia";

/**
 * Rozmiar opisu pomieszczenia był dotąd STAŁĄ w jednostkach planu (`fontSize={11}`),
 * czyli w praktyce stałą w METRACH — przy rysowaniu od zera litery miały 55 cm
 * wysokości, a napis „Przedpokój" 2,75 m szerokości i nie mieścił się w pokoju
 * o powierzchni 7 m² (2,60 × 2,70 m). Przy wgranym rzucie z inną kalibracją ten sam
 * napis bywał z kolei nieczytelnie mały. Rozmiar musi więc iść ZE SKALI, a potem
 * jeszcze zmieścić się w konkretnym pokoju.
 */
describe("szerokoscTekstu", () => {
  /** Współczynnik zmierzony na żywo w Konvie: „Łazienka" 44/8/11, „Przedpokój"
   *  55/10/11, „Salon" 28/5/11 — za każdym razem 0,50 szerokości fontu na znak. */
  it("przybliża szerokość napisu z liczby znaków", () => {
    expect(szerokoscTekstu("Przedpokój", 11)).toBeCloseTo(55, 0);
    expect(szerokoscTekstu("Łazienka", 11)).toBeCloseTo(44, 0);
    expect(szerokoscTekstu("Salon", 11)).toBeCloseTo(27.5, 1);
  });
});

describe("fontOpisuPokoju", () => {
  const SZEROKI = 1000; // pokój na tyle duży, że nie dociska

  it("bez znanej skali zostaje przy dotychczasowym rozmiarze", () => {
    // Brak skali to jedyny przypadek, w którym nie ma z czego liczyć — i wtedy
    // rysunek ma wyglądać dokładnie tak jak przed tą zmianą.
    expect(fontOpisuPokoju(null, "Salon", SZEROKI)).toBe(FALLBACK_FONT_NAZWY);
  });

  it("przy rysowaniu od zera litery schodzą z 55 cm do zadanej wysokości", () => {
    const font = fontOpisuPokoju(0.05, "Salon", SZEROKI);
    expect(font).toBeCloseTo(WYSOKOSC_NAZWY_M / 0.05, 5);
    expect(font).toBeLessThan(FALLBACK_FONT_NAZWY);
  });

  /** Drobniejsza kalibracja = więcej jednostek na metr, więc font MUSI urosnąć,
   *  żeby napis nadal miał te same centymetry na rzucie. */
  it("przy drobniejszej skali wgranego rzutu font rośnie", () => {
    expect(fontOpisuPokoju(0.02, "Salon", SZEROKI)).toBeGreaterThan(fontOpisuPokoju(0.05, "Salon", SZEROKI));
  });

  it("długa nazwa w małym pokoju jest docinana do jego szerokości", () => {
    const szerokoscPokoju = 52; // 2,60 m przy 0,05 m/jedn. — pokój 7 m²
    const font = fontOpisuPokoju(0.05, "Pomieszczenie gospodarcze", szerokoscPokoju);
    expect(szerokoscTekstu("Pomieszczenie gospodarcze", font)).toBeLessThanOrEqual(szerokoscPokoju);
  });

  it("w skrajnie wąskim pokoju nie schodzi poniżej granicy czytelności", () => {
    expect(fontOpisuPokoju(0.05, "Pomieszczenie gospodarcze", 4)).toBe(MIN_FONT_OPISU);
  });

  /** Docinanie ma ratować ciasne pokoje, a nie rozdymać napisy w dużych salonach —
   *  inaczej każdy pokój miałby opis innej wielkości i rzut przestałby być spójny. */
  it("krótka nazwa w dużym pokoju nie jest powiększana", () => {
    expect(fontOpisuPokoju(0.05, "Salon", SZEROKI)).toBeCloseTo(fontOpisuPokoju(0.05, "Salon", 200), 5);
  });
});

describe("fontRzutu — wspólna skala wszystkich napisów rzutu", () => {
  it("bez skali nie rusza dotychczasowych wartości", () => {
    expect(fontRzutu(null, 8.5)).toBe(8.5);
    expect(skalaOpisowRzutu(null)).toBe(1);
  });

  /**
   * Hierarchia rzutu — nazwa jako tytuł, wymiary i powierzchnia jako adnotacje —
   * została ustalona wcześniej i ma przetrwać przeliczenie. Gdyby przeliczyć ze skali
   * same nazwy, wymiar ściany stałby się od nich WIĘKSZY i hierarchia odwróciłaby się.
   */
  it("zachowuje proporcje między napisami", () => {
    const nazwa = fontRzutu(0.05, FALLBACK_FONT_NAZWY);
    const adnotacja = fontRzutu(0.05, FALLBACK_FONT_ADNOTACJI);
    expect(adnotacja).toBeLessThan(nazwa);
    expect(adnotacja / nazwa).toBeCloseTo(FALLBACK_FONT_ADNOTACJI / FALLBACK_FONT_NAZWY, 10);
  });

  it("ten sam mnożnik obsługuje odsunięcia, nie tylko rozmiar pisma", () => {
    // Odsunięcie napisu od ściany musi maleć razem z pismem — inaczej opis odkleja
    // się od tego, co opisuje.
    expect(18 * skalaOpisowRzutu(0.05)).toBeCloseTo(fontRzutu(0.05, 18), 10);
  });
});
