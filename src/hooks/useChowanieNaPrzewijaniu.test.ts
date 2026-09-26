import { describe, expect, it } from "vitest";
import { MARTWA_STREFA_PX, PROG_GORY_PX, PROG_KONCA_PX, schowacPigulki } from "./useChowanieNaPrzewijaniu";

const strona = { wysokoscOkna: 800, wysokoscStrony: 4000 };

describe("chowanie pigułek Cofnij/Dalej przy przewijaniu", () => {
  it("przewijanie w dół przez treść chowa pigułki", () => {
    expect(schowacPigulki({ ...strona, poprzednie: 1000, teraz: 1100 })).toBe(true);
  });

  it("przewijanie w górę je pokazuje", () => {
    expect(schowacPigulki({ ...strona, poprzednie: 1100, teraz: 1000 })).toBe(false);
  });

  it("drobny ruch niczego nie zmienia", () => {
    expect(schowacPigulki({ ...strona, poprzednie: 1000, teraz: 1000 + MARTWA_STREFA_PX - 1 })).toBeNull();
  });

  it("u góry strony są widoczne nawet przy ruchu w dół", () => {
    expect(schowacPigulki({ ...strona, poprzednie: 0, teraz: PROG_GORY_PX })).toBe(false);
  });

  it('na końcu strony wracają — tam „Dalej" jest najbardziej potrzebne', () => {
    const koniec = strona.wysokoscStrony - strona.wysokoscOkna - PROG_KONCA_PX;
    expect(schowacPigulki({ ...strona, poprzednie: koniec - 100, teraz: koniec })).toBe(false);
  });
});
