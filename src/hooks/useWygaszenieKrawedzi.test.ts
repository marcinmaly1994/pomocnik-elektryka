import { describe, expect, it } from "vitest";
import { maskaWygaszenia, SZEROKOSC_WYGASZENIA } from "./useWygaszenieKrawedzi";

describe("maska wygaszenia krawędzi paska", () => {
  it("pasek bez niczego do przewinięcia nie dostaje maski", () => {
    expect(maskaWygaszenia(false, false)).toBeUndefined();
  });

  it("treść za prawą krawędzią wygasza tylko prawą", () => {
    expect(maskaWygaszenia(false, true)).toBe(
      `linear-gradient(to right, #000, #000 calc(100% - ${SZEROKOSC_WYGASZENIA}px), transparent)`
    );
  });

  it("treść za lewą krawędzią wygasza tylko lewą", () => {
    expect(maskaWygaszenia(true, false)).toBe(
      `linear-gradient(to right, transparent, #000 ${SZEROKOSC_WYGASZENIA}px, #000)`
    );
  });

  it("w środku przewijania wygaszone są obie", () => {
    const m = maskaWygaszenia(true, true)!;
    expect(m.startsWith("linear-gradient(to right, transparent,")).toBe(true);
    expect(m.endsWith(", transparent)")).toBe(true);
  });
});
