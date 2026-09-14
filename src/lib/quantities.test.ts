import { describe, it, expect } from "vitest";
import type { ElementType, InstallationElement } from "@/types";
import { NO_ROOM } from "./elements";
import { pozycjeZestawieniaDoPdf, summarizeFloor } from "./quantities";

function el(type: ElementType, room: string, gangs = 1): InstallationElement {
  return { id: `${type}-${room}-${gangs}-${Math.random()}`, type, x: 0, y: 0, room, floor: "f1", dedicated: false, note: "", gangs };
}

describe("summarizeFloor", () => {
  it("gniazdo podwójne to jedna sztuka, nie dwie — jedno urządzenie, jedna puszka", () => {
    const z = summarizeFloor([el("gniazdko", "Salon", 2)]);
    expect(z.wiersze).toHaveLength(1);
    expect(z.wiersze[0].label).toBe("Gniazdo 230 V podwójne");
    expect(z.wiersze[0].punktow).toBe(1);
    expect(z.wiersze[0].sztuk).toBe(1);
  });

  it("sztuki różnią się od punktów tylko przy starym zapisie podwójnego łącznika", () => {
    // Jedyne, co zostało z dawnego licznika mechanizmów: projekty sprzed rozdzielenia
    // pojęć, w których podwójny łącznik siedzi jako `gangs: 2`. Mają liczyć się jak wtedy.
    const z = summarizeFloor([el("wlacznik", "Salon", 2)]);
    const w = z.wiersze.find((x) => x.type === "wlacznik")!;
    expect(w.punktow).toBe(1);
    expect(w.sztuk).toBe(2);
  });

  it("typy bez wariantów nie mnożą się przez gangs", () => {
    // Punkt sufitowy z przypadkowym `gangs: 2` w zapisie to nadal jedna oprawa.
    const z = summarizeFloor([el("oswietlenie", "Salon", 2)]);
    expect(z.wiersze[0].sztuk).toBe(1);
  });

  it("sortuje alfabetycznie po nazwie, nie po liczbie", () => {
    const z = summarizeFloor([
      el("wlacznik", "Salon"),
      el("wlacznik", "Salon"),
      el("wlacznik", "Salon"),
      el("gniazdko", "Salon"),
    ]);
    expect(z.wiersze.map((w) => w.label)).toEqual(["Gniazdo 230 V", "Łącznik jednobiegunowy"]);
  });

  it("wyposażenie sanitarne nie jest osprzętem — nie wchodzi do zestawienia", () => {
    const z = summarizeFloor([el("gniazdko", "Łazienka"), el("wanna", "Łazienka"), el("umywalka", "Łazienka")]);
    expect(z.wiersze.map((w) => w.type)).toEqual(["gniazdko"]);
    expect(z.punktowRazem).toBe(1);
    expect(z.pomieszczenia[0].punktow).toBe(1);
  });

  it("rozbija na pomieszczenia", () => {
    const z = summarizeFloor([el("gniazdko", "Salon"), el("gniazdko", "Salon"), el("gniazdko", "Kuchnia")]);
    expect(z.pomieszczenia).toEqual([
      { room: "Kuchnia", sztuk: 1, punktow: 1 },
      { room: "Salon", sztuk: 2, punktow: 2 },
    ]);
  });

  it("„Bez pomieszczenia” ląduje na końcu, nie w środku alfabetu", () => {
    const z = summarizeFloor([el("gniazdko", NO_ROOM), el("gniazdko", "Salon"), el("gniazdko", "Antresola")]);
    expect(z.pomieszczenia.map((p) => p.room)).toEqual(["Antresola", "Salon", NO_ROOM]);
  });

  it("sumy zgadzają się z rozbiciem", () => {
    const z = summarizeFloor([el("wlacznik", "Salon", 2), el("gniazdko", "Kuchnia", 2), el("oswietlenie", "Kuchnia")]);
    // Łącznik ze starego zapisu: dwie sztuki z jednego punktu. Gniazdo podwójne i oprawa:
    // po jednej sztuce. Razem 4 sztuki w 3 punktach.
    expect(z.sztukRazem).toBe(4);
    expect(z.punktowRazem).toBe(3);
    expect(z.pomieszczenia.reduce((s, p) => s + p.sztuk, 0)).toBe(z.sztukRazem);
    expect(z.wiersze.reduce((s, w) => s + w.sztuk, 0)).toBe(z.sztukRazem);
  });

  it("pusta kondygnacja daje puste zestawienie, nie wyjątek", () => {
    const z = summarizeFloor([]);
    expect(z.wiersze).toEqual([]);
    expect(z.pomieszczenia).toEqual([]);
    expect(z.sztukRazem).toBe(0);
  });
});

