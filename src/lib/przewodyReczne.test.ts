import { describe, expect, it } from "vitest";
import { domyslnyPrzewod } from "./przewodyReczne";

describe("domyślny przewód dla pary elementów", () => {
  it("łącznik → oprawa to sterowanie 3×1,5", () => {
    expect(domyslnyPrzewod("wlacznik", "oswietlenie")).toEqual({ rodzaj: "sterowanie", kabel: "YDYp 3×1,5" });
    expect(domyslnyPrzewod("kinkiet", "wlacznikSchodowy")).toEqual({ rodzaj: "sterowanie", kabel: "YDYp 3×1,5" });
  });

  it("teletechnika to skrętka, antena — koncentryk", () => {
    expect(domyslnyPrzewod("szafkaTeletech", "rj45")).toEqual({ rodzaj: "teletechnika", kabel: "U/UTP kat. 6" });
    expect(domyslnyPrzewod("rtvsat", "szafkaTeletech")).toEqual({ rodzaj: "teletechnika", kabel: "RG-6 (koncentryk)" });
  });

  it("gniazda zasila 3×2,5, siłę 5×2,5", () => {
    expect(domyslnyPrzewod("gniazdko", "gniazdko")).toEqual({ rodzaj: "zasilanie", kabel: "YDYp 3×2,5" });
    expect(domyslnyPrzewod("rozdzielnica", "gniazdko400")).toEqual({ rodzaj: "zasilanie", kabel: "YDYp 5×2,5" });
  });
});
