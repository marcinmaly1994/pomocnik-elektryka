import { describe, it, expect } from "vitest";
import { etapy, odmianaElementow, odmianaObwodow, odmianaPomieszczen, type FaktyEtapow } from "./postepKrokow";

const pusty: FaktyEtapow = {
  elementy: 0,
  pomieszczenia: 0,
  sciany: 0,
  obwody: null,
  trybReczny: false,
  aparatyReczne: 0,
};

const f = (patch: Partial<FaktyEtapow> = {}): FaktyEtapow => ({ ...pusty, ...patch });
const wg = (fakty: FaktyEtapow) => Object.fromEntries(etapy(fakty).map((e) => [e.id, e]));

describe("stan etapów przepływu", () => {
  it("pusty projekt: 01 woła do siebie, reszta uczciwie czeka", () => {
    const e = wg(pusty);
    expect(e.projekt.plakietka).toBe("zacznij tutaj");
    // To jest cała bolączka, którą ten pasek naprawia: trzy kafle prowadzące
    // w puste ekrany mają to powiedzieć ZANIM ktoś w nie kliknie.
    expect(e.rozdzielnica.stan).toBe("czeka");
    expect(e.schemat.stan).toBe("czeka");
    expect(e.kosztorys.stan).toBe("czeka");
  });

  it("zaczęty rzut bez osprzętu: 01 prosi o osprzęt, dalsze etapy nadal czekają", () => {
    const e = wg(f({ pomieszczenia: 5, sciany: 4 }));
    expect(e.projekt.stan).toBe("czeka");
    expect(e.projekt.plakietka).toBe("5 pom.");
    expect(e.projekt.opis).toContain("osprzętu");
    // Same ściany i obrysy nie robią rozdzielnicy — to osprzęt napędza etapy 02-04.
    expect(e.rozdzielnica.stan).toBe("czeka");
  });

  it("same ściany, bez nazwanych pomieszczeń, to już nie „zacznij tutaj”", () => {
    const e = wg(f({ sciany: 3 }));
    expect(e.projekt.plakietka).toBe("szkic");
  });

  it("osprzęt na rzucie zapala wszystkie cztery etapy", () => {
    const e = wg(f({ elementy: 38, pomieszczenia: 5, sciany: 5, obwody: 8 }));
    expect(e.projekt.plakietka).toBe("38 el.");
    expect(e.rozdzielnica.plakietka).toBe("8 obw.");
    expect(e.schemat.stan).toBe("gotowy");
    expect(e.kosztorys.stan).toBe("gotowy");
  });

  it("nieznana liczba obwodów nie udaje zera", () => {
    // `null` znaczy „żadna zakładka jeszcze nie liczyła", a nie „zero obwodów" —
    // kafel pokazuje wtedy sam stan zamiast twierdzić „0 obw." na pełnym rzucie.
    const e = wg(f({ elementy: 38, obwody: null }));
    expect(e.rozdzielnica.stan).toBe("gotowy");
    expect(e.rozdzielnica.plakietka).toBe("gotowa");
    expect(e.rozdzielnica.opis).not.toContain("0");
  });

  it("rozdzielnica składana ręcznie jest gotowa bez rzutu — razem ze schematem", () => {
    // Tryb ręczny istnieje po to, żeby dobrać rozdzielnicę bez rysowania czegokolwiek
    // (wymiana tablicy, wycena) — próg liczony z zawartości rzutu mówiłby wtedy
    // „czeka" komuś, kto ma pełną rozdzielnicę.
    const e = wg(f({ trybReczny: true, aparatyReczne: 6 }));
    expect(e.rozdzielnica.stan).toBe("gotowy");
    expect(e.rozdzielnica.plakietka).toBe("ręcznie");
    expect(e.schemat.stan).toBe("gotowy");
    // Ale kosztorys NIE: ręczna rozdzielnica nie mówi, ile metrów kabla kupić.
    expect(e.kosztorys.stan).toBe("czeka");
    expect(e.kosztorys.opis).toContain("rozdzielnica");
  });

  it("każdy etap mówi, czego mu brakuje, a nie tylko że jest pusty", () => {
    for (const etap of etapy(pusty)) {
      expect(etap.opis.length, etap.id).toBeGreaterThan(20);
      expect(etap.plakietka.length, etap.id).toBeLessThanOrEqual(14);
    }
  });

  it("kolejność etapów odpowiada przepływowi 01→02→03→04", () => {
    expect(etapy(pusty).map((e) => e.id)).toEqual(["projekt", "rozdzielnica", "schemat", "kosztorys"]);
  });
});

describe("odmiana liczebników", () => {
  it("trzyma trzy polskie formy, łącznie z pułapką 12-14", () => {
    expect(odmianaElementow(1)).toBe("element");
    expect(odmianaElementow(3)).toBe("elementy");
    expect(odmianaElementow(5)).toBe("elementów");
    expect(odmianaElementow(12)).toBe("elementów");
    expect(odmianaElementow(22)).toBe("elementy");
    expect(odmianaElementow(25)).toBe("elementów");
    expect(odmianaElementow(112)).toBe("elementów");
    expect(odmianaElementow(122)).toBe("elementy");
  });

  it("działa dla pomieszczeń i obwodów", () => {
    expect(odmianaPomieszczen(1)).toBe("pomieszczenie");
    expect(odmianaPomieszczen(2)).toBe("pomieszczenia");
    expect(odmianaPomieszczen(7)).toBe("pomieszczeń");
    expect(odmianaObwodow(1)).toBe("obwód");
    expect(odmianaObwodow(4)).toBe("obwody");
    expect(odmianaObwodow(8)).toBe("obwodów");
  });
});