describe("pozycjeZestawieniaDoPdf", () => {
  it("rozbija na pary rodzaj x pomieszczenie", () => {
    const p = pozycjeZestawieniaDoPdf([
      el("gniazdko", "Salon"),
      el("gniazdko", "Salon"),
      el("gniazdko", "Kuchnia"),
      el("oswietlenie", "Salon"),
    ]);
    expect(p).toEqual([
      { element: "Gniazdo 230 V", pomieszczenie: "Kuchnia", ilosc: 1 },
      { element: "Gniazdo 230 V", pomieszczenie: "Salon", ilosc: 2 },
      { element: "Punkt sufitowy", pomieszczenie: "Salon", ilosc: 1 },
    ]);
  });

  it("liczy sztuki tak samo jak panel i kosztorys", () => {
    // Gniazdo podwójne: jedna sztuka. Stary podwójny łącznik: nadal dwie.
    expect(pozycjeZestawieniaDoPdf([el("gniazdko", "Salon", 2)])[0].ilosc).toBe(1);
    expect(pozycjeZestawieniaDoPdf([el("wlacznik", "Salon", 2)])[0].ilosc).toBe(2);
  });

  it("pomija wyposazenie sanitarne", () => {
    expect(pozycjeZestawieniaDoPdf([el("wanna", "Lazienka")])).toEqual([]);
  });

  it("elementy bez pomieszczenia ida na koniec tabeli", () => {
    const p = pozycjeZestawieniaDoPdf([el("gniazdko", NO_ROOM), el("gniazdko", "Salon")]);
    expect(p.map((x) => x.pomieszczenie)).toEqual(["Salon", NO_ROOM]);
  });
});

/**
 * Zestawienie jako LISTA ZAKUPÓW, nie tylko licznik.
 *
 * Grupowanie po samym typie symbolu wrzucało gniazda pojedyncze i podwójne do jednego
 * wiersza „Gniazdo 230 V". Suma zgadzała się z kosztorysem, ale z takiego wiersza nie
 * dało się zamówić: to dwa różne produkty, o dwóch cenach, a kosztorys wystawia je
 * w dwóch osobnych pozycjach. Wiersz ma się rozdzielać tak samo jak tam.
 */
describe("summarizeFloor — warianty jako osobne wiersze", () => {
  it("pojedyncze i podwójne to DWA wiersze, nie jeden", () => {
    const z = summarizeFloor([
      el("gniazdko", "Salon"),
      el("gniazdko", "Salon"),
      el("gniazdko", "Salon", 2),
    ]);
    const etykiety = z.wiersze.map((w) => w.label);
    expect(etykiety).toEqual(["Gniazdo 230 V", "Gniazdo 230 V podwójne"]);
    expect(z.wiersze.map((w) => w.sztuk)).toEqual([2, 1]);
  });

  it("wiersze mają rozłączne klucze, choć dzielą typ symbolu", () => {
    // Bez tego React dostaje dwa wiersze o tym samym kluczu i gubi jeden z nich.
    const z = summarizeFloor([el("gniazdko", "Salon"), el("gniazdko", "Salon", 2)]);
    expect(z.wiersze).toHaveLength(2);
    const klucze = z.wiersze.map((w) => w.klucz);
    expect(new Set(klucze).size).toBe(klucze.length);
    for (const w of z.wiersze) expect(w.type).toBe("gniazdko");
  });

  it("rozdzielenie nie rusza sum całej kondygnacji", () => {
    const elementy = [el("gniazdko", "Salon"), el("gniazdko", "Salon", 2), el("oswietlenie", "Salon")];
    const z = summarizeFloor(elementy);
    expect(z.sztukRazem).toBe(3);
    expect(z.punktowRazem).toBe(3);
    expect(z.wiersze.reduce((s, w) => s + w.sztuk, 0)).toBe(z.sztukRazem);
  });

  it("stary podwójny łącznik zostaje JEDNYM wierszem — to nie jest wariant produktu", () => {
    const z = summarizeFloor([el("wlacznik", "Salon"), el("wlacznik", "Salon", 2)]);
    expect(z.wiersze).toHaveLength(1);
    expect(z.wiersze[0].sztuk).toBe(3);
    expect(z.wiersze[0].punktow).toBe(2);
  });

  it("tabela do PDF rozdziela warianty w obrębie pomieszczenia", () => {
    const p = pozycjeZestawieniaDoPdf([
      el("gniazdko", "Kuchnia"),
      el("gniazdko", "Kuchnia", 2),
      el("gniazdko", "Kuchnia", 2),
    ]);
    expect(p).toEqual([
      { element: "Gniazdo 230 V", pomieszczenie: "Kuchnia", ilosc: 1 },
      { element: "Gniazdo 230 V podwójne", pomieszczenie: "Kuchnia", ilosc: 2 },
    ]);
  });
});
