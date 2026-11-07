import { describe, it, expect } from "vitest";
import {
  wymiaryNotatki,
  FALLBACK_FONT_ADNOTACJI,
  FALLBACK_FONT_NAZWY,
  MIN_FONT_OPISU,
  WYSOKOSC_NAZWY_M,
  fontOpisuPokoju,
  miejsceNaOpis,
  zasiegNapisu,
  fontRzutu,
  skalaOpisowRzutu,
  szerokoscRamki,
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

describe("szerokoscRamki", () => {
  /**
   * Ramka RÓWNA szerokości napisu nie wystarcza: Konva uznaje wtedy, że tekst się
   * nie mieści, i łamie go na dwie linie — „Salon" wychodził jako „Salo" + „n"
   * w KAŻDYM pomieszczeniu. Zmierzone na żywo: przy ramce 14,01 jedn. napis nadal
   * się łamał, przy 15,4 już nie. Stąd zapas, a nie sama szerokość napisu.
   */
  it("jest szersza od samego napisu", () => {
    expect(szerokoscRamki("Salon", 5.6)).toBeGreaterThan(szerokoscTekstu("Salon", 5.6));
  });

  it("zapas wystarcza na niedoszacowanie przybliżenia", () => {
    // Przybliżenie 0,5 znaku na jednostkę fontu jest odrobinę ZA MAŁE — prawdziwa
    // szerokość „Salon" przy foncie 5,6 leży między 14,01 a 15,4 jedn.
    expect(szerokoscRamki("Salon", 5.6)).toBeGreaterThan(15.4);
  });
});

describe("miejsce na opis pomieszczenia", () => {
  const pokoj = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const blok = { lewo: 20, prawo: 20, gora: 6, dol: 6 };
  /** Lampa sufitowa w środku pokoju — dokładnie tam, gdzie stoi nazwa. */
  const lampa = { x1: 44, y1: 34, x2: 56, y2: 46 };

  it("nazwa docięta do szerokości pokoju mieści się w obrysie i ucieka spod lampy", () => {
    // „Klatka schodowa" w pokoju 2 m (40 jedn. przy 0,05 m/jedn.) — nazwa docięta do 90%
    // szerokości. Z zasięgiem liczonym z RAMKI (+15%) blok miał 103% pokoju, żadne położenie
    // nie mieściło się w obrysie i opis zostawał na lampie w środku.
    const klatka = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 0, y: 60 },
    ];
    const font = fontOpisuPokoju(0.05, "Klatka schodowa", 40);
    const pol = zasiegNapisu("Klatka schodowa", font) / 2;
    expect(2 * pol).toBeLessThanOrEqual(40);
    const lampaKlatki = { x1: 14, y1: 24, x2: 26, y2: 36 };
    const q = miejsceNaOpis({
      kotwica: { x: 20, y: 30 },
      blok: { lewo: pol, prawo: pol, gora: font / 2, dol: font / 2 },
      przeszkody: [lampaKlatki],
      obrys: klatka,
      krok: font / 2,
      krokow: 16,
    });
    expect(q.y + font / 2 <= lampaKlatki.y1 || q.y - font / 2 >= lampaKlatki.y2).toBe(true);
  });

  it("odstęp od przeszkód nie pozwala postawić opisu na styk", () => {
    const tuz = { x1: 44, y1: 46, x2: 56, y2: 58 }; // symbol zaczyna się dokładnie pod blokiem
    const bez = miejsceNaOpis({ kotwica: { x: 50, y: 40 }, blok, przeszkody: [tuz], obrys: pokoj, krok: 8 });
    expect(bez).toEqual({ x: 50, y: 40 });
    const z = miejsceNaOpis({ kotwica: { x: 50, y: 40 }, blok, przeszkody: [tuz], obrys: pokoj, krok: 8, odstep: 1 });
    expect(z).not.toEqual({ x: 50, y: 40 });
  });

  it("bez symboli opis zostaje w kotwicy", () => {
    expect(miejsceNaOpis({ kotwica: { x: 50, y: 40 }, blok, przeszkody: [], obrys: pokoj, krok: 8 })).toEqual({
      x: 50,
      y: 40,
    });
  });

  it("lampa na środku spycha opis w pionie, poza nią", () => {
    const p = miejsceNaOpis({ kotwica: { x: 50, y: 40 }, blok, przeszkody: [lampa], obrys: pokoj, krok: 8 });
    expect(p.x).toBe(50);
    // Blok opisu nie nachodzi już na lampę.
    expect(p.y - blok.gora >= lampa.y2 || p.y + blok.dol <= lampa.y1).toBe(true);
  });

  it("nie wyprowadza opisu za ścianę", () => {
    const niski = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 16 },
      { x: 0, y: 16 },
    ];
    // Lampa w środku niskiego pokoju: w pionie miejsce jest tylko ZA ścianą, więc opis
    // idzie w bok — wolne miejsce w pokoju ma pierwszeństwo przed wolnym poza nim.
    const p = miejsceNaOpis({
      kotwica: { x: 60, y: 8 },
      blok,
      przeszkody: [{ x1: 54, y1: 2, x2: 66, y2: 14 }],
      obrys: niski,
      krok: 8,
    });
    expect(p.y).toBe(8);
    expect(Math.abs(p.x - 60)).toBeGreaterThan(0);
    expect(p.x - blok.lewo).toBeGreaterThanOrEqual(0);
    expect(p.x + blok.prawo).toBeLessThanOrEqual(120);
  });

  it("gdy wolnego miejsca nie ma, wybiera najmniej zasłonięte", () => {
    // Cały pokój zastawiony — ale jeden symbol mniejszy od reszty.
    const p = miejsceNaOpis({
      kotwica: { x: 50, y: 40 },
      blok,
      przeszkody: [{ x1: 0, y1: 0, x2: 100, y2: 80 }],
      obrys: pokoj,
      krok: 8,
    });
    // Pole zasłonięte wszędzie takie samo — zostaje kotwica.
    expect(p).toEqual({ x: 50, y: 40 });
  });
});

