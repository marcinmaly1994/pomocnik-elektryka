import { describe, expect, it } from "vitest";
import { MANUAL_DRAW_SCALE_MPU } from "./design";
import { SANITARY_FIXTURES } from "./elements";
import { glyphBoxSize } from "./glyphs";
import {
  autoSymbolScale,
  BASE_ELEMENT_SCALE,
  DEFAULT_ELEMENT_SCALE,
  elementRenderScale,
  JEDNOSTKI_NA_METR,
  sanitaryRenderScale,
  skalaZRysunku,
  ROZPIETOSC_ODNIESIENIA,
} from "./symbolScale";

describe("autoSymbolScale", () => {
  it("nie zmienia niczego przy skali ręcznego rysowania", () => {
    expect(autoSymbolScale(MANUAL_DRAW_SCALE_MPU)).toBe(1);
  });

  it("powiększa symbole na rzucie skalibrowanym gęściej", () => {
    // 1 jedn. = 1 cm, czyli pięć razy gęściej niż skala odniesienia (1 jedn. = 5 cm).
    expect(autoSymbolScale(0.01)).toBeCloseTo(5, 10);
  });

  it("zmniejsza symbole na rzucie skalibrowanym rzadziej", () => {
    expect(autoSymbolScale(0.2)).toBeCloseTo(0.25, 10);
  });

  it("bez kalibracji zostawia dotychczasowe zachowanie", () => {
    expect(autoSymbolScale(null)).toBe(1);
  });

  it("odrzuca skalę zerową i ujemną zamiast dzielić przez zero", () => {
    expect(autoSymbolScale(0)).toBe(1);
    expect(autoSymbolScale(-0.05)).toBe(1);
  });
});

describe("elementRenderScale", () => {
  it("przy skali odniesienia i suwaku domyślnym daje dokładnie bazowy mnożnik", () => {
    // To jest gwarancja braku regresji: projekty rysowane od zera mają wyglądać
    // identycznie jak przed wprowadzeniem skalowania.
    expect(elementRenderScale(MANUAL_DRAW_SCALE_MPU, DEFAULT_ELEMENT_SCALE)).toBe(BASE_ELEMENT_SCALE);
    expect(elementRenderScale(null, DEFAULT_ELEMENT_SCALE)).toBe(BASE_ELEMENT_SCALE);
  });

  it("suwak mnoży się z wyrównaniem do skali, nie zastępuje go", () => {
    expect(elementRenderScale(0.01, 2)).toBeCloseTo(2 * BASE_ELEMENT_SCALE * 5, 10);
  });

  it("symbol zajmuje tyle samo METRÓW niezależnie od kalibracji", () => {
    const { w } = glyphBoxSize("gniazdko");
    const szerokoscM = (mpu: number) => w * elementRenderScale(mpu, DEFAULT_ELEMENT_SCALE) * mpu;
    expect(szerokoscM(0.01)).toBeCloseTo(szerokoscM(MANUAL_DRAW_SCALE_MPU), 10);
    expect(szerokoscM(0.2)).toBeCloseTo(szerokoscM(MANUAL_DRAW_SCALE_MPU), 10);
  });
});

describe("sanitaryRenderScale", () => {
  it("nie słucha suwaka — bierze tylko skalę rzutu", () => {
    expect(sanitaryRenderScale(0.01)).toBeCloseTo(BASE_ELEMENT_SCALE * 5, 10);
  });

  /**
   * Sedno całej zmiany: obrys wanny NA RYSUNKU ma się pokrywać ze strefą 1, którą
   * liczy `computeSanitaryZones` (szerokość w metrach dzielona przez `mpu`). Wcześniej
   * pudełka glifów były dobrane na oko i rozjeżdżały się nawet o jedną piątą.
   */
  it.each(Object.keys(SANITARY_FIXTURES) as (keyof typeof SANITARY_FIXTURES)[])(
    "obrys przyboru %s zgadza się co do jednostki ze strefą liczoną przez walidator",
    (type) => {
      const f = SANITARY_FIXTURES[type]!;
      for (const mpu of [0.05, 0.01, 0.2, 0.004]) {
        const box = glyphBoxSize(type);
        expect(box.w * sanitaryRenderScale(mpu)).toBeCloseTo(f.widthM / mpu, 8);
        expect(box.h * sanitaryRenderScale(mpu)).toBeCloseTo(f.depthM / mpu, 8);
      }
    }
  );
});

