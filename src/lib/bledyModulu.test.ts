import { beforeEach, describe, expect, it, vi } from "vitest";
import { ODSTEP_PRZELADOWAN_MS, toBladPobraniaKodu, wolnoPrzeladowac } from "./bledyModulu";

/**
 * Rozpoznanie awarii pobrania kodu decyduje o tym, czy strona sama sie przeladuje.
 * Pomylka w KAZDA strone jest kosztowna: falszywie ujemna zostawia uzytkownika z
 * bialym ekranem po wdrozeniu, falszywie dodatnia zapetla przeladowania na zwyklym
 * bledzie w kodzie, ktorego przeladowanie nie naprawi.
 */
describe("toBladPobraniaKodu", () => {
  it("rozpoznaje komunikaty przegladarek dla nieudanego import()", () => {
    const prawdziwe = [
      // Chrome / Edge
      new Error("Failed to fetch dynamically imported module: https://x.pl/assets/CalculatorsTab-a1b2.js"),
      // Firefox
      new Error("error loading dynamically imported module"),
      // Safari
      new Error("Importing a module script failed."),
      // Vite, gdy padnie arkusz stylow kawalka
      new Error("Unable to preload CSS for /assets/DesignTab-c3d4.css"),
    ];
    for (const b of prawdziwe) expect(toBladPobraniaKodu(b)).toBe(true);
  });

  it("nazwa ChunkLoadError wystarczy, nawet gdy tresc nic nie mowi", () => {
    const b = new Error("cos sie nie udalo");
    b.name = "ChunkLoadError";
    expect(toBladPobraniaKodu(b)).toBe(true);
  });

  it("ZWYKLY blad w kodzie NIE jest awaria pobrania — inaczej wpadlibysmy w petle", () => {
    expect(toBladPobraniaKodu(new TypeError("Cannot read properties of undefined (reading 'label')"))).toBe(false);
    expect(toBladPobraniaKodu(new Error("Nie udało się złożyć kompletu."))).toBe(false);
    expect(toBladPobraniaKodu(null)).toBe(false);
    expect(toBladPobraniaKodu(undefined)).toBe(false);
  });

  it("radzi sobie z tym, co nie jest bledem — React potrafi rzucic czymkolwiek", () => {
    expect(toBladPobraniaKodu("failed to fetch dynamically imported module")).toBe(true);
    expect(toBladPobraniaKodu({ nic: 1 })).toBe(false);
  });
});

describe("wolnoPrzeladowac", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("pierwsze pytanie dostaje zgode", () => {
    expect(wolnoPrzeladowac()).toBe(true);
  });

  it("drugie pytanie od razu po pierwszym jej NIE dostaje — to cala ochrona przed petla", () => {
    const teraz = 1_000_000;
    expect(wolnoPrzeladowac(teraz)).toBe(true);
    expect(wolnoPrzeladowac(teraz + 100)).toBe(false);
    expect(wolnoPrzeladowac(teraz + ODSTEP_PRZELADOWAN_MS - 1)).toBe(false);
  });

  /** Druga aktualizacja w trakcie dlugiej sesji ma sie wyleczyc tak samo jak pierwsza. */
  it("po uplywie odstepu zgoda wraca", () => {
    const teraz = 1_000_000;
    expect(wolnoPrzeladowac(teraz)).toBe(true);
    expect(wolnoPrzeladowac(teraz + ODSTEP_PRZELADOWAN_MS)).toBe(true);
  });

  it("bez dostepu do sessionStorage NIE przeladowujemy — nie ma jak wykluczyc petli", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("brak dostepu do danych witryny");
    });
    expect(wolnoPrzeladowac()).toBe(false);
    spy.mockRestore();
  });
});