describe("miejsce na opis — kandydaci podani wprost", () => {
  const lazienka = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 60 },
    { x: 0, y: 60 },
  ];
  const blok = { lewo: 15, prawo: 15, gora: 0, dol: 5 };

  it("kotwica za ścianą przegrywa z pierwszym miejscem w obrysie", () => {
    // Podpis strefy stał NAD strefą — czyli za ścianą łazienki, w sąsiednim pokoju.
    const p = miejsceNaOpis({
      kotwica: { x: 30, y: -10 },
      blok,
      przeszkody: [],
      obrys: lazienka,
      kandydaci: [
        { x: 30, y: 70 },
        { x: 30, y: 40 },
      ],
    });
    expect(p).toEqual({ x: 30, y: 40 });
  });

  it("omija zajęte miejsce, np. nazwę pomieszczenia", () => {
    const nazwa = { x1: 15, y1: 38, x2: 45, y2: 48 };
    const p = miejsceNaOpis({
      kotwica: { x: 30, y: 40 },
      blok,
      przeszkody: [nazwa],
      obrys: lazienka,
      kandydaci: [{ x: 30, y: 10 }],
    });
    expect(p).toEqual({ x: 30, y: 10 });
  });

  it("gdy nic nie mieści się w obrysie, zostaje kotwica", () => {
    const p = miejsceNaOpis({
      kotwica: { x: 30, y: -10 },
      blok: { lewo: 100, prawo: 100, gora: 0, dol: 5 },
      przeszkody: [],
      obrys: lazienka,
      kandydaci: [{ x: 30, y: 30 }],
    });
    expect(p).toEqual({ x: 30, y: -10 });
  });
});

describe("miejsce na opis — pokój bez wolnego miejsca", () => {
  it("czytelny napis za ścianą wygrywa z napisem pod symbolem", () => {
    // Mała łazienka, w której podpis strefy nie mieści się nigdzie obok przyboru.
    const lazienka = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ];
    const p = miejsceNaOpis({
      kotwica: { x: 20, y: 10 },
      blok: { lewo: 15, prawo: 15, gora: 0, dol: 5 },
      przeszkody: [{ x1: 0, y1: 0, x2: 40, y2: 20 }],
      obrys: lazienka,
      wolnoZaObrys: true,
      kandydaci: [
        { x: 20, y: 5 },
        { x: 20, y: -10 },
      ],
    });
    expect(p).toEqual({ x: 20, y: -10 });
  });
});

