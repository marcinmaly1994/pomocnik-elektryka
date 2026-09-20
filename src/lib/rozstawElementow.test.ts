import { describe, it, expect } from "vitest";
import { bezNakladaniaNaSasiadow, kierunekWzdluzSciany, odsunOdSasiadow, pudelkoSymbolu, rozsuwalny, type ZajetySymbol } from "./rozstawElementow";
import type { InstallationElement } from "@/types";

/**
 * Rozsuwanie osprzętu stawianego blisko siebie.
 *
 * Klik decyduje o ŚRODKU symbolu, a symbol ma swoją szerokość — o której klikający nie
 * myśli. Dwa gniazda obok siebie lądowały więc jedno na drugim i spod wierzchniego nie
 * dało się już wyciągnąć tego pod spodem ani zobaczyć, że tam jest.
 */
describe("kierunekWzdluzSciany", () => {
  /** Trzonek symbolu patrzy PROSTOPADLE do ściany, więc ściana biegnie prostopadle do niego. */
  it("ściana pionowa (trzonek w lewo, obrót 270°) rozsuwa w pionie", () => {
    const k = kierunekWzdluzSciany(270);
    expect(k.x).toBeCloseTo(0, 10);
    expect(Math.abs(k.y)).toBeCloseTo(1, 10);
  });

  it("ściana pozioma (trzonek do góry, obrót 0°) rozsuwa w poziomie", () => {
    const k = kierunekWzdluzSciany(0);
    expect(Math.abs(k.x)).toBeCloseTo(1, 10);
    expect(k.y).toBeCloseTo(0, 10);
  });

  it("kierunek jest wektorem jednostkowym przy każdym obrocie", () => {
    for (const obrot of [0, 45, 90, 137, 180, 270, 359]) {
      const k = kierunekWzdluzSciany(obrot);
      expect(Math.hypot(k.x, k.y), `obrót ${obrot}°`).toBeCloseTo(1, 10);
    }
  });
});

describe("odsunOdSasiadow", () => {
  /** Gniazdo: pudełko 20 × 16 jedn., stojące prosto. */
  const gniazdo = (x: number, y: number, obrot = 0): ZajetySymbol => ({
    x,
    y,
    polSzer: 10,
    polWys: 8,
    obrot,
  });

  it("bez sąsiadów nie rusza punktu", () => {
    expect(odsunOdSasiadow(gniazdo(100, 100), [], 0)).toEqual({ x: 100, y: 100 });
  });

  it("sąsiad poza zasięgiem nie rusza punktu", () => {
    expect(odsunOdSasiadow(gniazdo(140, 100), [gniazdo(100, 100)], 0)).toEqual({ x: 140, y: 100 });
  });

  /**
   * Sedno zgłoszenia „za daleko od siebie": przesunięcie kończy się na STYKU pudełek,
   * czyli 20 jedn. dla dwóch symboli o szerokości 20. Wcześniej liczyliśmy połową
   * PRZEKĄTNEJ i wychodziło ~25,6 — o 28% za dużo, i to było widać.
   */
  it("rozsuwa dokładnie do styku pudełek, nie dalej", () => {
    const wynik = odsunOdSasiadow(gniazdo(105, 100), [gniazdo(100, 100)], 0);
    expect(wynik.x).toBeCloseTo(120, 6);
    expect(wynik.y).toBeCloseTo(100, 6);
  });

  it("odsuwa na TĘ stronę, po której element już jest", () => {
    expect(odsunOdSasiadow(gniazdo(95, 100), [gniazdo(100, 100)], 0).x).toBeCloseTo(80, 6);
  });

  it("rząd gniazd przechodzi wzdłuż, zamiast utknąć na pierwszym", () => {
    const rzad = [gniazdo(100, 100), gniazdo(120, 100), gniazdo(140, 100)];
    const wynik = odsunOdSasiadow(gniazdo(104, 100), rzad, 0);
    expect(wynik.x).toBeCloseTo(160, 6);
  });

  /**
   * Sąsiad na innej wysokości montażu mija się bokiem — nie ma czego rozsuwać.
   * Model kołowy odpychał go tu niepotrzebnie, bo koło sięga dalej niż pudełko.
   */
  it("sąsiad odsunięty w poprzek nie przeszkadza", () => {
    const wynik = odsunOdSasiadow(gniazdo(100, 118), [gniazdo(100, 100)], 0);
    expect(wynik).toEqual({ x: 100, y: 118 });
  });

  it("rozsuwa w pionie, gdy tak biegnie ściana", () => {
    const naPionowej = (x: number, y: number) => gniazdo(x, y, 270);
    const wynik = odsunOdSasiadow(naPionowej(100, 105), [naPionowej(100, 100)], 270);
    expect(wynik.x).toBeCloseTo(100, 6);
    expect(wynik.y).toBeCloseTo(120, 6);
  });

  /** Sąsiad obrócony inaczej (tuż za rogiem) liczy się SWOIM pudełkiem, nie naszym. */
  it("sąsiad obrócony o 90° zajmuje wzdłuż tyle, ile ma wysokości", () => {
    const wynik = odsunOdSasiadow(gniazdo(105, 100), [gniazdo(100, 100, 90)], 0);
    // nasza połowa szerokości (10) + jego połowa WYSOKOŚCI (8), bo leży bokiem
    expect(wynik.x).toBeCloseTo(118, 6);
  });

  it("klik w sam środek sąsiada też zostaje rozsunięty", () => {
    const wynik = odsunOdSasiadow(gniazdo(100, 100), [gniazdo(100, 100)], 0);
    expect(Math.abs(wynik.x - 100)).toBeCloseTo(20, 6);
  });

  it("zdegenerowane pudełko nie zapętla liczenia", () => {
    const zero: ZajetySymbol = { x: 100, y: 100, polSzer: 0, polWys: 0, obrot: 0 };
    expect(odsunOdSasiadow(zero, [zero], 0)).toEqual({ x: 100, y: 100 });
  });
});

