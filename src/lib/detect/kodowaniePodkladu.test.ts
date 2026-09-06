import { describe, it, expect } from "vitest";
import { maPrzezroczystosc, mniejszyZapis } from "./kodowaniePodkladu";

/** Data URL o zadanej długości — treść nie ma znaczenia, liczy się rozmiar. */
const url = (prefiks: string, dlugosc: number) => prefiks + "A".repeat(Math.max(0, dlugosc - prefiks.length));
const png = (dlugosc: number) => url("data:image/png;base64,", dlugosc);
const jpeg = (dlugosc: number) => url("data:image/jpeg;base64,", dlugosc);

/** Piksele w pełni kryjące (alfa 255) — tyle, ile trzeba, żeby przejść pętlę. */
const kryjace = (ile: number) => new Uint8ClampedArray(Array.from({ length: ile * 4 }, (_, i) => (i % 4 === 3 ? 255 : 128)));

describe("maPrzezroczystosc", () => {
  it("obraz w pełni kryjący nie ma przezroczystości", () => {
    expect(maPrzezroczystosc(kryjace(100))).toBe(false);
  });

  it("jeden piksel z alfą poniżej 255 wystarczy", () => {
    const piksele = kryjace(100);
    piksele[43] = 254;
    expect(maPrzezroczystosc(piksele)).toBe(true);
  });
});

describe("mniejszyZapis", () => {
  /**
   * Sedno zmiany: fotografia zapisana bezstratnie zajmowała 4,8 MB przy ~5 MB budżetu
   * `localStorage`, czyli jedna kondygnacja zjadała całą pamięć przeglądarki.
   */
  it("zdjęcie idzie JPEG-iem, bo jest wielokrotnie mniejsze", () => {
    expect(mniejszyZapis(png(4_800_000), jpeg(400_000), false)).toMatchObject({ format: "jpeg" });
  });

  /** Rysunek kreskowy wygrywa PNG-iem sam z siebie — jednolite tło kompresuje się
   *  bezstratnie lepiej, więc nie ma czego zamieniać. */
  it("rysunek kreskowy zostaje PNG-iem", () => {
    expect(mniejszyZapis(png(315_000), jpeg(900_000), false)).toMatchObject({ format: "png" });
  });

  /** Przy zbliżonych rozmiarach nie ma powodu tracić bezstratności — próg wymaga
   *  realnego zysku, nie „choćby jednego bajtu". */
  it("nieznacznie mniejszy JPEG nie wypiera PNG", () => {
    expect(mniejszyZapis(png(100_000), jpeg(95_000), false)).toMatchObject({ format: "png" });
    expect(mniejszyZapis(png(100_000), jpeg(60_000), false)).toMatchObject({ format: "jpeg" });
  });

  /**
   * JPEG nie zna przezroczystości: zamiast lżejszego podkładu dałby czarną płachtę
   * pod rysunkiem. Rozstrzyga to sprawę BEZ patrzenia na rozmiary.
   */
  it("przezroczystość przesądza o PNG, nawet gdy JPEG jest dużo mniejszy", () => {
    expect(mniejszyZapis(png(4_800_000), jpeg(100_000), true)).toMatchObject({ format: "png" });
  });

  it("oddaje ten data URL, który wybrał", () => {
    const p = png(1000);
    const j = jpeg(100);
    expect(mniejszyZapis(p, j, false).dataUrl).toBe(j);
    expect(mniejszyZapis(p, j, true).dataUrl).toBe(p);
  });
});
