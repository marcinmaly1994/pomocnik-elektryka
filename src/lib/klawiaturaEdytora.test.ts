import { describe, it, expect, beforeEach } from "vitest";
import { klawiszDlaEdytora } from "./klawiaturaEdytora";

describe("klawiszDlaEdytora", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const dodaj = (html: string) => {
    const kontener = document.createElement("div");
    kontener.innerHTML = html;
    document.body.appendChild(kontener);
    return kontener;
  };

  it("klawisz na samej stronie (body) należy do edytora", () => {
    expect(klawiszDlaEdytora(document.body)).toBe(true);
  });

  it("przycisk paska edytora — też edytor", () => {
    const k = dodaj("<button>Obróć</button>");
    expect(klawiszDlaEdytora(k.querySelector("button"))).toBe(true);
  });

  it("pola, które same przyjmują klawisze, nie oddają ich edytorowi", () => {
    const k = dodaj('<input /><textarea></textarea><select><option>Pokój</option></select><div contenteditable="true"></div>');
    expect(klawiszDlaEdytora(k.querySelector("input"))).toBe(false);
    expect(klawiszDlaEdytora(k.querySelector("textarea"))).toBe(false);
    expect(klawiszDlaEdytora(k.querySelector("select"))).toBe(false);
    const edytowalny = k.querySelector("[contenteditable]") as HTMLElement;
    // jsdom nie liczy `isContentEditable` — ustawiamy jak przeglądarka
    Object.defineProperty(edytowalny, "isContentEditable", { value: true });
    expect(klawiszDlaEdytora(edytowalny)).toBe(false);
  });

  it("otwarte okno modalne blokuje edytor, nawet gdy fokus został poza nim", () => {
    const k = dodaj('<button id="poza">x</button><div role="dialog" data-state="open"><button id="w">Zamknij</button></div>');
    expect(klawiszDlaEdytora(k.querySelector("#w"))).toBe(false);
    expect(klawiszDlaEdytora(k.querySelector("#poza"))).toBe(false);
  });

  it("otwarte menu blokuje edytor", () => {
    const k = dodaj('<button id="wyzwalacz">Projekty</button><div role="menu"><div role="menuitem">Moje projekty</div></div>');
    expect(klawiszDlaEdytora(k.querySelector("[role=menuitem]"))).toBe(false);
    expect(klawiszDlaEdytora(k.querySelector("#wyzwalacz"))).toBe(false);
  });

  it("otwarty panel paska edytora blokuje edytor", () => {
    const k = dodaj('<button id="wyzwalacz">Rysunek</button><div data-nakladka-edytora><button>Duplikuj</button></div>');
    expect(klawiszDlaEdytora(k.querySelector("#wyzwalacz"))).toBe(false);
  });

  /** Dymek podpowiedzi stoi przy narzędziu w trakcie zwykłej pracy — nie może
   *  wyłączać skrótów. Odróżnia go brak `data-state` (to nie jest okno Radixa). */
  it("dymek podpowiedzi nie blokuje skrótów", () => {
    dodaj('<div role="dialog" aria-label="Podpowiedź"><button>Rozumiem</button></div>');
    expect(klawiszDlaEdytora(document.body)).toBe(true);
  });

  it("zamknięte okno (data-state=closed) nie blokuje", () => {
    dodaj('<div role="dialog" data-state="closed"></div>');
    expect(klawiszDlaEdytora(document.body)).toBe(true);
  });
});
