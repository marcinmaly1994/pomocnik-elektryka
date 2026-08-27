import { describe, it, expect } from "vitest";
import { computeLightGroups, isLightControl, isLightPoint } from "./lightGroups";
import { NO_ROOM } from "./elements";
import type { ElementType, InstallationElement } from "@/types";

let seq = 0;
function el(type: ElementType, x: number, y: number, room = "Salon", floor = "f1", extra: Partial<InstallationElement> = {}): InstallationElement {
  return { id: `e${++seq}`, type, x, y, room, floor, dedicated: false, note: "", gangs: 1, ...extra };
}

/** Pierwszy (i dla wszystkiego poza łącznikiem grupowym jedyny) numer grupy elementu. */
function one(g: Map<string, (number | undefined)[]>, id: string): number | undefined {
  return g.get(id)?.[0];
}

describe("rozpoznawanie ról", () => {
  it("termostat nie steruje oświetleniem, mimo roli control", () => {
    expect(isLightControl(el("termostat", 0, 0))).toBe(false);
    expect(isLightControl(el("wlacznik", 0, 0))).toBe(true);
    expect(isLightControl(el("czujnikRuchu", 0, 0))).toBe(true);
  });

  it("punktem świetlnym są oprawy, nie łączniki", () => {
    expect(isLightPoint(el("oswietlenie", 0, 0))).toBe(true);
    expect(isLightPoint(el("kinkiet", 0, 0))).toBe(true);
    expect(isLightPoint(el("wlacznik", 0, 0))).toBe(false);
  });
});

