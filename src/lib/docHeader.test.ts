import { describe, it, expect } from "vitest";
import { resolveDocHeader } from "./docHeader";
import { slugify, projectFileName } from "./pdf/download";
import type { DocumentHeader } from "@/types";

const base: DocumentHeader = {
  obiekt: "", adres: "", zleceniodawca: "", wykonawca: "Jan Kowalski", uprawnienia: "",
  przyrzad: "", nrFabryczny: "", swiadectwo: "", data: "2026-08-19",
  temperatura: "20", wilgotnosc: "55", uklad: "TN-S", drawingNo: "E-01", revision: "A",
};

describe("resolveDocHeader", () => {
  it("uzupełnia pusty Obiekt nazwą projektu", () => {
    expect(resolveDocHeader(base, "Dom Kowalskiego").obiekt).toBe("Dom Kowalskiego");
  });

  it("nie nadpisuje Obiektu wpisanego przez użytkownika", () => {
    const filled = { ...base, obiekt: "Hala nr 3" };
    expect(resolveDocHeader(filled, "Dom Kowalskiego").obiekt).toBe("Hala nr 3");
  });

  it("traktuje same spacje jak puste pole", () => {
    expect(resolveDocHeader({ ...base, obiekt: "   " }, "Dom").obiekt).toBe("Dom");
  });

  it("nie rusza pozostałych pól nagłówka", () => {
    expect(resolveDocHeader(base, "Dom").wykonawca).toBe("Jan Kowalski");
  });
});

describe("slugify", () => {
  it("zamienia polskie znaki na ASCII", () => {
    expect(slugify("Zaświęcone Łąki ćma ńć óź")).toBe("zaswiecone-laki-cma-nc-oz");
  });

  it("skleja spacje i znaki specjalne w pojedyncze myślniki", () => {
    expect(slugify("Dom   Kowalskiego / etap 2")).toBe("dom-kowalskiego-etap-2");
  });

  it("nie zostawia myślników na brzegach", () => {
    expect(slugify("  — Dom —  ")).toBe("dom");
  });

  it("zwraca pusty string dla nazwy bez znaków alfanumerycznych", () => {
    expect(slugify("!!! ---")).toBe("");
  });

  it("ogranicza długość, żeby nie tworzyć absurdalnie długich nazw plików", () => {
    expect(slugify("a".repeat(200)).length).toBe(60);
  });
});

describe("projectFileName", () => {
  it("dokleja slug nazwy projektu", () => {
    expect(projectFileName("kosztorys", "Dom Kowalskiego", "csv")).toBe("kosztorys-dom-kowalskiego.csv");
  });

  it("pomija slug, gdy nazwa projektu nic nie wnosi", () => {
    expect(projectFileName("protokol-ogledziny", "   ", "pdf")).toBe("protokol-ogledziny.pdf");
  });
});
