import { describe, expect, it } from "vitest";
import type { Opening, RoomShape, RoomType } from "@/types";
import { pointInPolygon } from "./geometry";
import { elementySzablonu, odmianaElementu, opisSzablonu, SZABLONY } from "./szablonyPomieszczen";

const MPU = 0.05; // 1 jedn. = 5 cm
/** Kuchnia 5 × 4 m. */
const kuchnia: RoomShape = {
  id: "k",
  floor: "f1",
  name: "Kuchnia",
  color: "#fff",
  type: "kuchnia",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ],
};
/** Drzwi 90 cm w dolnej ścianie, środek 1 m od lewego narożnika. */
const drzwi: Opening = { id: "d", floor: "f1", x: 20, y: 80, angle: 0, width: 18, kind: "drzwi" };

let n = 0;
const wstaw = (typ: RoomType, room = kuchnia, openings: Opening[] = [drzwi]) =>
  elementySzablonu(typ, { room, elements: [], walls: [], roomShapes: [room], openings, mpu: MPU, skalaSymboli: 0.5, noweId: () => `n${n++}` });

describe("szablony pomieszczeń", () => {
  it("kuchnia dostaje tyle symboli, ile mówi szablon, z literami AGD", () => {
    const el = wstaw("kuchnia");
    const oczekiwane = SZABLONY.kuchnia!.reduce((s, p) => s + p.ile, 0);
    expect(el).toHaveLength(oczekiwane);
    expect(el.filter((e) => e.type === "wypustAGD").map((e) => e.agdLetter).sort()).toEqual(["I", "P", "Z"]);
    expect(el.filter((e) => e.type === "gniazdko" && e.gangs === 2)).toHaveLength(3);
  });

  it("wszystko trafia do tego pomieszczenia — w jego obrysie i z jego nazwą", () => {
    for (const e of wstaw("kuchnia")) {
      expect(e.room).toBe("Kuchnia");
      expect(e.floor).toBe("f1");
      expect(pointInPolygon(e, kuchnia.points), `${e.type} @ ${e.x},${e.y}`).toBe(true);
    }
  });

  it("oprawa wisi w środku, łącznik stoi przy drzwiach", () => {
    const el = wstaw("kuchnia");
    const oprawa = el.find((e) => e.type === "oswietlenie")!;
    expect(Math.abs(oprawa.x - 50)).toBeLessThan(15);
    expect(Math.abs(oprawa.y - 40)).toBeLessThan(15);
    const lacznik = el.find((e) => e.type === "wlacznik")!;
    // nie dalej niż metr od drzwi
    expect(Math.hypot(lacznik.x - drzwi.x, lacznik.y - drzwi.y) * MPU).toBeLessThan(1);
  });

  it("nic nie staje w świetle drzwi", () => {
    for (const e of wstaw("salon", { ...kuchnia, name: "Salon", type: "salon" })) {
      const wDrzwiach = e.y > 70 && Math.abs(e.x - drzwi.x) < drzwi.width / 2;
      expect(wDrzwiach, `${e.type} @ ${e.x},${e.y}`).toBe(false);
    }
  });

  it("osprzęt przyścienny jest przyklejony do ściany i obrócony od niej", () => {
    const el = wstaw("kuchnia").filter((e) => e.type === "gniazdko");
    for (const e of el) {
      const doSciany = Math.min(e.x, 100 - e.x, e.y, 80 - e.y);
      expect(doSciany).toBeLessThan(10);
    }
    // gniazda nie są wszystkie na jednej ścianie — rozkładają się po obwodzie
    const sciany = new Set(el.map((e) => (e.y < 10 ? "g" : e.y > 70 ? "d" : e.x < 10 ? "l" : "p")));
    expect(sciany.size).toBeGreaterThan(1);
  });

  it("symbole nie nachodzą na siebie", () => {
    const el = wstaw("salon", { ...kuchnia, name: "Salon", type: "salon" });
    for (let i = 0; i < el.length; i++)
      for (let j = i + 1; j < el.length; j++) expect(Math.hypot(el[i].x - el[j].x, el[i].y - el[j].y)).toBeGreaterThan(3);
  });

  it("klatka: dwa łączniki schodowe, po przeciwnych stronach", () => {
    const el = wstaw("klatka", { ...kuchnia, name: "Klatka", type: "klatka" }).filter((e) => e.type === "wlacznikSchodowy");
    expect(el).toHaveLength(2);
    expect(Math.hypot(el[0].x - el[1].x, el[0].y - el[1].y) * MPU).toBeGreaterThan(2);
  });

  it("pomieszczenie bez drzwi też dostaje szablon", () => {
    expect(wstaw("pokoj", { ...kuchnia, name: "Pokój", type: "pokoj" }, []).length).toBe(SZABLONY.pokoj!.reduce((s, p) => s + p.ile, 0));
  });

  it("każdy typ pomieszczenia ma szablon i opis", () => {
    const typy: RoomType[] = ["kuchnia", "lazienka", "pralnia", "kotlownia", "salon", "sypialnia", "pokoj", "garaz", "klatka", "inne"];
    for (const t of typy) expect(opisSzablonu(t).length, t).toBeGreaterThan(0);
    expect(opisSzablonu("kuchnia")).toContain("3 × Gniazdo 230 V podwójne");
  });

  it("odmiana: element / elementy / elementów", () => {
    expect([1, 2, 4, 5, 12, 22, 25].map(odmianaElementu)).toEqual([
      "element",
      "elementy",
      "elementy",
      "elementów",
      "elementów",
      "elementy",
      "elementów",
    ]);
  });
});
