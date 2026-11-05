import { describe, expect, it } from "vitest";
import { filtruj, GRUPY, normalizuj, pogrupuj, type PozycjaKalkulatora } from "./grupy";
import type { CalcId } from "@/store/useCalculatorsStore";

const lista: PozycjaKalkulatora[] = [
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana i prąd do wniosku o przyłączenie" },
  { id: "obwod", label: "Dobór obwodu", desc: "przekrój, zabezpieczenie, WLZ i cztery kryteria w jednym" },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN" },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT" },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD" },
  { id: "kompensacja", label: "Kompensacja mocy biernej", desc: "moc baterii, pojemność, rezonans" },
];

describe("pogrupuj", () => {
  it("uklada pozycje w grupy wedlug etapu pracy", () => {
    const grupy = pogrupuj(lista);
    expect(grupy.find((g) => g.grupa.id === "start")!.pozycje.map((p) => p.id)).toEqual(["moc"]);
    expect(grupy.find((g) => g.grupa.id === "obwod")!.pozycje.map((p) => p.id)).toEqual(["obwod"]);
    expect(grupy.find((g) => g.grupa.id === "ochrona")!.pozycje.map((p) => p.id)).toEqual(["petla", "uziemienieTT", "rcd"]);
  });

  it("zachowuje kolejnosc z definicji grupy, nie z listy wejsciowej", () => {
    const odwrocona = [...lista].reverse();
    expect(pogrupuj(odwrocona).find((g) => g.grupa.id === "ochrona")!.pozycje.map((p) => p.id)).toEqual([
      "petla",
      "uziemienieTT",
      "rcd",
    ]);
  });

  /**
   * Sedno: dolozenie kalkulatora bez dopisania go do grupy to przeoczenie, a nie
   * powod, zeby uzytkownik przestal go widziec.
   */
  it("pozycja spoza grup ladu­je na koncu Zaawansowanych, zamiast zniknac", () => {
    // Id spoza wszystkich grup — w kodzie produkcyjnym kazdy jest przypisany, wiec
    // ten przypadek da sie odtworzyc tylko sztucznie. O to wlasnie chodzi: chronimy
    // przed dolozeniem kalkulatora BEZ dopisania go do grupy.
    const zNowym = [...lista, { id: "jeszczeNieprzypisany" as CalcId, label: "Nowy", desc: "bez grupy" }];
    const zaawansowane = pogrupuj(zNowym).find((g) => g.grupa.id === "zaawansowane")!;
    expect(zaawansowane.pozycje.map((p) => p.id)).toContain("jeszczeNieprzypisany");
    expect(zaawansowane.pozycje[zaawansowane.pozycje.length - 1].id).toBe("jeszczeNieprzypisany");
  });

  it("kazda pozycja trafia dokladnie raz", () => {
    const wszystkie = pogrupuj(lista).flatMap((g) => g.pozycje.map((p) => p.id));
    expect(new Set(wszystkie).size).toBe(wszystkie.length);
    expect(wszystkie.length).toBe(lista.length);
  });

  it("tylko Zaawansowane sa zwiniete domyslnie", () => {
    expect(GRUPY.filter((g) => g.domyslnieZwinieta).map((g) => g.id)).toEqual(["zaawansowane"]);
  });
});

describe("filtruj", () => {
  it("pusta fraza nie filtruje", () => {
    expect(filtruj(lista, "   ")).toHaveLength(lista.length);
  });

  it("szuka po nazwie", () => {
    expect(filtruj(lista, "impedancja").map((p) => p.id)).toEqual(["petla"]);
  });

  /** Kto wpisze „RCD", ma trafic w rozniowke, mimo ze pelna nazwa brzmi inaczej. */
  it("szuka takze po OPISIE", () => {
    expect(filtruj(lista, "rcd").map((p) => p.id)).toEqual(["rcd"]);
    expect(filtruj(lista, "uklad TT").map((p) => p.id)).toEqual(["uziemienieTT"]);
  });

  it("ignoruje wielkosc liter i polskie ogonki", () => {
    expect(filtruj(lista, "PETLI").map((p) => p.id)).toEqual(["petla"]);
    expect(filtruj(lista, "wylacznika").map((p) => p.id)).toEqual(["rcd"]);
    expect(filtruj(lista, "przylacz").map((p) => p.id)).toEqual(["moc"]);
  });

  it("fraza bez trafien daje pusta liste, a nie cala", () => {
    expect(filtruj(lista, "termowizja")).toEqual([]);
  });

  it("normalizuj sprowadza ogonki i wielkosc liter do jednej postaci", () => {
    expect(normalizuj("Wyłącznik RÓŻNICOWOprądowy")).toBe("wylacznik roznicowopradowy");
  });
});
