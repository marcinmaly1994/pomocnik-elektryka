import { describe, it, expect, beforeAll } from "vitest";
import { buildKompletPdf, buildStronaTytulowaDoc, dostepneDokumenty, spisTresci, type StanDokumentow } from "./komplet";
import { createPdfDoc } from "./engine";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader } from "@/types";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom jednorodzinny", adres: "ul. Testowa 1", zleceniodawca: "Anna Nowak", wykonawca: "Jan Kowalski",
  uprawnienia: "", przyrzad: "", nrFabryczny: "", swiadectwo: "",
  data: "2026-09-06", temperatura: "20", wilgotnosc: "55", uklad: "TN-S",
  drawingNo: "E-01", revision: "A",
};

const pelny: StanDokumentow = {
  kondygnacje: [
    { id: "f1", nazwa: "Parter", maTresc: true },
    { id: "f2", nazwa: "Piętro", maTresc: true },
  ],
  maAparaty: true,
  maObwody: true,
  maKosztorys: true,
  protokoly: [
    { key: "izolacja", tytul: "Pomiar rezystancji izolacji", wierszy: 3 },
    { key: "petla", tytul: "Pomiar impedancji pętli zwarcia", wierszy: 0 },
  ],
};

describe("dostepneDokumenty", () => {
  it("daje po jednym rzucie na kondygnację z narysowaną treścią", () => {
    const ids = dostepneDokumenty(pelny).map((p) => p.id);
    expect(ids).toContain("rzut:f1");
    expect(ids).toContain("rzut:f2");
  });

  /** Pusta kondygnacja to kartka z samą tabliczką — nie ma jej na liście, zamiast
   *  wyszarzonego wiersza, przy którym użytkownik zgaduje, czego brakuje. */
  it("pomija kondygnację bez narysowanej treści", () => {
    const stan = { ...pelny, kondygnacje: [{ id: "f3", nazwa: "Strych", maTresc: false }] };
    expect(dostepneDokumenty(stan).map((p) => p.id)).not.toContain("rzut:f3");
  });

  it("pomija protokół bez ani jednego wiersza", () => {
    const ids = dostepneDokumenty(pelny).map((p) => p.id);
    expect(ids).toContain("protokol:izolacja");
    expect(ids).not.toContain("protokol:petla");
  });

  it("bez rozdzielnicy nie ma schematu, legendy ani pasków", () => {
    const ids = dostepneDokumenty({ ...pelny, maAparaty: false }).map((p) => p.id);
    ["schemat", "legenda", "paski"].forEach((id) => expect(ids).not.toContain(id));
  });

  /**
   * Domyślny wybór to PROJEKT: rysunki, dobór i kosztorys. Paski opisowe są wydrukiem
   * warsztatowym do wycięcia, a protokoły dotyczą odbioru — jedno i drugie wchodzi
   * świadomie, nie przez przeoczenie.
   */
  it("paski i protokoły są domyślnie odznaczone, reszta zaznaczona", () => {
    const poz = dostepneDokumenty(pelny);
    const domyslne = poz.filter((p) => p.domyslnie).map((p) => p.id);
    expect(domyslne).toEqual(["rzut:f1", "rzut:f2", "schemat", "legenda", "obliczenia", "kosztorys"]);
  });

  it("każda pozycja wie, w której zakładce mieszka jej producent", () => {
    const poz = dostepneDokumenty(pelny);
    expect(poz.find((p) => p.id === "rzut:f1")).toMatchObject({ zakladka: "projekt", floorId: "f1" });
    expect(poz.find((p) => p.id === "schemat")?.zakladka).toBe("schemat");
    expect(poz.find((p) => p.id === "obliczenia")?.zakladka).toBe("rozdzielnica");
    expect(poz.find((p) => p.id === "kosztorys")?.zakladka).toBe("kosztorys");
    expect(poz.find((p) => p.id === "protokol:izolacja")?.zakladka).toBe("protokoly");
  });

  it("pusty projekt nie oferuje niczego", () => {
    expect(
      dostepneDokumenty({ kondygnacje: [], maAparaty: false, maObwody: false, maKosztorys: false, protokoly: [] })
    ).toEqual([]);
  });
});

describe("strona tytułowa i złożenie", () => {
  it("niesie metryczkę i spis treści", async () => {
    const out = bytesToAscii(await buildStronaTytulowaDoc(header, ["Rzut — Parter", "Kosztorys instalacji"]).finish());
    expect(out).toContain("DOKUMENTACJA");
    expect(out).toContain("Dom jednorodzinny");
    expect(out).toContain("Anna Nowak");
    expect(out).toContain("ZAWARTO"); // „ZAWARTOŚĆ" — polskie znaki idą przez osadzony font
    expect(out).toContain("Kosztorys instalacji");
  });

  /** Spis treści jest jedynym miejscem, w którym widać, że kompletu NIE złożono
   *  w całości — np. bez protokołów. */
  it("spis treści wymienia dokładnie wybrane pozycje, w ich kolejności", () => {
    const wybrane = dostepneDokumenty(pelny).filter((p) => p.domyslnie);
    expect(spisTresci(wybrane)).toEqual([
      "Rzut — Parter",
      "Rzut — Piętro",
      "Schemat jednokreskowy",
      "Legenda rozdzielnicy",
      "Karta obliczeń obwodów",
      "Kosztorys instalacji",
    ]);
  });

  it("składa strony wszystkich dokumentów, każdą w jej własnym formacie", async () => {
    const tytulowa = buildStronaTytulowaDoc(header, ["A", "B"]);
    const pion = createPdfDoc();
    pion.text("kosztorys", pion.margin, pion.y);
    const poziom = createPdfDoc({ pageW: 841.89, pageH: 595.28 });
    poziom.text("rzut", poziom.margin, poziom.y);

    const out = bytesToAscii(await buildKompletPdf([tytulowa, pion, poziom]));
    expect((out.match(/\/Type \/Page /g) || []).length).toBe(3);
    expect(out).toContain("/MediaBox [0 0 841.89 595.28]");
    expect(out).toContain("(kosztorys)");
    expect(out).toContain("(rzut)");
  });
});