describe("computeLightGroups", () => {
  it("łącznik i światło w tym samym pomieszczeniu dostają ten sam numer", () => {
    const sw = el("wlacznik", 10, 10);
    const light = el("oswietlenie", 50, 50);
    const g = computeLightGroups([sw, light]);
    expect(one(g, sw.id)).toBe(1);
    expect(one(g, light.id)).toBe(1);
  });

  it("nie łączy elementów z różnych pomieszczeń", () => {
    const sw = el("wlacznik", 10, 10, "Salon");
    const light = el("oswietlenie", 50, 50, "Kuchnia");
    const g = computeLightGroups([sw, light]);
    expect(g.size).toBe(0);
  });

  it("nie łączy elementów z różnych kondygnacji", () => {
    const sw = el("wlacznik", 10, 10, "Salon", "f1");
    const light = el("oswietlenie", 50, 50, "Salon", "f2");
    expect(computeLightGroups([sw, light]).size).toBe(0);
  });

  it("łączy elementy bez przypisanego pomieszczenia — NO_ROOM to wspólny „pokój”, nie odsiew", () => {
    const sw = el("wlacznik", 10, 10, NO_ROOM);
    const light = el("oswietlenie", 50, 50, NO_ROOM);
    const g = computeLightGroups([sw, light]);
    expect(one(g, sw.id)).toBe(1);
    expect(one(g, light.id)).toBe(1);
  });

  it("nie łączy elementu bez pomieszczenia z elementem w rozpoznanym pomieszczeniu", () => {
    const sw = el("wlacznik", 10, 10, NO_ROOM);
    const light = el("oswietlenie", 50, 50, "Salon");
    expect(computeLightGroups([sw, light]).size).toBe(0);
  });

  it("sam łącznik albo samo światło nie dostaje numeru — numer ma znaczyć „steruje tamtym”", () => {
    expect(computeLightGroups([el("wlacznik", 0, 0)]).size).toBe(0);
    expect(computeLightGroups([el("oswietlenie", 0, 0)]).size).toBe(0);
  });

  it("jeden łącznik zbiera wszystkie światła w pomieszczeniu", () => {
    const sw = el("wlacznik", 0, 0);
    const lights = [el("oswietlenie", 100, 0), el("oswietlenie", 200, 0), el("kinkiet", 300, 0)];
    const g = computeLightGroups([sw, ...lights]);
    lights.forEach((l) => expect(one(g, l.id)).toBe(one(g, sw.id)));
  });

  it("przy dwóch łącznikach światło idzie do bliższego", () => {
    const left = el("wlacznik", 0, 0);
    const right = el("wlacznik", 500, 0);
    const nearLeft = el("oswietlenie", 60, 0);
    const nearRight = el("oswietlenie", 440, 0);
    const g = computeLightGroups([left, right, nearLeft, nearRight]);
    expect(one(g, nearLeft.id)).toBe(one(g, left.id));
    expect(one(g, nearRight.id)).toBe(one(g, right.id));
    expect(one(g, left.id)).not.toBe(one(g, right.id));
  });

  it("schodowe w jednym pomieszczeniu tworzą JEDNĄ grupę — sterują tym samym punktem", () => {
    const a = el("wlacznikSchodowy", 0, 0);
    const b = el("wlacznikSchodowy", 500, 0);
    const light = el("oswietlenie", 250, 0);
    const g = computeLightGroups([a, b, light]);
    expect(one(g, a.id)).toBe(one(g, b.id));
    expect(one(g, light.id)).toBe(one(g, a.id));
  });

  it("krzyżowy dołącza do tej samej grupy co schodowe", () => {
    const a = el("wlacznikSchodowy", 0, 0);
    const x = el("wlacznikKrzyzowy", 250, 0);
    const b = el("wlacznikSchodowy", 500, 0);
    const light = el("oswietlenie", 250, 100);
    const g = computeLightGroups([a, x, b, light]);
    expect(new Set([one(g, a.id), one(g, x.id), one(g, b.id), one(g, light.id)]).size).toBe(1);
  });

  it("dwa zwykłe łączniki obok schodowych dają osobne grupy", () => {
    const stair1 = el("wlacznikSchodowy", 0, 0);
    const stair2 = el("wlacznikSchodowy", 500, 0);
    const stairLight = el("oswietlenie", 250, 0);
    const plain = el("wlacznik", 0, 400);
    const plainLight = el("oswietlenie", 60, 400);
    const g = computeLightGroups([stair1, stair2, stairLight, plain, plainLight]);
    expect(one(g, stair1.id)).toBe(one(g, stair2.id));
    expect(one(g, plain.id)).toBe(one(g, plainLight.id));
    expect(one(g, plain.id)).not.toBe(one(g, stair1.id));
  });

  it("numeruje od 1 osobno na każdej kondygnacji", () => {
    const a = [el("wlacznik", 0, 0, "Salon", "f1"), el("oswietlenie", 50, 0, "Salon", "f1")];
    const b = [el("wlacznik", 0, 0, "Salon", "f2"), el("oswietlenie", 50, 0, "Salon", "f2")];
    const g = computeLightGroups([...a, ...b]);
    expect(one(g, a[0].id)).toBe(1);
    expect(one(g, b[0].id)).toBe(1);
  });

  it("numeracja jest stabilna — dorysowanie światła nie przenumerowuje grup", () => {
    const swA = el("wlacznik", 0, 0, "Kuchnia");
    const lightA = el("oswietlenie", 50, 0, "Kuchnia");
    const swB = el("wlacznik", 0, 0, "Salon");
    const lightB = el("oswietlenie", 50, 0, "Salon");
    const before = computeLightGroups([swA, lightA, swB, lightB]);
    const after = computeLightGroups([swA, lightA, swB, lightB, el("oswietlenie", 90, 0, "Salon")]);
    expect(one(after, swA.id)).toBe(one(before, swA.id));
    expect(one(after, swB.id)).toBe(one(before, swB.id));
  });

  it("ręczny numer ma pierwszeństwo przed automatem", () => {
    const sw = el("wlacznik", 0, 0);
    const near = el("oswietlenie", 50, 0);
    const moved = el("oswietlenie", 60, 0, "Salon", "f1", { lightGroup: [7] });
    const g = computeLightGroups([sw, near, moved]);
    expect(one(g, moved.id)).toBe(7);
    expect(one(g, near.id)).toBe(one(g, sw.id));
    expect(one(g, near.id)).not.toBe(7);
  });

  it("wpisanie cudzego numeru scala elementy w jedną grupę", () => {
    const sw = el("wlacznik", 0, 0);
    const light = el("oswietlenie", 50, 0);
    const auto = computeLightGroups([sw, light]);
    const other = el("kinkiet", 900, 900, "Strych", "f1", { lightGroup: [one(auto, sw.id) ?? null] });
    const g = computeLightGroups([sw, light, other]);
    expect(one(g, other.id)).toBe(one(g, sw.id));
  });

  it("ręcznie przypisany łącznik nie zakłada dodatkowej grupy automatycznej", () => {
    const sw = el("wlacznik", 0, 0, "Salon", "f1", { lightGroup: [5] });
    const light = el("oswietlenie", 50, 0);
    const g = computeLightGroups([sw, light]);
    expect(one(g, sw.id)).toBe(5);
    expect(g.has(light.id)).toBe(false); // bez łącznika w automacie światło zostaje bez grupy
  });
});

