import { describe, expect, it } from "vitest";
import type { ProjectPayload } from "@/store/useProjectStore";
import type { Magazyn } from "./projektyLokalne";
import { usunProjekt } from "./projektyLokalne";
import { czytajWersje, doPrzywrocenia, kluczWersji, MAKS_WERSJI, nazwaDomyslna, usunWersje, zapiszWersje } from "./wersjeProjektu";

function pamiec(limit = Infinity): Magazyn & { dane: Map<string, string> } {
  const dane = new Map<string, string>();
  return {
    dane,
    getItem: (k) => dane.get(k) ?? null,
    setItem: (k, v) => {
      if (v.length > limit) throw new DOMException("quota", "QuotaExceededError");
      dane.set(k, v);
    },
    removeItem: (k) => void dane.delete(k),
  };
}

const payload = (elementow: number, podklad = "data:image/png;base64,AAAA"): ProjectPayload =>
  ({
    draft: { elements: Array.from({ length: elementow }, (_, i) => ({ id: `e${i}` })) },
    floors: [{ id: "f1", name: "Parter" }],
    bgImages: { f1: podklad },
  }) as unknown as ProjectPayload;

let n = 0;
const id = () => `w${n++}`;

describe("historia wersji projektu", () => {
  it("zapisuje migawkę pod nazwą, najnowsza na początku listy", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "pierwsza", payload(1), 1000, id);
    zapiszWersje(m, "p1", "przed zmianą obwodów", payload(5), 2000, id);
    const w = czytajWersje(m, "p1");
    expect(w.map((x) => x.nazwa)).toEqual(["przed zmianą obwodów", "pierwsza"]);
    expect(w[0].payload.draft.elements).toHaveLength(5);
  });

  it("migawka nie niesie podkładu rzutu", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "x", payload(1), 1000, id);
    expect(czytajWersje(m, "p1")[0].payload.bgImages).toEqual({});
    expect(m.getItem(kluczWersji("p1"))).not.toContain("base64");
  });

  it("pusta nazwa dostaje datę", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "  ", payload(1), new Date(2026, 10, 7, 14, 5).getTime(), id);
    expect(czytajWersje(m, "p1")[0].nazwa).toBe("Wersja z 7.11.2026, 14:05");
    expect(nazwaDomyslna(new Date(2026, 0, 2, 9, 3).getTime())).toBe("Wersja z 2.01.2026, 09:03");
  });

  it(`trzyma najwyżej ${MAKS_WERSJI} wersji — najstarsze odpadają`, () => {
    const m = pamiec();
    for (let i = 0; i < MAKS_WERSJI + 3; i++) zapiszWersje(m, "p1", `v${i}`, payload(1), 1000 + i, id);
    const w = czytajWersje(m, "p1");
    expect(w).toHaveLength(MAKS_WERSJI);
    expect(w[0].nazwa).toBe(`v${MAKS_WERSJI + 2}`);
    expect(w.some((x) => x.nazwa === "v0")).toBe(false);
  });

  it("brak miejsca w przeglądarce to komunikat, nie wyjątek — i lista się nie zmienia", () => {
    const m = pamiec(400);
    expect(zapiszWersje(m, "p1", "mała", payload(1), 1000, id).ok).toBe(true);
    const wynik = zapiszWersje(m, "p1", "duża", payload(200), 2000, id);
    expect(wynik.ok).toBe(false);
    expect(czytajWersje(m, "p1").map((w) => w.nazwa)).toEqual(["mała"]);
  });

  it("usuwanie wersji; ostatnia usunięta zdejmuje klucz", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "a", payload(1), 1000, () => "A");
    zapiszWersje(m, "p1", "b", payload(1), 2000, () => "B");
    expect(usunWersje(m, "p1", "A").map((w) => w.id)).toEqual(["B"]);
    usunWersje(m, "p1", "B");
    expect(m.dane.has(kluczWersji("p1"))).toBe(false);
  });

  it("przywrócenie bierze bieżący podkład dla kondygnacji, które są w migawce", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "x", payload(3), 1000, id);
    const w = czytajWersje(m, "p1")[0];
    const wynik = doPrzywrocenia(w, { f1: "PODKLAD-F1", f9: "INNE-PIETRO" });
    expect(wynik.bgImages).toEqual({ f1: "PODKLAD-F1" });
    expect(wynik.draft.elements).toHaveLength(3);
  });

  it("wersje są osobne dla każdego projektu i znikają razem z nim", () => {
    const m = pamiec();
    zapiszWersje(m, "p1", "a", payload(1), 1000, id);
    zapiszWersje(m, "p2", "b", payload(1), 1000, id);
    expect(czytajWersje(m, "p2").map((w) => w.nazwa)).toEqual(["b"]);
    usunProjekt(m, "p1");
    expect(czytajWersje(m, "p1")).toEqual([]);
    expect(czytajWersje(m, "p2")).toHaveLength(1);
  });

  it("uszkodzony zapis to pusta lista", () => {
    const m = pamiec();
    m.setItem(kluczWersji("p1"), "{nie json");
    expect(czytajWersje(m, "p1")).toEqual([]);
    m.setItem(kluczWersji("p1"), JSON.stringify([{ id: 1 }, null, { id: "ok", payload: {}, nazwa: "", utworzona: 5 }]));
    expect(czytajWersje(m, "p1").map((w) => w.nazwa)).toEqual(["Wersja bez nazwy"]);
  });
});
