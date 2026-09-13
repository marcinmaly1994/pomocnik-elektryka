import { describe, it, expect } from "vitest";
import { zakladkaPanelu } from "./panelBoczny";

const pusta = { maPomieszczenia: false, maElementy: false };

describe("domyślna zakładka panelu bocznego", () => {
  it("pusta kondygnacja prosi najpierw o pomieszczenia", () => {
    // To jest cała zmiana: katalog osprzętu przestaje być pierwszą rzeczą, którą
    // widzi ktoś, kto nie ma jeszcze gdzie tego osprzętu postawić.
    expect(zakladkaPanelu(null, pusta)).toBe("pomieszczenia");
  });

  it("gdy pomieszczenia już są, panel wraca do elementów", () => {
    expect(zakladkaPanelu(null, { ...pusta, maPomieszczenia: true })).toBe("elementy");
  });

  it("osprzęt postawiony BEZ pomieszczeń też zdejmuje podpowiedź", () => {
    // Praca bez obrysów jest dozwolona. Kto już zaczął tą drogą, minął moment,
    // w którym „zacznij od pokoi" byłoby pomocne — teraz byłoby cofaniem.
    expect(zakladkaPanelu(null, { ...pusta, maElementy: true })).toBe("elementy");
  });

  it("ręczny wybór wygrywa z każdą podpowiedzią", () => {
    // Podpowiedź ma być podpowiedzią, a nie przestawianiem panelu pod palcami.
    expect(zakladkaPanelu("elementy", pusta)).toBe("elementy");
    expect(zakladkaPanelu("pomieszczenia", { maPomieszczenia: true, maElementy: true })).toBe("pomieszczenia");
  });
});
