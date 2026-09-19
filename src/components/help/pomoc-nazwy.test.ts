import { describe, it, expect } from "vitest";
import { KROKI, SKROTY } from "./HelpModal";
import { RAIL_TOOLS } from "@/components/design/ToolRail";

/**
 * Pomoc odsyła do narzędzi po nazwie („Narysuj Ścianę", „Wstaw Element"). Komentarz
 * przy `KROKI` deklaruje, że te nazwy odpowiadają 1:1 temu, co widać w interfejsie —
 * bo „laik szukający pomocy musi rozpoznać to, co widzi na ekranie, w tekście, który
 * czyta". Nic tego jednak nie pilnowało i Pomoc mówiła o narzędziu „Drzwi", podczas
 * gdy narzędzie nazywa się „Drzwi i okna".
 *
 * Ten test zamienia tamtą deklarację w regułę: KAŻDA nazwa w cudzysłowie musi istnieć
 * naprawdę — jako narzędzie, zakładka albo przycisk z tej listy.
 */

/** Zakładki przepływu — patrz `KOLEJNOSC_KROKOW` w App.tsx. */
const ZAKLADKI = ["Instalacja", "Rozdzielnica", "Schemat", "Kosztorys"];

/** Pozostałe nazwy z interfejsu, do których Pomoc ma prawo się odwołać. */
const INNE_NAZWY = ["Zabezpiecz kontem", "Zaloguj się"];

/** Wszystko, co w tekście Pomocy stoi w „cudzysłowie" — czyli każde odwołanie do UI. */
function nazwyWCudzyslowie(tekst: string): string[] {
  return [...tekst.matchAll(/„([^”]+)”/g)].map((m) => m[1]);
}

describe("Pomoc odsyła do nazw, które naprawdę są w interfejsie", () => {
  const dozwolone = new Set([...RAIL_TOOLS.map((t) => t.label), ...ZAKLADKI, ...INNE_NAZWY]);

  it("każda nazwa w cudzysłowie istnieje w interfejsie", () => {
    const uzyte = KROKI.flatMap((k) => [...nazwyWCudzyslowie(k.tytul), ...nazwyWCudzyslowie(k.opis)]);
    expect(uzyte.length).toBeGreaterThan(0);

    const nieistniejace = [...new Set(uzyte)].filter((n) => !dozwolone.has(n));
    expect(nieistniejace, `nazwy, których nie ma w interfejsie: ${nieistniejace.join(", ")}`).toEqual([]);
  });

  /** Sam mechanizm testu — gdyby wyrażenie przestało cokolwiek wyłuskiwać, powyższy
   *  test przechodziłby na pustej liście i nie pilnowałby niczego. */
  it("wyrażenie faktycznie wyłuskuje nazwy", () => {
    expect(nazwyWCudzyslowie('Narzędziem „Wstaw Element” zrób coś')).toEqual(["Wstaw Element"]);
  });
});

/**
 * Spis skrótów w Pomocy ma wymieniać te, które edytor naprawdę obsługuje.
 *
 * Cofanie działa od dawna — Ctrl/Cmd+Z, a z Shiftem ponawianie (patrz obsługa
 * klawiatury w `DesignTab`, pokryta testem e2e w `design-ux-fixes.spec.ts`) — ale
 * spis w Pomocy go NIE wymieniał. Wychodziło z tego najgorsze połączenie: funkcja
 * jest, kosztowała pracę, a użytkownik dowiaduje się o niej tylko przypadkiem.
 * Akurat ten skrót jest pierwszym, którego człowiek szuka po pomyłce.
 */
describe("Pomoc wymienia skróty, które edytor obsługuje", () => {
  it("dokumentuje cofanie i ponawianie", () => {
    const cofanie = SKROTY.find((s) => /ctrl.*z/i.test(s.klawisz) && !/shift/i.test(s.klawisz));
    const ponawianie = SKROTY.find((s) => /shift/i.test(s.klawisz));

    expect(cofanie, "brak skrótu cofania w spisie").toBeDefined();
    expect(cofanie!.opis).toMatch(/cofa/i);
    expect(ponawianie, "brak skrótu ponawiania w spisie").toBeDefined();
    expect(ponawianie!.opis).toMatch(/ponaw|przywraca/i);
  });

  it("każdy skrót ma opis mówiący, co robi", () => {
    expect(SKROTY.length).toBeGreaterThan(0);
    for (const s of SKROTY) {
      expect(s.klawisz.trim(), "pusty klawisz w spisie").not.toBe("");
      expect(s.opis.trim().length, `skrót „${s.klawisz}” bez opisu`).toBeGreaterThan(3);
    }
  });
});

/**
 * Pełny ekran to funkcja, o której użytkownik telefonu dowiadywał się wyłącznie
 * przypadkiem: nieopisana ikona wśród sześciu w pasku. Na wąskim ekranie daje
 * płótnu 605 px zamiast 360, więc jest tam najbardziej potrzebna — i dlatego spis
 * skrótów musi ją wymieniać, tak samo jak cofanie.
 */
describe("Pomoc wymienia skrót pełnego ekranu", () => {
  it("dokumentuje klawisz F", () => {
    const pelnyEkran = SKROTY.find((s) => s.klawisz.trim().toUpperCase() === "F");
    expect(pelnyEkran, "brak skrótu pełnego ekranu w spisie").toBeDefined();
    expect(pelnyEkran!.opis).toMatch(/pełn(y|ego) ekran/i);
  });
});
