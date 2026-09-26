import { describe, it, expect } from "vitest";
import { computeCosts, kosztorysRows, parsePriceCsv, pozycjeBezCeny, podsumowanieKosztorysu, kluczKabla, DEFAULT_PRICES, PRICE_LABELS, type CostRow } from "./costs";
import type { Circuit, InstallationElement, RcdGroup } from "@/types";

function el(partial: Partial<InstallationElement> & { type: InstallationElement["type"] }): InstallationElement {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    x: 0, y: 0, room: "Salon", floor: "f1", dedicated: false, note: "", gangs: 1,
    ...partial,
  };
}

describe("computeCosts — długość kabla", () => {
  const circuit: Circuit = {
    id: "obw1",
    name: "Obwód gniazd",
    type: "gniazdko",
    elements: [el({ type: "gniazdko" }), el({ type: "gniazdko" })],
    cable: "YDYp 3x2,5 mm²",
    breaker: "B16",
    rcd: true,
  };

  it("bez policzonych tras wraca do ryczałtu i mówi o tym wprost", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], []);
    expect(cableLengthSource).toBe("ryczalt");
    expect(quantities.kabel25).toBe(2 * 5 + 10); // 2 punkty × 5 mb + 10 mb
  });

  it("z policzonymi trasami bierze metraż z planu, nie z ryczałtu", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], [], {
      routeLengthsM: new Map([["obw1", 42.5]]),
    });
    expect(cableLengthSource).toBe("plan");
    expect(quantities.kabel25).toBe(43); // zaokrąglone 42,5
  });

  it("pusta mapa tras to nadal ryczałt — nie zerowy metraż", () => {
    const { quantities, cableLengthSource } = computeCosts([], [circuit], [], { routeLengthsM: new Map() });
    expect(cableLengthSource).toBe("ryczalt");
    expect(quantities.kabel25).toBe(20);
  });

  it("dwa identyczne obwody w różnych miejscach domu dostają RÓŻNY metraż", () => {
    const far: Circuit = { ...circuit, id: "obw2" };
    const { quantities } = computeCosts([], [circuit, far], [], {
      routeLengthsM: new Map([
        ["obw1", 12],
        ["obw2", 60],
      ]),
    });
    expect(quantities.kabel25).toBe(72); // ryczałt dałby 2 × 20 = 40 dla obu
  });
});

