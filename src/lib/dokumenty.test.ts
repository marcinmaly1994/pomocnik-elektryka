import { describe, it, expect } from "vitest";
import { filtrujPoRodzaju, LIMIT_ZAPISOW, rodzajDokumentu, sprawdzLimit, znajdzPoNazwie } from "./dokumenty";

const poz = (id: string, kind?: string | null) => ({ id, kind });

describe("rodzajDokumentu", () => {
  it("zapis bez pola kind to projekt — takie powstawały przed rozdzieleniem rodzajów", () => {
    expect(rodzajDokumentu({ kind: undefined })).toBe("projekt");
    expect(rodzajDokumentu({ kind: null })).toBe("projekt");
  });

  it("rozpoznaje zestaw protokołów", () => {
    expect(rodzajDokumentu({ kind: "protokoly" })).toBe("protokoly");
  });
});

describe("filtrujPoRodzaju", () => {
  it("stare zapisy trafiają na listę projektów, nie protokołów", () => {
    const lista = [poz("a"), poz("b", "projekt"), poz("c", "protokoly")];
    expect(filtrujPoRodzaju(lista, "projekt").map((p) => p.id)).toEqual(["a", "b"]);
    expect(filtrujPoRodzaju(lista, "protokoly").map((p) => p.id)).toEqual(["c"]);
  });
});

describe("sprawdzLimit", () => {
  const piecProtokolow = Array.from({ length: LIMIT_ZAPISOW }, (_, i) => poz(`p${i}`, "protokoly"));

  it("poniżej limitu przepuszcza nowy zapis", () => {
    expect(sprawdzLimit(piecProtokolow.slice(0, 4), "protokoly", null).zablokowany).toBe(false);
  });

  it("na limicie blokuje NOWY zapis i mówi, co zrobić", () => {
    const w = sprawdzLimit(piecProtokolow, "protokoly", null);
    expect(w.zablokowany).toBe(true);
    expect(w.ile).toBe(LIMIT_ZAPISOW);
    expect(w.komunikat).toMatch(/Usuń jedną/);
  });

  it("nadpisanie istniejącego NIE jest blokowane nawet przy pełnym limicie", () => {
    // Inaczej praca nad piątym dokumentem stawałaby się niezapisywalna — użytkownik
    // musiałby usunąć to, co właśnie edytuje, żeby móc to zapisać.
    expect(sprawdzLimit(piecProtokolow, "protokoly", "p2").zablokowany).toBe(false);
  });

  it("id z INNEGO rodzaju nie liczy się jako nadpisanie", () => {
    const lista = [...piecProtokolow, poz("x", "projekt")];
    expect(sprawdzLimit(lista, "protokoly", "x").zablokowany).toBe(true);
  });

  it("limity rodzajów są niezależne — pięć projektów nie blokuje protokołów", () => {
    const lista = Array.from({ length: LIMIT_ZAPISOW }, (_, i) => poz(`d${i}`, "projekt"));
    expect(sprawdzLimit(lista, "protokoly", null).zablokowany).toBe(false);
    expect(sprawdzLimit(lista, "projekt", null).zablokowany).toBe(true);
  });
});

describe("znajdzPoNazwie", () => {
  const lista = [
    { id: "a", name: "Mój dom", kind: "projekt" },
    { id: "b", name: "Hala nr 3", kind: "protokoly" },
    { id: "c", name: "Stary zapis", kind: undefined },
  ];

  it("znajduje dokument tego samego rodzaju o tej samej nazwie", () => {
    expect(znajdzPoNazwie(lista, "projekt", "Mój dom")).toBe("a");
  });

  it("ignoruje wielkość liter i spacje na brzegach — dla użytkownika to ta sama nazwa", () => {
    expect(znajdzPoNazwie(lista, "projekt", "  mój DOM ")).toBe("a");
  });

  it("nie myli rodzajów — protokoły o nazwie projektu nie są nadpisywane", () => {
    expect(znajdzPoNazwie(lista, "protokoly", "Mój dom")).toBeNull();
    expect(znajdzPoNazwie(lista, "protokoly", "Hala nr 3")).toBe("b");
  });

  it("stary zapis bez `kind` liczy się jako projekt i też da się nadpisać", () => {
    expect(znajdzPoNazwie(lista, "projekt", "Stary zapis")).toBe("c");
  });

  it("pusta nazwa nie dopasowuje się do niczego", () => {
    expect(znajdzPoNazwie(lista, "projekt", "   ")).toBeNull();
  });

  it("brak dopasowania zwraca null — powstanie nowy dokument", () => {
    expect(znajdzPoNazwie(lista, "projekt", "Nowy obiekt")).toBeNull();
  });
});