describe("miejsce na opis — nazwa pomieszczenia", () => {
  it("bez `wolnoZaObrys` nie wychodzi za ścianę, nawet gdy w środku ciasno", () => {
    // Ta sama ciasna łazienka — ale to NAZWA pokoju, a nie podpis strefy.
    const lazienka = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ];
    const p = miejsceNaOpis({
      kotwica: { x: 20, y: 10 },
      blok: { lewo: 15, prawo: 15, gora: 0, dol: 5 },
      przeszkody: [{ x1: 0, y1: 0, x2: 40, y2: 20 }],
      obrys: lazienka,
      kandydaci: [{ x: 20, y: -10 }],
    });
    expect(p).toEqual({ x: 20, y: 10 });
  });
});

describe("miejsce na opis — pokój w kształcie L", () => {
  it("znajduje wolne miejsce poza głównymi kierunkami od środka", () => {
    // Przedpokój z przykładu: ramię poziome u góry, pionowe po lewej.
    const przedpokoj = [
      { x: 60, y: 90 },
      { x: 160, y: 90 },
      { x: 160, y: 120 },
      { x: 90, y: 120 },
      { x: 90, y: 160 },
      { x: 60, y: 160 },
    ];
    const p = miejsceNaOpis({
      kotwica: { x: 103, y: 123 },
      blok: { lewo: 16, prawo: 16, gora: 3, dol: 3 },
      // Lampa i czujnik w poziomym ramieniu, zostawiają wolny jego prawy koniec.
      przeszkody: [
        { x1: 89, y1: 99, x2: 101, y2: 111 },
        { x1: 109, y1: 106, x2: 121, y2: 118 },
        { x1: 112, y1: 89, x2: 120, y2: 99 },
      ],
      obrys: przedpokoj,
      krok: 2.8,
      krokow: 16,
    });
    // Blok opisu leży w obrysie i nie dotyka żadnej przeszkody.
    const blok = { x1: p.x - 16, y1: p.y - 3, x2: p.x + 16, y2: p.y + 3 };
    for (const q of [
      { x1: 89, y1: 99, x2: 101, y2: 111 },
      { x1: 109, y1: 106, x2: 121, y2: 118 },
      { x1: 112, y1: 89, x2: 120, y2: 99 },
    ]) {
      expect(blok.x1 >= q.x2 || blok.x2 <= q.x1 || blok.y1 >= q.y2 || blok.y2 <= q.y1).toBe(true);
    }
    // Poziome ramię (y 90–120) — pionowe ma tylko 30 jedn. szerokości, opis 32 się w nim nie mieści.
    expect(blok.y1).toBeGreaterThanOrEqual(90);
    expect(blok.y2).toBeLessThanOrEqual(120);
  });
});

describe("miejsce na opis — ściany", () => {
  const blok = { lewo: 15, prawo: 15, gora: 0, dol: 5 };

  it("napis nie staje na ścianie, choć nic innego go tam nie zasłania", () => {
    // Pozioma ściana na y = 40 przechodzi dokładnie przez kotwicę.
    const sciana = { a: { x: 0, y: 40 }, b: { x: 100, y: 40 }, grubosc: 4 };
    const p = miejsceNaOpis({
      kotwica: { x: 50, y: 38 },
      blok,
      przeszkody: [],
      odcinki: [sciana],
      kandydaci: [
        { x: 50, y: 39 },
        { x: 50, y: 50 },
      ],
    });
    // Blok (y..y+5) nie może dotykać pasa muru 38..42.
    expect(p.y >= 42 || p.y + 5 <= 38).toBe(true);
  });

  it("ukośna ściana blokuje tylko to, co naprawdę przecina", () => {
    // Skos z (0,0) do (100,100) — prostokąt otaczający objąłby cały kwadrat.
    const sciana = { a: { x: 0, y: 0 }, b: { x: 100, y: 100 }, grubosc: 2 };
    const p = miejsceNaOpis({
      kotwica: { x: 80, y: 10 },
      blok,
      przeszkody: [],
      odcinki: [sciana],
    });
    // Róg daleko od skosu jest wolny — kotwica zostaje.
    expect(p).toEqual({ x: 80, y: 10 });
  });
});

describe("wymiaryNotatki", () => {
  it("rośnie z najdłuższym wierszem i z liczbą wierszy", () => {
    const jeden = wymiaryNotatki("puszka", 0.05);
    const dluzszy = wymiaryNotatki("puszka pod blatem 105 cm", 0.05);
    const dwaWiersze = wymiaryNotatki("puszka\npod blatem", 0.05);
    expect(dluzszy.szer).toBeGreaterThan(jeden.szer);
    expect(dwaWiersze.wys).toBeGreaterThan(jeden.wys);
    expect(dwaWiersze.font).toBe(jeden.font);
  });
});