describe("łącznik grupowy — dwa obwody", () => {
  it("dostaje DWA numery, po jednym na dźwignię", () => {
    const sw = el("wlacznikGrupowy", 250, 250);
    const light = el("oswietlenie", 250, 100);
    const g = computeLightGroups([sw, light]);
    expect(g.get(sw.id)).toHaveLength(2);
    expect(new Set(g.get(sw.id)).size).toBe(2); // to dwie RÓŻNE grupy
  });

  it("numeruje oba obwody nawet gdy tylko jeden ma przypisaną lampę", () => {
    const sw = el("wlacznikGrupowy", 250, 250);
    const onlyLeft = el("oswietlenie", 100, 100); // wyraźnie po lewej
    const g = computeLightGroups([sw, onlyLeft]);
    expect(g.get(sw.id)).toHaveLength(2);
    // lampa trafia do jednego z obwodów łącznika, drugi zostaje pusty, ale ponumerowany
    expect(g.get(sw.id)).toContain(one(g, onlyLeft.id));
  });

  it("dzieli lampy między dźwignie wg strony, po której leżą", () => {
    const sw = el("wlacznikGrupowy", 300, 300);
    const left = el("oswietlenie", 100, 200);
    const right = el("oswietlenie", 500, 200);
    const g = computeLightGroups([sw, left, right]);
    const [gLeft, gRight] = g.get(sw.id)!;
    expect(one(g, left.id)).toBe(gLeft);
    expect(one(g, right.id)).toBe(gRight);
    expect(one(g, left.id)).not.toBe(one(g, right.id));
  });

  it("bez żadnej lampy w pomieszczeniu nie dostaje numerów", () => {
    const sw = el("wlacznikGrupowy", 250, 250);
    expect(computeLightGroups([sw]).size).toBe(0);
  });

  it("ręczny numer na JEDNEJ dźwigni zostawia drugą automatowi", () => {
    const sw = el("wlacznikGrupowy", 300, 300, "Salon", "f1", { lightGroup: [null, 42] });
    const left = el("oswietlenie", 100, 200);
    const right = el("oswietlenie", 500, 200);
    const g = computeLightGroups([sw, left, right]);
    const [c0, c1] = g.get(sw.id)!;
    expect(c1).toBe(42); // prawa dźwignia ustawiona ręcznie
    expect(c0).toBeDefined(); // lewa dalej z automatu
    expect(c0).not.toBe(42);
    // lampa z lewej trafia do automatycznego obwodu; ta z prawej nie ma już dokąd,
    // bo ręcznie ustawiony obwód nie bierze udziału w doborze
    expect(one(g, left.id)).toBe(c0);
  });

  it("ręczne numery na obu dźwigniach całkiem wyłączają łącznik z automatu", () => {
    const sw = el("wlacznikGrupowy", 300, 300, "Salon", "f1", { lightGroup: [8, 9] });
    const light = el("oswietlenie", 100, 200);
    const g = computeLightGroups([sw, light]);
    expect(g.get(sw.id)).toEqual([8, 9]);
    expect(g.has(light.id)).toBe(false); // bez obwodu w automacie lampa zostaje bez grupy
  });

  it("toleruje zapis sprzed rozbicia na obwody (pojedyncza liczba)", () => {
    const legacy = { ...el("oswietlenie", 50, 0), lightGroup: 4 as unknown as (number | null)[] };
    const g = computeLightGroups([legacy]);
    expect(one(g, legacy.id)).toBe(4);
  });

  it("zwykłe łączniki obok grupowego dalej mają po jednym numerze", () => {
    const grupowy = el("wlacznikGrupowy", 300, 300);
    const zwykly = el("wlacznik", 300, 600, "Kuchnia");
    const l1 = el("oswietlenie", 100, 200);
    const l2 = el("oswietlenie", 500, 200);
    const l3 = el("oswietlenie", 340, 600, "Kuchnia");
    const g = computeLightGroups([grupowy, zwykly, l1, l2, l3]);
    expect(g.get(grupowy.id)).toHaveLength(2);
    expect(g.get(zwykly.id)).toHaveLength(1);
    expect(one(g, l3.id)).toBe(one(g, zwykly.id));
  });
});
