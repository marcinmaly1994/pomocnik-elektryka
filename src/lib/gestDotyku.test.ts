import { describe, expect, it } from "vitest";
import { dystansPalcow, kadrPodPalcem, kierunekPalca, srodekPalcow, zoomZeSzczypania } from "./gestDotyku";

const GRANICE = { min: 0.2, max: 4 };

describe("szczypanie dwoma palcami", () => {
  it("rozsunięcie palców dwukrotnie przybliża dwukrotnie", () => {
    expect(zoomZeSzczypania(1, 100, 200, GRANICE)).toBeCloseTo(2, 6);
  });

  it("zsunięcie palców oddala w tej samej proporcji", () => {
    expect(zoomZeSzczypania(2, 200, 100, GRANICE)).toBeCloseTo(1, 6);
  });

  /**
   * Proporcja liczona od POCZĄTKU gestu, nie od poprzedniej klatki: powrót palców do
   * rozstawu startowego musi oddać dokładnie startowe powiększenie, choćby po drodze
   * przeszły przez pół ekranu.
   */
  it("powrót do startowego rozstawu oddaje startowe powiększenie", () => {
    const start = 1.37;
    expect(zoomZeSzczypania(start, 140, 140, GRANICE)).toBeCloseTo(start, 6);
  });

  it("nie wychodzi poza granice suwaka", () => {
    expect(zoomZeSzczypania(1, 10, 4000, GRANICE)).toBe(GRANICE.max);
    expect(zoomZeSzczypania(1, 4000, 10, GRANICE)).toBe(GRANICE.min);
  });

  /**
   * Dwa palce postawione jeden na drugim. Dzielenie przez zero dałoby nieskończoność
   * i skok na maksimum — czyli rzut wielkości jednej cegły po najlżejszym dotknięciu.
   */
  it("palce postawione w jednym punkcie nie wywracają powiększenia", () => {
    expect(zoomZeSzczypania(1.5, 0, 300, GRANICE)).toBe(1.5);
    expect(zoomZeSzczypania(1.5, 0.4, 300, GRANICE)).toBe(1.5);
  });

  it("mierzy odległość i środek między palcami", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 30, y: 40 };
    expect(dystansPalcow(a, b)).toBe(50);
    expect(srodekPalcow(a, b)).toEqual({ x: 15, y: 20 });
  });
});

describe("jeden palec nad płótnem", () => {
  it("drżenie przy dotknięciu nie jest jeszcze przesuwaniem", () => {
    expect(kierunekPalca(4, 3)).toBe("za-wcześnie");
  });

  it("ruch w bok przesuwa rzut", () => {
    expect(kierunekPalca(20, 5)).toBe("poziomo");
    expect(kierunekPalca(-20, -12)).toBe("poziomo");
  });

  it("ruch w pionie zostaje przeglądarce", () => {
    expect(kierunekPalca(3, 25)).toBe("pionowo");
    expect(kierunekPalca(-8, -30)).toBe("pionowo");
  });
});

describe("kadr pod palcem", () => {
  it("chwycony punkt planu zostaje pod palcem", () => {
    const kotwica = { x: 120, y: 80 };
    const palec = { x: 300, y: 200 };
    const zoom = 2.5;
    const kadr = kadrPodPalcem(kotwica, palec, zoom);
    // Punkt ekranu `palec` przeliczony z powrotem na plan musi dać kotwicę.
    expect(kadr.x + palec.x / zoom).toBeCloseTo(kotwica.x, 9);
    expect(kadr.y + palec.y / zoom).toBeCloseTo(kotwica.y, 9);
  });

  it("palec w lewo przesuwa kadr w prawo", () => {
    const kotwica = { x: 100, y: 100 };
    const przed = kadrPodPalcem(kotwica, { x: 200, y: 150 }, 1);
    const po = kadrPodPalcem(kotwica, { x: 150, y: 150 }, 1);
    expect(po.x - przed.x).toBeCloseTo(50, 9);
    expect(po.y).toBeCloseTo(przed.y, 9);
  });
});
