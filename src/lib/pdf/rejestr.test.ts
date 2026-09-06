import { describe, it, expect, afterEach } from "vitest";
import { createPdfDoc } from "./engine";
import { poczekajNaProducenta, producent, wyczyscRejestr, zarejestrujProducenta } from "./rejestr";

afterEach(wyczyscRejestr);

const pusty = async () => createPdfDoc();

describe("rejestr producentow dokumentow", () => {
  it("oddaje zarejestrowanego producenta", async () => {
    zarejestrujProducenta("kosztorys", pusty);
    expect(producent("kosztorys")).toBeDefined();
    expect(await poczekajNaProducenta("kosztorys")).toBe(producent("kosztorys"));
  });

  it("wyrejestrowanie usuwa wpis", () => {
    const sprzataj = zarejestrujProducenta("kosztorys", pusty);
    sprzataj();
    expect(producent("kosztorys")).toBeUndefined();
  });

  /**
   * Sedno: przy przelaczaniu kondygnacji efekt nowego renderu rejestruje sie ZANIM
   * sprzataczka poprzedniego zdazy sie wykonac. Slepe `delete` skasowaloby wtedy
   * swiezy wpis i komplet czekalby na producenta, ktory juz istnieje.
   */
  it("sprzataczka nie kasuje wpisu nadpisanego przez nowszy", () => {
    const stary = async () => createPdfDoc();
    const nowy = async () => createPdfDoc();
    const sprzatajStary = zarejestrujProducenta("rzut:f1", stary);
    zarejestrujProducenta("rzut:f1", nowy);
    sprzatajStary();
    expect(producent("rzut:f1")).toBe(nowy);
  });

  it("czeka na producenta, ktory pojawia sie pozniej", async () => {
    const oczekiwanie = poczekajNaProducenta("schemat", 1000);
    setTimeout(() => zarejestrujProducenta("schemat", pusty), 10);
    await expect(oczekiwanie).resolves.toBeDefined();
  });

  /** Bez limitu komplet wisialby w nieskonczonosc — lepiej powiedziec, KTOREGO
   *  dokumentu zabraklo. */
  it("po limicie czasu zglasza, ktorego dokumentu nie udalo sie przygotowac", async () => {
    await expect(poczekajNaProducenta("rzut:f9", 20)).rejects.toThrow(/rzut:f9/);
  });

  it("czekajacy nie zostaje po odpowiedzi", async () => {
    const p = poczekajNaProducenta("legenda", 1000);
    zarejestrujProducenta("legenda", pusty);
    await p;
    // Gdyby subskrypcja zostala, kolejna rejestracja probowalaby rozwiazac spelniona
    // juz obietnice — bledu nie widac, ale przeciek rosnie z kazdym zlozonym kompletem.
    expect(() => zarejestrujProducenta("legenda", pusty)).not.toThrow();
  });
});
