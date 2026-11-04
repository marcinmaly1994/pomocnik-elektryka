import { describe, it, expect, beforeAll } from "vitest";
import { buildProtocolPdf } from "./protocol";
import { pdfEscape, pdfTextWidth } from "./engine";
import { stubPdfFontFetch } from "./testFontMock";
import type { DocumentHeader } from "@/types";
import { PROTOCOL_DEFS, type ProtocolRow } from "@/lib/protocols";

function bytesToAscii(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // osadzony font w bajtach jest za duży na jedno wywołanie fromCharCode(...bytes)
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}

beforeAll(stubPdfFontFetch);

const header: DocumentHeader = {
  obiekt: "Dom jednorodzinny", adres: "ul. Testowa 1", zleceniodawca: "Jan Kowalski",
  wykonawca: "Elektryk Sp. z o.o.", uprawnienia: "SEP E/D 1234", przyrzad: "Sonel MPI-540",
  nrFabryczny: "SN12345", swiadectwo: "2026-01-01", data: "2026-08-18",
  temperatura: "20", wilgotnosc: "55", uklad: "TN-S", drawingNo: "E-01", revision: "A",
};

describe("buildProtocolPdf — protokół tabelaryczny (izolacja)", () => {
  it("produkuje poprawny PDF z danymi ogólnymi i wynikiem", async () => {
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", l1n: 500, l1pe: 400, npe: 300 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 500);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("Dom jednorodzinny");
    expect(out).toContain("WYNIK POZYTYWNY");
  });

  it("negatywny wynik pomiaru trafia do treści PDF", async () => {
    const rows: ProtocolRow[] = [{ obwod: "Obwód 1", l1n: 0.1, l1pe: 0.1, npe: 0.1 }];
    const bytes = await buildProtocolPdf("izolacja", header, rows, 500);
    const out = bytesToAscii(bytes);
    expect(out).toContain("WYNIK NEGATYWNY");
  });

  it("brak wierszy -> brak kompletu danych", async () => {
    const bytes = await buildProtocolPdf("izolacja", header, [], 500);
    const out = bytesToAscii(bytes);
    expect(out).toContain("BRAK KOMPLETU DANYCH");
  });
});

describe("buildProtocolPdf — protokół checklistowy (oględziny)", () => {
  it("zawiera pozycje listy kontrolnej i tytuł", async () => {
    const rows: ProtocolRow[] = [{ text: "Zgodność wykonania instalacji z dokumentacją projektową", status: "tak" }];
    const bytes = await buildProtocolPdf("ogledziny", header, rows, 0);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("zgodne");
  });
});

describe("buildProtocolPdf — dopisek Uwagi", () => {
  it("długie uwagi są zawijane bez wyjątków", async () => {
    const longNote = "To jest bardzo długa uwaga testowa ".repeat(10);
    const bytes = await buildProtocolPdf("uziemienie", { ...header, uwagi: longNote }, [{ miejsce: "Uziom główny", r: 5 }], 30);
    const out = bytesToAscii(bytes);
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out).toContain("Uwagi:");
  });
});

/**
 * Układ nagłówka — pilnowany liczbowo, bo obie usterki, które tu wystąpiły, były
 * NIEWIDOCZNE dla testów sprawdzających samą obecność tekstu w pliku: napisy były
 * w PDF-ie, tylko leżały jeden na drugim i pod szarym tłem. Zgłosił to dopiero
 * użytkownik („brakuje nagłówków, na górze jest jakiś szary prostokąt").
 *
 * Strumień treści nie jest kompresowany, więc operatory czyta się wprost:
 *   tekst  ->  `<szarość> g BT /F<n> <rozmiar> Tf <x> <y> Td (...) Tj ET`
 *   tło    ->  `<szarość> g <x> <y> <szer> <wys> re f`
 * `re` liczy od LEWEGO DOLNEGO rogu i rośnie w GÓRĘ — na tym poległa pierwsza wersja.
 */