describe("glyphBoxSize dla przyborów sanitarnych", () => {
  it("wynika z prawdziwych wymiarów, nie z wartości dobranych na oko", () => {
    expect(glyphBoxSize("wanna").w).toBeCloseTo(1.7 * JEDNOSTKI_NA_METR, 10);
    expect(glyphBoxSize("wanna").h).toBeCloseTo(0.75 * JEDNOSTKI_NA_METR, 10);
    expect(glyphBoxSize("prysznic")).toEqual({ w: glyphBoxSize("prysznic").h, h: glyphBoxSize("prysznic").h });
  });

  it("osprzęt zostaje przy rozmiarze umownym", () => {
    expect(glyphBoxSize("gniazdko")).toEqual({ w: 18, h: 22 });
  });
});

/**
 * Rzut BEZ skalibrowanej skali. Dotad symbole mialy tu po prostu rozmiar bazowy, wiec
 * na rysunku rozciagnietym na kilka tysiecy jednostek gniazdko schodzilo do kilku
 * pikseli. Teraz brakujaca skale zastepuje domysl wyciagniety z samego rysunku.
 */
describe("skalaZRysunku — rzut bez kalibracji", () => {
  it("rysunek typowej wielkosci nie zmienia niczego", () => {
    expect(skalaZRysunku(ROZPIETOSC_ODNIESIENIA)).toBe(1);
  });

  it("rysunek dziesiec razy wiekszy daje dziesiec razy wieksze symbole", () => {
    expect(skalaZRysunku(10 * ROZPIETOSC_ODNIESIENIA)).toBeCloseTo(10, 10);
  });

  /** Tylko powieksza. Rysunek mniejszy od typowego bywa po prostu ZACZETY — jedna
   *  sciana, jeden pokoj — i zmniejszanie symboli na takiej podstawie psuloby
   *  czytelnosc zamiast ja poprawiac. */
  it("rysunek mniejszy od typowego NIE zmniejsza symboli", () => {
    expect(skalaZRysunku(30)).toBe(1);
    expect(skalaZRysunku(ROZPIETOSC_ODNIESIENIA / 2)).toBe(1);
  });

  it("jedno zablakane klikniecie daleko od domu nie hoduje symboli bez konca", () => {
    expect(skalaZRysunku(500000)).toBeLessThanOrEqual(20);
  });

  /**
   * Pusta kondygnacja zostaje przy rozmiarze bazowym — NIE bierze rozpietosci obszaru
   * planu. Obszar dopasowuje sie do proporcji wgranego podkladu (`planSizeForImage`),
   * wiec panorama 3:1 dawalaby symbole 1,45x wieksze, a pierwszy narysowany pokoj
   * zrzucalby je z powrotem do 1,0x — skok w dol w nagrode za narysowanie czegokolwiek.
   */
  it("bez narysowanych scian zostaje rozmiar bazowy", () => {
    expect(skalaZRysunku(null)).toBe(1);
    expect(skalaZRysunku(0)).toBe(1);
  });
});

/**
 * Domysl z rysunku dziala WYLACZNIE bez kalibracji. Po zmierzeniu skali liczy sie
 * liczba, nie domysl — inaczej rzut skalibrowany zmienialby wyglad przy kazdej
 * dorysowanej scianie.
 */
describe("zmierzona skala bije domysl z rysunku", () => {
  it("autoSymbolScale ignoruje domysl, gdy mpu jest znane", () => {
    expect(autoSymbolScale(MANUAL_DRAW_SCALE_MPU, 8)).toBe(1);
    expect(autoSymbolScale(MANUAL_DRAW_SCALE_MPU / 5, 8)).toBeCloseTo(5, 10);
  });

  it("bez mpu przechodzi domysl — dla osprzetu i dla przyborow tak samo", () => {
    expect(autoSymbolScale(null, 6)).toBe(6);
    expect(elementRenderScale(null, DEFAULT_ELEMENT_SCALE, 6)).toBeCloseTo(6 * BASE_ELEMENT_SCALE, 10);
    // Przybory nie slchaja SUWAKA, ale domyslu z rysunku juz tak: bez skali i tak nie ma
    // strefy, o ktorej ich obrys moglby klamac (patrz checkPlan: „Strefy niesprawdzone").
    expect(sanitaryRenderScale(null, 6)).toBeCloseTo(6 * BASE_ELEMENT_SCALE, 10);
    expect(sanitaryRenderScale(null, 6)).toBe(elementRenderScale(null, DEFAULT_ELEMENT_SCALE, 6));
  });

  it("pominiety domysl zachowuje dotychczasowe zachowanie", () => {
    expect(autoSymbolScale(null)).toBe(1);
    expect(elementRenderScale(null, DEFAULT_ELEMENT_SCALE)).toBe(BASE_ELEMENT_SCALE);
  });
});
