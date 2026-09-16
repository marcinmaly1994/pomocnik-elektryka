import { describe, it, expect } from "vitest";
import { KROKI } from "./HelpModal";
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
