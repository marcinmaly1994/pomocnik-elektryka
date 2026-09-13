import { describe, it, expect } from "vitest";
import { zbudujProjektPrzykladowy } from "./demoProjekt";
import { polygonAreaM2 } from "./geometry";
import { computeCosts } from "./costs";
import { computeCircuits, computeRcdGroups } from "./panel/circuits";
import { findPanel } from "./panel/loads";
import { scaleOf } from "./design";

/**
 * Projekt przykładowy to DANE wpisane ręcznie, więc łatwo je po cichu popsuć —
 * przesunięty narożnik albo literówka w nazwie pomieszczenia nie wywalają niczego,
 * tylko sprawiają, że pierwsze, co widzi nowy użytkownik, jest bez sensu.
 *
 * Te testy pilnują tego, co w przykładzie musi być PRAWDĄ, a nie tego, jak dokładnie
 * jest narysowany — żeby dało się swobodnie przestawiać osprzęt, nie przepisując
 * przy tym testów.
 */
describe("projekt przykładowy", () => {
  const payload = zbudujProjektPrzykladowy();
  const { elements, walls, roomShapes } = payload.draft;
  const floor = payload.activeFloorId;

  it("obiecuje 70 m² i tyle naprawdę ma", () => {
    const mpu = scaleOf(payload.scales, floor)!;
    const metraz = roomShapes.reduce((a, r) => a + (polygonAreaM2(r.points, mpu) ?? 0), 0);
    // Nazwa projektu jest obietnicą złożoną na ekranie startowym („mieszkanie 70 m²")
    // — a powierzchnia pokazuje się potem w pasku stanu pod rysunkiem. Rozjazd tych
    // dwóch liczb to jedyna rzecz, którą użytkownik na tym ekranie może SPRAWDZIĆ.
    expect(payload.projectName).toContain("70 m²");
    expect(metraz).toBeCloseTo(70, 1);
  });

  it("każdy element stoi w pomieszczeniu, które naprawdę istnieje", () => {
    const nazwy = new Set(roomShapes.map((r) => r.name));
    for (const el of elements) expect(nazwy, `element ${el.id}`).toContain(el.room);
  });

  it("wszystko siedzi na jednej kondygnacji i w obszarze planu", () => {
    const { w, h } = payload.planSize;
    for (const el of elements) {
      expect(el.floor).toBe(floor);
      expect(el.x, `element ${el.id} w poziomie`).toBeGreaterThanOrEqual(0);
      expect(el.x).toBeLessThanOrEqual(w);
      expect(el.y, `element ${el.id} w pionie`).toBeGreaterThanOrEqual(0);
      expect(el.y).toBeLessThanOrEqual(h);
    }
    for (const s of walls) expect(s.floor).toBe(floor);
    for (const r of roomShapes) expect(r.floor).toBe(floor);
  });

  it("ma rozdzielnicę na planie, więc kosztorys mierzy trasy zamiast zgadywać", () => {
    // Bez rozdzielnicy metraż kabla spada na ryczałt „5 mb na punkt" i przykład
    // pokazywałby gorszy wynik, niż aplikacja potrafi — patrz `elementy`.
    expect(findPanel(elements)).toBeTruthy();
  });

  it("wypełnia rozdzielnicę i kosztorys — po to w ogóle istnieje", () => {
    const circuits = computeCircuits(elements, roomShapes);
    expect(circuits.length).toBeGreaterThan(3);
    const { quantities } = computeCosts(elements, circuits, computeRcdGroups(circuits));
    expect(quantities.gniazdko).toBeGreaterThan(0);
    // Klucz CENNIKA, nie typ elementu: `oswietlenie`/`kinkiet`/`oswietlenieZewn`
    // wpadają razem do pozycji „oprawa" (patrz `TYPE_TO_PRICE_KEY` w costs.ts).
    expect(quantities.oprawa).toBeGreaterThan(0);
  });

  it("pomieszczenia mokre mają jawny typ, nie zgadywanie po nazwie", () => {
    // Od typu zależą strefy ochronne i osobne obwody — a `guessRoomType` po nazwie
    // to droga awaryjna dla starych zapisów, nie coś, na czym przykład ma stać.
    const kuchnia = roomShapes.find((r) => r.name === "Kuchnia");
    const lazienka = roomShapes.find((r) => r.name === "Łazienka");
    expect(kuchnia?.type).toBe("kuchnia");
    expect(lazienka?.type).toBe("lazienka");
  });

  it("jest oznaczony jako przykład — to on włącza pasek i blokadę zapisu w chmurze", () => {
    expect(payload.projektPrzykladowy).toBe(true);
  });

  it("nie wlecze ze sobą podkładu", () => {
    // Podkład to data URL — setki kilobajtów base64 w paczce i w każdym autozapisie.
    expect(payload.bgImages).toEqual({});
  });

  it("buduje się od nowa przy każdym wywołaniu", () => {
    // `loadProjectPayload` bierze te obiekty WPROST do store'a, więc wspólna stała
    // dałaby się zmodyfikować pierwszym przeciągnięciem elementu na planie.
    const drugi = zbudujProjektPrzykladowy();
    expect(drugi.draft.elements).not.toBe(elements);
    expect(drugi.draft.elements).toEqual(elements);
  });
});