describe("buildProtocolPdf — układ nagłówka", () => {
  const WYS_STRONY = 842; // A4 w punktach

  async function nagl() {
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{ obwod: "Obwód 1", l1n: 500 }], 500));
    const tytul = out.match(/\/F2 13 Tf [\d.]+ ([\d.]+) Td/);
    const norma = out.match(/0\.35 g BT \/F1 8\.5 Tf [\d.]+ ([\d.]+) Td/);
    const tlo = out.match(/0\.965 g [\d.]+ ([\d.]+) [\d.]+ ([\d.]+) re f/);
    expect(tytul, "brak tytułu 13 pt").not.toBeNull();
    expect(norma, "brak wiersza z normą").not.toBeNull();
    expect(tlo, "brak szarego tła danych ogólnych").not.toBeNull();
    return {
      tytulY: Number(tytul![1]),
      normaY: Number(norma![1]),
      tloDol: Number(tlo![1]),
      tloGora: Number(tlo![1]) + Number(tlo![2]),
    };
  }

  it("tytuł i wiersz z normą nie nachodzą na siebie", async () => {
    const { tytulY, normaY } = await nagl();
    // Tytuł ma 13 pt, więc jego linia potrzebuje co najmniej tyle odstępu.
    expect(tytulY - normaY).toBeGreaterThanOrEqual(13);
  });

  it("szare tło danych ogólnych leży POD nagłówkiem i mieści się na stronie", async () => {
    const { normaY, tloDol, tloGora } = await nagl();
    expect(tloGora).toBeLessThan(normaY); // nie przykrywa tytułu ani normy
    expect(tloGora).toBeLessThan(WYS_STRONY); // nie wychodzi poza krawędź kartki
    expect(tloDol).toBeGreaterThan(0);
  });
});

/**
 * Wyrównanie kolumn tabeli wyników.
 *
 * Zgłoszenie: „dane z protokołów nie są bezpośrednio pod nagłówkami". Pozycje x były
 * przy tym arytmetycznie ZGODNE — wszystko stało przy lewej krawędzi kolumny, więc
 * krótkie „500" siedziało pod lewym skrajem szerokiego „U pom. [V]" i oko wiązało
 * wartość z sąsiednią kolumną. Test mierzy więc ŚRODKI, a nie początki napisów:
 * to one decydują, czy tabela czyta się kolumnami.
 */
describe("buildProtocolPdf — wyrównanie kolumn", () => {
  /** Wszystkie napisy ze strumienia treści wraz z pozycją i krojem. */
  function napisy(out: string) {
    // `(?:\\.|[^)])` — nie tylko "." (kropka), ale KAŻDY znak poprzedzony
    // backslashem (w tym escapowany nawias „\)"), inaczej etykiety z nawiasami
    // w tekście (np. „Typ przewodu (kabla)...") urywały dopasowanie regexu na
    // pierwszym escapowanym „\)", mimo że w samym PDF-ie tekst jest poprawny.
    return [...out.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^)])*)\) Tj ET/g)].map((m) => ({
      bold: m[1] === "F2",
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      t: m[5],
    }));
  }

  it("wartości liczbowe stoją w tej samej osi co ich nagłówki", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    const w = napisy(out);

    const yNag = w.find((n) => n.t === "Ocena")!.y;
    const naglowki = w.filter((n) => Math.abs(n.y - yNag) < 0.5).sort((a, b) => a.x - b.x);
    // Pod pierwszą linią nagłówka stoją jeszcze jego dalsze linie (nagłówki zawijają się do
    // 2–3 linii), więc wiersz danych to pierwszy napis PONIŻEJ całego bloku nagłówka.
    const yDane = Math.max(...w.filter((n) => n.y < yNag - 20).map((n) => n.y));
    const dane = w.filter((n) => Math.abs(n.y - yDane) < 0.5).sort((a, b) => a.x - b.x);
    // Lp. + typ + obwód + 10 par + R wymagana + Ocena
    const oczekiwana = PROTOCOL_DEFS.izolacja.columns!.length + 2;
    expect(naglowki).toHaveLength(oczekiwana);
    expect(dane).toHaveLength(oczekiwana);

    // Środek napisu = początek + połowa jego szerokości.
    const srodek = (n: { x: number; t: string; size: number; bold: boolean }) =>
      n.x + pdfTextWidth(n.t.replace(/\\\d{3}/g, "X"), n.size, n.bold) / 2;

    // Kolumny liczbowe/wyśrodkowane (Lp., pary, R wymagana, Ocena) — nagłówek i
    // wartość muszą mieć wspólną oś. Kolumny 1-2 (typ, obwód) są tekstowe, więc
    // pomijamy je tutaj. 1,5 pt zapasu na przybliżenie tablic metryk.
    for (let i = 0; i < oczekiwana; i++) {
      if (i === 1 || i === 2) continue;
      expect(Math.abs(srodek(naglowki[i]) - srodek(dane[i]))).toBeLessThan(1.5);
    }

    // Kolumny opisowe (typ, obwód) zostają przy LEWEJ — mają zaczynać się w tym
    // samym miejscu w każdym wierszu, więc tu zgadzać ma się początek, nie środek.
    expect(dane[1].x).toBe(naglowki[1].x);
    expect(dane[2].x).toBe(naglowki[2].x);
  });

  it("nagłówki sąsiednich kolumn nie zachodzą na siebie", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    const w = napisy(out);
    const yNag = w.find((n) => n.t === "Ocena")!.y;
    const naglowki = w.filter((n) => Math.abs(n.y - yNag) < 0.5).sort((a, b) => a.x - b.x);

    // „R min [MOhm]" stykało się z „Ocena", bo Ω szło jako trzyznakowe „Ohm".
    for (let i = 0; i < naglowki.length - 1; i++) {
      const koniec = naglowki[i].x + pdfTextWidth(naglowki[i].t.replace(/\\\d{3}/g, "X"), naglowki[i].size, naglowki[i].bold);
      expect(koniec).toBeLessThan(naglowki[i + 1].x);
    }
  });

  it("Ω i ° idą jako własne glify, a nie jako „Ohm” i „st.”", async () => {
    const rows: ProtocolRow[] = [{ typ: "YDYp 3x2,5", obwod: "Obwód 1", l1l2: 250 }];
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    // 146 ósemkowo = \222 (Ω), 147 = \223 (°). Jednostka [MΩ] jest teraz jedna dla
    // całej tabeli (w tekście wstępu), nie powtórzona w każdej kolumnie pary.
    expect(out).toContain("[M\\222]");
    expect(out).toContain("Temperatura [\\223C]");
    expect(out).not.toContain("MOhm");
    expect(out).not.toContain("st.C");
  });
});

