import { describe, expect, it } from "vitest";
import { computeSelectivity, czuloscITypRcd } from "./devices";
import { aparatyZSzablonu, modulySzablonu, SZABLONY_ROZDZIELNIC } from "./szablonyRozdzielnic";

describe("gotowe układy rozdzielnic", () => {
  it("są cztery: mieszkanie, dom, dom z PV, dom z PV i EV", () => {
    expect(SZABLONY_ROZDZIELNIC.map((s) => s.id)).toEqual(["mieszkanie", "dom", "dom-pv", "dom-pv-ev"]);
  });

  describe.each(SZABLONY_ROZDZIELNIC)("$nazwa", (s) => {
    const aparaty = aparatyZSzablonu(s);

    it("zaczyna się rozłącznikiem głównym zgodnym z ustawieniami", () => {
      expect(aparaty[0]).toMatchObject({ kind: "main", tag: "Q1", key: "main", label: `${s.config.mainRating}A` });
    });

    it("oznaczenia i identyfikatory są niepowtarzalne", () => {
      const tagi = aparaty.map((a) => a.tag).filter(Boolean);
      expect(new Set(tagi).size).toBe(tagi.length);
      expect(new Set(aparaty.map((a) => a.uid)).size).toBe(aparaty.length);
    });

    it("każdy obwód pod różnicówką wskazuje istniejącą różnicówkę", () => {
      const rcd = new Set(aparaty.filter((a) => a.kind === "rcd").map((a) => a.tag));
      for (const a of aparaty.filter((x) => x.rcdTag)) expect(rcd.has(a.rcdTag!), a.caption).toBe(true);
    });

    it("obwody 1-fazowe mają fazę z bilansu, 3-fazowe — 3F", () => {
      for (const a of aparaty.filter((x) => x.kind === "mcb")) {
        if (a.poles === "3P") expect(a.phase).toBe("3F");
        else expect(["L1", "L2", "L3"]).toContain(a.phase);
      }
    });

    it("analiza selektywności nie zgłasza błędów ani ostrzeżeń", () => {
      const bledy = computeSelectivity(aparaty, s.config.mainRating, s.config.supply3f, true).filter((f) => f.level === "error" || f.level === "warn");
      expect(bledy.map((b) => b.title)).toEqual([]);
    });

    it("mieści się w obudowie, którą proponuje", () => {
      expect(modulySzablonu(s)).toBeLessThanOrEqual(s.config.perRow * 4);
    });
  });

  it("ładowarka EV stoi pod różnicówką typu B", () => {
    const aparaty = aparatyZSzablonu(SZABLONY_ROZDZIELNIC.find((s) => s.id === "dom-pv-ev")!);
    const ev = aparaty.find((a) => a.caption.includes("Ładowarka EV"))!;
    const rcd = aparaty.find((a) => a.tag === ev.rcdTag)!;
    expect(czuloscITypRcd(rcd)).toBe("30 mA · typ B");
  });

  it("falownik PV nie ma różnicówki", () => {
    const aparaty = aparatyZSzablonu(SZABLONY_ROZDZIELNIC.find((s) => s.id === "dom-pv")!);
    expect(aparaty.find((a) => a.caption === "Falownik PV")!.rcdTag).toBeUndefined();
  });
});