/**
 * Trzy funkcje, które dotąd siedziały wewnątrz komponentu `DesignTab` i dało się je
 * sprawdzić wyłącznie klikając po planie w przeglądarce. Tutaj są tym, czym naprawdę
 * są: geometrią symbolu, bez ani jednego kawałka stanu.
 */
describe("pudełko symbolu i rozsuwanie od sąsiadów", () => {
  const el = (over: Partial<InstallationElement> = {}): InstallationElement => ({
    id: Math.random().toString(36).slice(2),
    type: "gniazdko",
    x: 0,
    y: 0,
    room: "Salon",
    floor: "parter",
    dedicated: false,
    note: "",
    gangs: 1,
    ...over,
  });

  it("pudełko skaluje się razem z symbolem", () => {
    const male = pudelkoSymbolu(el(), 1);
    const duze = pudelkoSymbolu(el(), 2);
    expect(duze.polSzer).toBeCloseTo(male.polSzer * 2, 5);
    expect(duze.polWys).toBeCloseTo(male.polWys * 2, 5);
  });

  it("pudełko siedzi w miejscu elementu i niesie jego obrót", () => {
    const p = pudelkoSymbolu(el({ x: 40, y: 15, rotation: 90 }), 1);
    expect(p).toMatchObject({ x: 40, y: 15, obrot: 90 });
  });

  /**
   * Przybory sanitarne NIE są rozsuwane. Wanna czy umywalka to wyposażenie
   * pomieszczenia, a nie urządzenie instalacji: gniazdo stojące „na" wannie nie jest
   * pomyłką do poprawienia, tylko sytuacją, o której ma się wypowiedzieć sprawdzenie
   * stref ochronnych. Odpychanie gniazda od wanny kasowało dokładnie ten przypadek.
   */
  it("przybór sanitarny nie jest rozsuwany", () => {
    expect(rozsuwalny({ type: "wanna" })).toBe(false);
    expect(rozsuwalny({ type: "gniazdko" })).toBe(true);
  });

  it("przybór sanitarny zostaje dokładnie tam, gdzie go postawiono", () => {
    const wanna = el({ type: "wanna", x: 100, y: 100 });
    const poz = bezNakladaniaNaSasiadow(wanna, [el({ x: 100, y: 100 })], 1, 0.05);
    expect(poz).toEqual({ x: 100, y: 100 });
  });

  it("gniazdo postawione na sąsiedzie odsuwa się od niego", () => {
    const sasiad = el({ x: 100, y: 100 });
    const poz = bezNakladaniaNaSasiadow(el({ x: 100, y: 100 }), [sasiad], 1, 0.05);
    expect(poz.x === 100 && poz.y === 100).toBe(false);
  });

  it("gniazdo z dala od wszystkiego nie rusza się wcale", () => {
    const poz = bezNakladaniaNaSasiadow(el({ x: 500, y: 500 }), [el({ x: 0, y: 0 })], 1, 0.05);
    expect(poz).toEqual({ x: 500, y: 500 });
  });

  /**
   * Przy PRZECIĄGANIU trzeba pominąć sam przesuwany element: liczony jako sąsiad
   * zderzałby się ze swoją własną nową pozycją i odpychał się w nieskończoność.
   */
  it("przesuwany element nie odpycha sam siebie", () => {
    const ten = el({ id: "ten", x: 100, y: 100 });
    const poz = bezNakladaniaNaSasiadow(ten, [ten], 1, 0.05, "ten");
    expect(poz).toEqual({ x: 100, y: 100 });
  });
});