describe("computeCosts", () => {
  it("brak elementów -> same zera", () => {
    // Do tej pory stało tu „poza minimum jednej puszki rozgałęźnej" z uzasadnieniem
    // „tak jak w oryginale: dom ma co najmniej jedno pomieszczenie". To był
    // przeniesiony z wersji JS skutek uboczny `|| 1` przy liczeniu pomieszczeń, a nie
    // decyzja — patrz `computeCosts` i „pusty projekt" na dole tego pliku.
    const { quantities } = computeCosts([], [], []);
    expect(Object.values(quantities).every((v) => v === 0)).toBe(true);
  });

  it("stary zapis `gangs: 3` czyta się jako podwójne, nie jako trzy pojedyncze", () => {
    // Interfejs nigdy nie pozwolił wybrać więcej niż dwa, ale w danych sprzed
    // rozdzielenia pojęć trójka siedzi (miała znaczyć „3× w ramce") — i ma wyjść
    // jedno gniazdo podwójne, a nie rachunek za trzy sztuki.
    const { quantities } = computeCosts([el({ type: "gniazdko", gangs: 3 })], [], []);
    expect(quantities.gniazdkoPodwojne).toBe(1);
    expect(quantities.gniazdko).toBe(0);
  });

  it("punkt instalacyjny generuje puszkę podtynkową i robociznę, ale pomija rozdzielnicę/puszkę/sanitarne", () => {
    const elements = [
      el({ type: "gniazdko" }),
      el({ type: "rozdzielnica" }),
      el({ type: "puszka" }),
      el({ type: "wanna" }),
    ];
    const { quantities } = computeCosts(elements, [], []);
    expect(quantities.puszkaPodtynkowa).toBe(1);
    expect(quantities.robocizna).toBe(1);
  });

  it("puszka rozgałęźna to co najmniej liczba pomieszczeń", () => {
    const elements = [el({ type: "gniazdko", room: "Salon" }), el({ type: "gniazdko", room: "Kuchnia" })];
    const { quantities } = computeCosts(elements, [], []);
    expect(quantities.puszkaRozgalezna).toBeGreaterThanOrEqual(2);
  });

  it("długość kabla szacowana z liczby punktów w obwodzie (5 mb/pkt + 10 mb)", () => {
    const circuits: Circuit[] = [
      { id: "obw1", name: "Gniazda", type: "gniazdko", elements: [el({ type: "gniazdko" }), el({ type: "gniazdko" })], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
    ];
    const { quantities } = computeCosts([], circuits, []);
    expect(quantities.kabel25).toBe(2 * 5 + 10);
  });

  it("obwody 3-fazowe liczone osobno do mcb3f", () => {
    const circuits: Circuit[] = [
      { id: "obw1", name: "EV", type: "gniazdko", elements: [], cable: "YDYp 5x4 mm²", breaker: "C25 3-faz.", rcd: true },
      { id: "obw2", name: "Gniazda", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true },
    ];
    const { quantities } = computeCosts([], circuits, []);
    expect(quantities.mcb3f).toBe(1);
    expect(quantities.mcb).toBe(1);
  });

  it("rozdzielnica i wyłącznik główny liczone raz, gdy są jakiekolwiek obwody", () => {
    const circuits: Circuit[] = [{ id: "obw1", name: "x", type: "gniazdko", elements: [], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true }];
    const rcdGroups: RcdGroup[] = [{ id: "rcd1", rating: "30mA", circuits }];
    const { quantities } = computeCosts([], circuits, rcdGroups);
    expect(quantities.glowny).toBe(1);
    expect(quantities.rozdzielnica).toBe(1);
    expect(quantities.rcd).toBe(1);
  });
});

describe("parsePriceCsv", () => {
  it("dopasowuje pozycje po słowach kluczowych", () => {
    // "RCD" celowo bez przedrostka "Wyłącznik" — inaczej dopasowałoby się najpierw
    // do słowa kluczowego "łącznik" (patrz test niżej o kolejności dopasowań)
    const csv = "Gniazdko podtynkowe 230V;18.50\nRCD 30mA;95";
    const updates = parsePriceCsv(csv);
    expect(updates.gniazdko).toBe(18.5);
    expect(updates.rcd).toBe(95);
  });

  it("odziedziczona z oryginału usterka: dopasowanie po pierwszym pasującym słowie kluczowym w kolejności deklaracji może przechwycić niewłaściwą pozycję (\"Wyłącznik różnicowoprądowy\" trafia w \"włącznik\", bo zawiera podciąg „łącznik”, zanim dotrze do „różnicowoprądowy”)", () => {
    const csv = "Wyłącznik różnicowoprądowy 30mA;95";
    expect(parsePriceCsv(csv).wlacznik).toBe(95);
    expect(parsePriceCsv(csv).rcd).toBeUndefined();
  });

  it("odziedziczona z oryginału usterka: przecinek jako separator pól rozbija też przecinek dziesiętny w cenie — port jest celowo wierny źródłu", () => {
    // separator pól to [,;\t] łącznie, więc "Gniazdko;18,50" dzieli się na 3 pola
    // (["Gniazdko","18","50"]) i jako cena brany jest tylko ostatni fragment ("50")
    const csv = "Gniazdko;18,50";
    expect(parsePriceCsv(csv).gniazdko).toBe(50);
  });

  it("pomija linie bez rozpoznanego słowa kluczowego lub ceny", () => {
    const csv = "Coś nieznanego;10\nGniazdko;abc";
    const updates = parsePriceCsv(csv);
    expect(updates.gniazdko).toBeUndefined();
  });

  it("pusty plik -> brak aktualizacji", () => {
    expect(parsePriceCsv("")).toEqual({});
  });
});

describe("kosztorysRows — wartosc pozycji", () => {
  const ilosci = { gniazdko: 12, robocizna: 30 };
  const ceny = { gniazdko: 15, robocizna: 0 };

  it("bez nadpisan liczy ilosc razy cena", () => {
    const rows = kosztorysRows(ilosci, ceny);
    expect(rows.map((r) => [r.key, r.value, r.overridden])).toEqual([
      ["gniazdko", 180, false],
      ["robocizna", 0, false],
    ]);
  });

  it("pomija pozycje o zerowej ilosci — nie ma czego wyceniac", () => {
    expect(kosztorysRows({ gniazdko: 0 }, ceny)).toHaveLength(0);
  });

  /** Realne oferty podaja czesc pozycji ryczaltem — robocizna za mieszkanie, a nie
   *  za punkt — i takiej kwoty nie da sie sensownie rozbic na sztuki. */
  it("wpisana wartosc zastepuje caly rachunek, nie tylko cene", () => {
    const rows = kosztorysRows(ilosci, ceny, { robocizna: 4500 });
    const robocizna = rows.find((r) => r.key === "robocizna")!;
    expect(robocizna.value).toBe(4500);
    expect(robocizna.overridden).toBe(true);
    // Ilosc i cena zostaja widoczne — to nadal informacja, ile punktow policzono.
    expect(robocizna.qty).toBe(30);
    expect(robocizna.price).toBe(0);
  });

  it("zero jest wartoscia, nie brakiem — pozycja moze byc w cenie czegos innego", () => {
    const rows = kosztorysRows(ilosci, ceny, { gniazdko: 0 });
    const gniazdko = rows.find((r) => r.key === "gniazdko")!;
    expect(gniazdko.value).toBe(0);
    expect(gniazdko.overridden).toBe(true);
  });

  it("nadpisanie pozycji, ktorej nie ma w rzucie, nie wskrzesza jej w tabeli", () => {
    expect(kosztorysRows({ gniazdko: 2 }, ceny, { rcd: 999 }).map((r) => r.key)).toEqual(["gniazdko"]);
  });
});

describe("pozycjeBezCeny", () => {
  /** Liczy sie WARTOSC, nie cena jednostkowa: pozycja wyceniona ryczaltem ma prawo
   *  miec zerowa cene za sztuke i nadal wchodzic do kosztorysu pelna kwota. */
  it("ryczalt zdejmuje ostrzezenie, mimo zerowej ceny jednostkowej", () => {
    const bez = kosztorysRows({ robocizna: 30 }, { robocizna: 0 });
    expect(pozycjeBezCeny(bez)).toEqual(["Robocizna za punkt instalacyjny"]);

    const zRyczaltem = kosztorysRows({ robocizna: 30 }, { robocizna: 0 }, { robocizna: 4500 });
    expect(pozycjeBezCeny(zRyczaltem)).toEqual([]);
  });

  it("wyzerowana recznie pozycja nadal jest zgloszona jako poza suma", () => {
    const rows = kosztorysRows({ gniazdko: 12 }, { gniazdko: 15 }, { gniazdko: 0 });
    expect(pozycjeBezCeny(rows)).toEqual(["Gniazdko 230V podtynkowe"]);
  });
});

describe("kosztorysRows — poprawiona ilosc", () => {
  const ilosci = { gniazdko: 12, puszkaPodtynkowa: 40 };
  const ceny = { gniazdko: 15, puszkaPodtynkowa: 2 };

  it("poprawiona ilosc przelicza wartosc pozycji", () => {
    const rows = kosztorysRows(ilosci, ceny, {}, { gniazdko: 20 });
    const g = rows.find((r) => r.key === "gniazdko")!;
    expect(g.qty).toBe(20);
    expect(g.qtyOverridden).toBe(true);
    expect(g.value).toBe(300);
  });

  it("nietkniete pozycje dalej licza sie z rzutu", () => {
    const rows = kosztorysRows(ilosci, ceny, {}, { gniazdko: 20 });
    const p = rows.find((r) => r.key === "puszkaPodtynkowa")!;
    expect(p.qty).toBe(40);
    expect(p.qtyOverridden).toBe(false);
  });

  /**
   * „90 punktow robocizny, 14 500 zl ryczaltem" to zdanie sensowne — poprawienie liczby
   * punktow na 85 nie zmienia umowionej kwoty. Ilosc i wartosc sa wiec niezalezne.
   */
  it("ryczalt na wartosci wygrywa z iloczynem, ale ilosc zostaje wlasna", () => {
    const rows = kosztorysRows(ilosci, ceny, { gniazdko: 999 }, { gniazdko: 20 });
    const g = rows.find((r) => r.key === "gniazdko")!;
    expect(g.qty).toBe(20);
    expect(g.value).toBe(999);
    expect(g.qtyOverridden).toBe(true);
    expect(g.overridden).toBe(true);
  });

  /** Bez tego wpisanie zera kasowaloby wiersz razem z jedyna droga powrotu. */
  it("wyzerowana ilosc zostawia wiersz w tabeli", () => {
    const rows = kosztorysRows(ilosci, ceny, {}, { gniazdko: 0 });
    const g = rows.find((r) => r.key === "gniazdko")!;
    expect(g.qty).toBe(0);
    expect(g.value).toBe(0);
    expect(g.qtyOverridden).toBe(true);
  });

  it("pozycja wykreslona z zakresu nie jest zglaszana jako brakujaca cena", () => {
    // Sama zerowa wartosc to luka do uzupelnienia...
    expect(pozycjeBezCeny(kosztorysRows({ robocizna: 30 }, { robocizna: 0 }))).toEqual([
      "Robocizna za punkt instalacyjny",
    ]);
    // ...ale zerowa ILOSC to pozycja, ktorej po prostu nie ma. Rada „uzupelnij cene"
    // byla by wtedy nie na temat.
    expect(pozycjeBezCeny(kosztorysRows({ robocizna: 30 }, { robocizna: 0 }, {}, { robocizna: 0 }))).toEqual([]);
  });
});

/**
 * Pozycja kosztorysu wg PRZEKROJU, nie wg fragmentu tekstu.
 *
 * Kubelki byly trzy i dopasowywaly sie po podciagu: wszystko, co nie mialo w nazwie
 * „1,5" ani pieciu zyl, ladowalo w pozycji „3x2,5 mm2". Obwod dobrany na 6 mm2 — a
 * takie wychodza, odkad warunki doboru da sie ustawic uczciwie — byl wiec wyceniany
 * jako 2,5 mm2. Kosztorys kazal kupic cienszy kabel, niz sam zaprojektowal.
 */
describe("kluczKabla", () => {
  it("rozpoznaje przekroj z opisu, tak jak zapisuje go dobor", () => {
    expect(kluczKabla("YDYp 3x1,5 mm²")).toBe("kabel15");
    expect(kluczKabla("YDYp 3x2,5 mm²")).toBe("kabel25");
    expect(kluczKabla("YDYp 3x4 mm²")).toBe("kabel3x4");
    expect(kluczKabla("YDYp 3x6 mm²")).toBe("kabel3x6");
    expect(kluczKabla("YDYp 3x10 mm²")).toBe("kabel3x10");
  });

  /** SEDNO poprawki: grubszy przewod NIE moze juz wpasc do pozycji 2,5 mm2. */
  it("grubszy przewod dostaje wlasna pozycje, a nie pozycje 2,5 mm2", () => {
    for (const kabel of ["YDYp 3x4 mm²", "YDYp 3x6 mm²", "YDYp 3x10 mm²", "YDYp 3x16 mm²"]) {
      expect(kluczKabla(kabel)).not.toBe("kabel25");
    }
  });

  it("pieciozylowe 2,5 i 4 dziela jedna pozycje, tak jak byly opisane od zawsze", () => {
    expect(kluczKabla("YDYp 5x2,5 mm²")).toBe("kabel4");
    expect(kluczKabla("YDYp 5x4 mm²")).toBe("kabel4");
    // ...ale grubsze pieciozylowe juz nie — to inny material i inna cena.
    expect(kluczKabla("YDYp 5x6 mm²")).toBe("kabel5x6");
    expect(kluczKabla("YDYp 5x10 mm²")).toBe("kabel5x10");
  });

  it("znak mnozenia i separator dziesietny nie decyduja o dopasowaniu", () => {
    expect(kluczKabla("YDYp 3×2,5 mm²")).toBe("kabel25");
    expect(kluczKabla("YDYp 3x2.5 mm²")).toBe("kabel25");
  });

  /** Kombinacja spoza listy ma byc WIDOCZNA, a nie po cichu doliczona gdzie indziej. */
  it("nieznany przekroj trafia do pozycji „inny”, zamiast do niewlasciwej", () => {
    expect(kluczKabla("YDYp 4x35 mm²")).toBe("kabelInny");
    expect(kluczKabla("cokolwiek bez liczb")).toBe("kabelInny");
  });
});

describe("computeCosts — metraz wg przekroju", () => {
  const obwod = (id: string, cable: string, punktow: number): Circuit => ({
    id,
    name: id,
    type: "gniazdko",
    elements: Array.from({ length: punktow }, () => el({ type: "gniazdko" })),
    cable,
    breaker: "B16",
    rcd: true,
  });

  it("obwody o roznych przekrojach ida do roznych pozycji", () => {
    const { quantities } = computeCosts([], [obwod("a", "YDYp 3x2,5 mm²", 2), obwod("b", "YDYp 3x6 mm²", 2)], []);
    expect(quantities.kabel25).toBe(20);
    expect(quantities.kabel3x6).toBe(20);
  });

  /** Bez tej poprawki oba obwody wyladowalyby w jednej pozycji i wycena grubszego
   *  byla by liczona cena cienszego. */
  it("metraz grubszego przewodu NIE dolicza sie do pozycji 2,5 mm2", () => {
    const { quantities } = computeCosts([], [obwod("b", "YDYp 3x10 mm²", 3)], []);
    expect(quantities.kabel25 ?? 0).toBe(0);
    expect(quantities.kabel3x10).toBe(25);
  });
});

describe("computeCosts — pusty projekt", () => {
  it("nie wystawia rachunku za dom, którego nie ma", () => {
    const { quantities } = computeCosts([], [], []);
    // Bez ani jednego elementu na rzucie nie ma ANI JEDNEGO pomieszczenia do
    // zapuszkowania. `|| 1` w liczbie pomieszczeń to zabezpieczenie dla elementów
    // bez przypisanego pokoju, nie wartość domyślna pustego projektu — a wystawiało
    // jedną puszkę rozgałęźną i 6,15 zł brutto komuś, kto dopiero wszedł na stronę.
    expect(quantities.puszkaRozgalezna).toBe(0);
    expect(kosztorysRows(quantities, { puszkaRozgalezna: 5 })).toEqual([]);
  });

  it("element bez przypisanego pomieszczenia nadal liczy się jako jedno", () => {
    const { quantities } = computeCosts([el({ type: "gniazdko", room: "" })], [], []);
    expect(quantities.puszkaRozgalezna).toBe(1);
  });
});

describe("podsumowanieKosztorysu — suma mówi, czym jest", () => {
  const w = (key: string, label: string, qty: number, value: number): CostRow => ({
    key, label, qty, qtyOverridden: false, price: qty ? value / qty : 0, value, overridden: false,
  });

  it("bez robocizny podpisuje sumę jako SAM MATERIAŁ", () => {
    // Domyślny cennik ma `robocizna: 0`, więc to jest przypadek TYPOWY, nie brzegowy:
    // na mieszkaniu 70 m² pod „RAZEM brutto" stała kwota za sam materiał.
    const p = podsumowanieKosztorysu([
      w("gniazdko", "Gniazdko 230V podtynkowe (szt.)", 16, 240),
      w("robocizna", "Robocizna za punkt instalacyjny (szt., opcjonalnie)", 38, 0),
    ]);
    expect(p.brakRobocizny).toBe(true);
    expect(p.etykietaSumy).toBe("RAZEM brutto — sam materiał");
    expect(p.niewycenione).toContain("Robocizna za punkt instalacyjny");
  });

  it("komplet cen to zwykłe RAZEM brutto", () => {
    const p = podsumowanieKosztorysu([
      w("gniazdko", "Gniazdko 230V podtynkowe (szt.)", 16, 240),
      w("robocizna", "Robocizna za punkt instalacyjny (szt., opcjonalnie)", 38, 4560),
    ]);
    expect(p.brakRobocizny).toBe(false);
    expect(p.etykietaSumy).toBe("RAZEM brutto");
    expect(p.niewycenione).toEqual([]);
    expect(p.netto).toBe(4800);
    expect(p.brutto).toBeCloseTo(4800 * 1.23, 2);
  });

  it("brak INNEJ pozycji to suma niepełna, ale nadal nie «sam materiał»", () => {
    const p = podsumowanieKosztorysu([
      w("robocizna", "Robocizna za punkt instalacyjny (szt., opcjonalnie)", 38, 4560),
      w("oprawa", "Oprawa oświetleniowa (szt., opcjonalnie)", 8, 0),
    ]);
    expect(p.etykietaSumy).toBe("RAZEM brutto — niepełny");
  });

  it("pozycja o ZEROWEJ ILOŚCI nie jest luką — została wykreślona z zakresu", () => {
    const p = podsumowanieKosztorysu([w("robocizna", "Robocizna za punkt instalacyjny (szt.)", 0, 0)]);
    expect(p.brakRobocizny).toBe(false);
    expect(p.etykietaSumy).toBe("RAZEM brutto");
  });
});

/**
 * Gniazdo podwójne to JEDNO urządzenie z dwiema wtyczkami, zajmujące jedno miejsce
 * w ramce i jedną puszkę — a nie dwa gniazda pojedyncze obok siebie.
 *
 * Dotąd `gangs` było jedną liczbą obsługującą dwa różne pojęcia: podpis wariantu mówił
 * przy dwójce „podwójne" (wariant produktu), a przy trójce „3× w ramce" (krotność ramki).
 * Kosztorys czytał to drugie i wystawiał rachunek za dwie sztuki gniazdka pojedynczego,
 * ale tylko jedną puszkę — czyli nie zgadzał się z żadnym z dwóch znaczeń.
 *
 * Ustalenie: gniazdo podwójne = jedna sztuka OSOBNEJ pozycji cennika, bo to inny
 * produkt niż pojedyncze, o innej cenie.
 */
describe("computeCosts — gniazdo podwójne", () => {
  it("jest JEDNĄ sztuką osobnej pozycji, nie dwiema sztukami pojedynczego", () => {
    const { quantities } = computeCosts([el({ type: "gniazdko", gangs: 2 })], [], []);
    expect(quantities.gniazdkoPodwojne).toBe(1);
    expect(quantities.gniazdko).toBe(0);
  });

  it("zajmuje jedną puszkę i jedną robociznę, tak samo jak pojedyncze", () => {
    const podwojne = computeCosts([el({ type: "gniazdko", gangs: 2 })], [], []).quantities;
    const pojedyncze = computeCosts([el({ type: "gniazdko", gangs: 1 })], [], []).quantities;
    expect(podwojne.puszkaPodtynkowa).toBe(pojedyncze.puszkaPodtynkowa);
    expect(podwojne.robocizna).toBe(pojedyncze.robocizna);
  });

  it("ma własną cenę domyślną, wyższą od pojedynczego i niższą od dwóch", () => {
    // Inny produkt, nie dwa tamte sklejone — inaczej osobna pozycja nie miałaby sensu.
    expect(DEFAULT_PRICES.gniazdkoPodwojne).toBeGreaterThan(DEFAULT_PRICES.gniazdko);
    expect(DEFAULT_PRICES.gniazdkoPodwojne).toBeLessThan(2 * DEFAULT_PRICES.gniazdko);
  });

  it("pozycja ma swoją etykietę w cenniku", () => {
    expect(PRICE_LABELS.gniazdkoPodwojne).toMatch(/podw/i);
  });

  /**
   * Łączniki to OSOBNA sprawa i nie wolno jej przy okazji zepsuć. Podwójny łącznik
   * przestał być wariantem dawno temu (liczbę biegunów niesie typ symbolu), ale
   * projekty zapisane wcześniej mają go jako `gangs: 2` i mają się wyceniać tak,
   * jak wtedy — czyli dalej jako dwa mechanizmy tej samej pozycji.
   */
  it("nie rusza starych łączników zapisanych jako gangs: 2", () => {
    const { quantities } = computeCosts([el({ type: "wlacznik", gangs: 2 })], [], []);
    expect(quantities.wlacznik).toBe(2);
  });
});

describe("computeCosts — aparaty z rozdzielnicy", () => {
  const ap = (kind: string, poles = "1P") => ({ uid: kind + Math.random(), kind, tag: "", modules: 1, label: "", caption: "", poles });

  it("wycenia to, co jest w rozdzielnicy, a nie obwody z rzutu", () => {
    // Rzut ma dwa obwody, ale w Rozdzielnicy jeden wyłącznik usunięto.
    const obwod = (id: string): Circuit => ({
      id, name: id, type: "gniazdko", elements: [], breaker: "B16", cable: "YDYp 3x2,5 mm²", rcdGroup: "a",
    } as unknown as Circuit);
    const q = computeCosts([], [obwod("a"), obwod("b")], [], {
      aparaty: [ap("main", "4P"), ap("rcd", "4P"), ap("mcb")],
    }).quantities;
    expect(q.mcb).toBe(1);
    expect(q.rcd).toBe(1);
    expect(q.glowny).toBe(1);
    expect(q.rozdzielnica).toBe(1);
  });

  it("wyłącznik 3P idzie do pozycji 3-fazowej", () => {
    const q = computeCosts([], [], [], { aparaty: [ap("mcb", "3P"), ap("mcb", "1P")] }).quantities;
    expect(q.mcb3f).toBe(1);
    expect(q.mcb).toBe(1);
  });

  it("aparaty dokładane ręcznie mają własne pozycje — bez ceny, więc na liście „uzupełnij”", () => {
    const q = computeCosts([], [], [], { aparaty: [ap("spd", "4P"), ap("spdFuse"), ap("stycznik"), ap("lampka")] }).quantities;
    expect([q.spd, q.spdFuse, q.stycznik, q.lampka]).toEqual([1, 1, 1, 1]);
    const rows = kosztorysRows(q, DEFAULT_PRICES);
    expect(pozycjeBezCeny(rows)).toEqual(
      expect.arrayContaining(["Ogranicznik przepięć SPD", "Stycznik modułowy", "Lampka sygnalizacyjna"])
    );
  });

  it("bez aparatów — zachowanie jak dotąd (z obwodów)", () => {
    const obwod = { id: "a", name: "a", type: "gniazdko", elements: [], breaker: "B16", cable: "YDYp 3x2,5 mm²" } as unknown as Circuit;
    const q = computeCosts([], [obwod], [{ id: "r", circuits: [obwod] } as unknown as RcdGroup]).quantities;
    expect(q.mcb).toBe(1);
    expect(q.rcd).toBe(1);
  });
});
