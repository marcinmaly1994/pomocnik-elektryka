import { describe, it, expect } from "vitest";
import { obliczKoordynacjeSPD, KATEGORIE_PRZEPIECIOWE, PRZYROST_NA_PRZEWODACH_V_NA_M } from "./spd";

/**
 * Koordynacja ograniczników przepięć.
 *
 * Sedno modułu: skuteczny poziom ochrony NIE jest równy `Up` z tabliczki. Na
 * przewodach przyłączeniowych odkłada się przy udarze 8/20 µs rząd 1 kV na metr,
 * więc pół metra przewodu potrafi zjeść cały zapas między `Up` a wytrzymałością
 * urządzenia. Reguła „przewody ≤ 0,5 m" nie jest zaleceniem montażowym, tylko
 * wynikiem tego rachunku — i to on jest tu sprawdzany.
 *
 * Wszystkie kotwice policzone ręcznie.
 */

const T2 = { typ: "T2" as const };

describe("obliczKoordynacjeSPD", () => {
  it("dolicza spadek na przewodach do poziomu ochrony", () => {
    // ΔU = 1000 V/m · 0,5 m = 500 V; Up_sk = 1500 + 500 = 2000 V
    const r = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 }).wartosci!;

    expect(r.przyrostNaPrzewodach_V).toBe(500);
    expect(r.UpSkuteczne_V).toBe(2000);
  });

  it("zerowa długość przewodów zostawia sam Up — bez cudów w drugą stronę", () => {
    const r = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0 }).wartosci!;
    expect(r.przyrostNaPrzewodach_V).toBe(0);
    expect(r.UpSkuteczne_V).toBe(1500);
  });

  it("liczy maksymalną długość przewodów z zapasu między Uw a Up", () => {
    // l_max = (2500 − 1500) / 1000 = 1,0 m
    const r = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 }).wartosci!;
    expect(r.maksDlugosc_m).toBeCloseTo(1.0, 9);
  });

  it("ciasny zapas daje maksymalną długość poniżej pół metra — stąd praktyczna reguła", () => {
    // Up 2000 V przy Uw 2500 V: l_max = 500 / 1000 = 0,5 m. Każdy centymetr więcej
    // i urządzenie dostaje więcej, niż wytrzymuje.
    const r = obliczKoordynacjeSPD({ ...T2, Up_V: 2000, Uw_V: 2500, dlugoscPrzewodow_m: 0.4 }).wartosci!;
    expect(r.maksDlugosc_m).toBeCloseTo(0.5, 9);
  });

  it("za długie przewody przewracają ocenę, mimo poprawnie dobranego ogranicznika", () => {
    // Up 1500 V przy Uw 2500 V jest DOBRY. Dopiero 1,5 m przewodu daje 3000 V
    // na zaciskach — czyli 500 V ponad wytrzymałość urządzenia.
    const dobry = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.3 });
    const zaDlugi = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 1.5 });

    expect(dobry.ocena!.verdict).toBe("spelniony");
    expect(zaDlugi.wartosci!.UpSkuteczne_V).toBe(3000);
    expect(zaDlugi.ocena!.verdict).toBe("niespelniony");
  });

  it("przyrost na metr jest parametrem — zależy od prowadzenia przewodów", () => {
    // Pętla między fazą a PE zwiększa indukcyjność, a z nią przyrost.
    const domyslny = obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 4000, dlugoscPrzewodow_m: 1 }).wartosci!;
    const wiekszy = obliczKoordynacjeSPD({
      ...T2,
      Up_V: 1500,
      Uw_V: 4000,
      dlugoscPrzewodow_m: 1,
      przyrost_V_na_m: 1500,
    }).wartosci!;

    expect(domyslny.przyrostNaPrzewodach_V).toBe(PRZYROST_NA_PRZEWODACH_V_NA_M);
    expect(wiekszy.przyrostNaPrzewodach_V).toBe(1500);
    // Większy przyrost skraca dopuszczalną długość przewodów.
    expect(wiekszy.maksDlugosc_m).toBeLessThan(domyslny.maksDlugosc_m);
  });

  it("Up równy albo większy od Uw to błąd doboru, a nie wynik do poprawienia długością", () => {
    // Najważniejszy przypadek w tym module: użytkownik mógłby w nieskończoność
    // skracać przewody i nigdy nie zejść poniżej Uw, bo już sam ogranicznik jest
    // za słaby. Komunikat musi kierować na WYMIANĘ, nie na montaż.
    const rowne = obliczKoordynacjeSPD({ ...T2, Up_V: 2500, Uw_V: 2500, dlugoscPrzewodow_m: 0 });
    const wieksze = obliczKoordynacjeSPD({ ...T2, Up_V: 3000, Uw_V: 2500, dlugoscPrzewodow_m: 0 });

    expect(rowne.bledy.map((b) => b.code)).toContain("UP_PONAD_UW");
    expect(wieksze.bledy.map((b) => b.code)).toContain("UP_PONAD_UW");
    expect(wieksze.bledy[0].message).toMatch(/Skrócenie przewodów tego nie naprawi/);
    expect(wieksze.wartosci).toBeNull();
  });

  it("odrzuca ujemną długość i niedodatnie napięcia", () => {
    expect(
      obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: -1 }).bledy.map((b) => b.code),
    ).toContain("DLUGOSC");
    expect(obliczKoordynacjeSPD({ ...T2, Up_V: 0, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 }).bledy.map((b) => b.code)).toContain("UP");
    expect(obliczKoordynacjeSPD({ ...T2, Up_V: 1500, Uw_V: 0, dlugoscPrzewodow_m: 0.5 }).bledy.map((b) => b.code)).toContain("UW");
  });

  it("Typ 1 dokłada ostrzeżenie o nierównoważności Iimp i In", () => {
    // Ogranicznik Typu 2 nie zastąpi Typu 1 tam, gdzie liczy się z bezpośrednim
    // wyładowaniem — to pomyłka kosztująca całą instalację, więc ma być napisana.
    const t1 = obliczKoordynacjeSPD({ typ: "T1", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 });
    const t2 = obliczKoordynacjeSPD({ typ: "T2", Up_V: 1500, Uw_V: 2500, dlugoscPrzewodow_m: 0.5 });

    expect(t1.zalozenia.some((z) => /10\/350/.test(z))).toBe(true);
    expect(t2.zalozenia.some((z) => /10\/350/.test(z))).toBe(false);
  });
});

describe("KATEGORIE_PRZEPIECIOWE", () => {
  it("rosną wraz z bliskością początku instalacji", () => {
    // Im bliżej złącza, tym większych przepięć urządzenie musi wytrzymać —
    // odwrotna kolejność byłaby zamianą znaczenia kategorii.
    const wartosci = KATEGORIE_PRZEPIECIOWE.map((k) => k.Uw_V);
    expect(wartosci).toEqual([...wartosci].sort((a, b) => a - b));
    expect(wartosci).toEqual([1500, 2500, 4000, 6000]);
  });
});