/**
 * Protokół jest dokumentem z podpisem, a jego treścią są nazwy obwodów i werdykt. Przycięte
 * wielokropkiem „F8 Gniazda kuchn..", „FI1 63A/30..", „NEGATYW.." i nagłówki „L1-PE/P.."
 * to protokół, którego nie da się zweryfikować przy odbiorze. Te testy pilnują, że NIC nie
 * jest ucinane — przy żadnym z protokołów tabelarycznych.
 */
describe("buildProtocolPdf — nic nie jest ucinane", () => {
  function napisy(out: string) {
    return [...out.matchAll(/BT \/(F\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\.|[^)])*)\) Tj ET/g)].map((m) => ({
      bold: m[1] === "F2",
      size: Number(m[2]),
      x: Number(m[3]),
      y: Number(m[4]),
      t: m[5],
    }));
  }
  const klucze = Object.keys(PROTOCOL_DEFS) as (keyof typeof PROTOCOL_DEFS)[];
  const tabelaryczne = klucze.filter((k) => !PROTOCOL_DEFS[k].checklist);

  it("żaden pogrubiony napis (nagłówek, werdykt, tytuł) nie kończy się wielokropkiem — w żadnym protokole", async () => {
    for (const key of klucze) {
      const out = bytesToAscii(await buildProtocolPdf(key, header, [{}], PROTOCOL_DEFS[key].limitDefault ?? 0));
      const ucięte = napisy(out).filter((n) => n.bold && n.t.endsWith("..")).map((n) => n.t);
      expect(ucięte, key).toEqual([]);
    }
  });

  it("nagłówek „Lp.\" stoi w całości, a nie jako „L\" nad „p.\" — w każdym protokole tabelarycznym", async () => {
    for (const key of tabelaryczne) {
      const out = bytesToAscii(await buildProtocolPdf(key, header, [{}], PROTOCOL_DEFS[key].limitDefault ?? 0));
      expect(napisy(out).some((n) => n.bold && n.t === "Lp."), key).toBe(true);
    }
  });

  it("nazwy kolumn jednego protokołu są unikalne — dwa „Obwód\" obok siebie to nierozróżnialne pola", () => {
    for (const key of tabelaryczne) {
      const etykiety = PROTOCOL_DEFS[key].columns!.map((c) => c.label);
      expect(new Set(etykiety).size, `${key}: ${etykiety.join(" | ")}`).toBe(etykiety.length);
    }
  });

  it("werdykt „NEGATYWNA\" i „pozytywna\" stoi w całości — izolacja, pętla, RCD", async () => {
    const przypadki: [keyof typeof PROTOCOL_DEFS, ProtocolRow[]][] = [
      ["izolacja", [{ obwod: "A", l1n: 250, l1pe: 250 }, { obwod: "B", l1n: 0.4, l1pe: 0.4 }]],
      ["petla", [{ obwod: "A", curve: "B", in: 16, zs: 1.8 }, { obwod: "B", curve: "B", in: 16, zs: 5 }]],
      ["rcd", [{ ozn: "A", idn: 30, typ: "A", sel: "nie", id: 22, t1: 28, t5: 14, ub: 5 }, { ozn: "B", idn: 30, typ: "A", sel: "nie", id: 22, t1: 900, t5: 14, ub: 5 }]],
    ];
    for (const [key, rows] of przypadki) {
      const out = bytesToAscii(await buildProtocolPdf(key, header, rows, PROTOCOL_DEFS[key].limitDefault ?? 500));
      expect(out, `${key}: pozytywna`).toMatch(/\(pozytywna\) Tj/);
      expect(out, `${key}: NEGATYWNA`).toMatch(/\(NEGATYWNA\) Tj/);
    }
  });

  it("długa nazwa obwodu zawija się do kolejnych linii, a każde jej słowo trafia do dokumentu", async () => {
    const nazwa = "F8 Obwod gniazd - pomieszczenia gospodarcze 1 (parter, strefa techniczna)";
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{ obwod: nazwa, l1n: 250 }], 500));
    // Nawiasy w strumieniu PDF są poprzedzone ukośnikiem, więc oczekiwane słowo też.
    for (const slowo of nazwa.split(" ")) expect(out, slowo).toContain(slowo.replace(/[()]/g, (znak) => "\\" + znak));
    expect(napisy(out).filter((n) => n.t.endsWith("..") && !n.bold)).toEqual([]);
  });

  it("nagłówek „L1-PE/PEN\" łamie się po ukośniku, nie w środku słowa", async () => {
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{}], 500));
    const t = napisy(out).filter((n) => n.bold).map((n) => n.t);
    expect(t).toContain("L1-PE/");
    expect(t).toContain("PEN");
    expect(t).not.toContain("L1-PE/P");
  });

  it("liczby z kropką dziesiętną drukują się z przecinkiem — jak reszta polskiego dokumentu", async () => {
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{ obwod: "A", l1n: "0.4" }], 500));
    expect(out).toMatch(/\(0,4\) Tj/);
    expect(out).not.toMatch(/\(0\.4\) Tj/);
  });

  it("tytuł dokumentu w tabliczce na kartce pionowej mieści się w całości, w dwóch liniach", async () => {
    const out = bytesToAscii(await buildProtocolPdf("rcd", header, [{}], 0));
    const tabliczka = napisy(out).filter((n) => n.bold && n.y < 100);
    expect(tabliczka.filter((n) => n.t.endsWith("..")).map((n) => n.t)).toEqual([]);
    for (const slowo of "Badanie wyłączników różnicowoprądowych".split(" ")) {
      // Polskie litery idą jako ósemkowe sekwencje, więc słowa porównujemy po tym samym
      // kodowaniu, którym napisano dokument.
      expect(tabliczka.some((n) => n.t.includes(pdfEscape(slowo))), slowo).toBe(true);
    }
  });

  it("dane ogólne nie przylegają do górnej krawędzi szarego pola", async () => {
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, [{}], 500));
    const tlo = out.match(/0\.965 g [\d.]+ ([\d.]+) [\d.]+ ([\d.]+) re f/)!;
    const gora = Number(tlo[1]) + Number(tlo[2]);
    const obiekt = napisy(out).find((n) => n.t === "Obiekt:")!;
    // Ascendery 8,5-punktowego tekstu mają ok. 6 pt, a poprzedni odstęp wynosił 6 pt, czyli
    // dokładnie tyle co ascendery — tekst dotykał krawędzi. Teraz jest 11 pt.
    expect(gora - obiekt.y).toBeGreaterThanOrEqual(10);
  });

  it("dużo wierszy z długimi nazwami przechodzi na kolejne strony bez wyjątku i z nagłówkiem", async () => {
    const rows: ProtocolRow[] = Array.from({ length: 40 }, (_, i) => ({
      obwod: `F${i} Obwod gniazd - pomieszczenia gospodarcze i techniczne numer ${i}`,
      l1n: 250,
    }));
    const out = bytesToAscii(await buildProtocolPdf("izolacja", header, rows, 500));
    const stron = (out.match(/\/Type \/Page /g) || []).length;
    expect(stron).toBeGreaterThan(1);
    // Protokół nie dopisuje „(cd."): na każdej stronie wraca tytuł, a nagłówek tabeli na
    // każdej stronie z wierszami — ostatnia strona może nieść już tylko werdykt i podpisy.
    expect((out.match(/\(POMIAR REZYSTANCJI IZOLACJI\) Tj/g) || []).length).toBe(stron);
    expect((out.match(/\(Ocena\) Tj/g) || []).length).toBeGreaterThanOrEqual(stron - 1);
  });
});
