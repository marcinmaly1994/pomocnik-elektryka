import { describe, expect, it } from "vitest";
import { przelaczWGrupie } from "./zaznaczanieGrupy";

describe("przelaczWGrupie — dokładanie do zaznaczenia grupowego", () => {
  it("element zaznaczony wcześniej pojedynczo trafia do grupy razem z nowym", () => {
    expect(przelaczWGrupie([], "a", "b")).toEqual(["a", "b"]);
  });

  it("klik w ten sam, już zaznaczony element zaczyna od niego grupę", () => {
    expect(przelaczWGrupie([], "a", "a")).toEqual(["a"]);
  });

  it("bez zaznaczenia pojedynczego grupa zaczyna się od klikniętego", () => {
    expect(przelaczWGrupie([], null, "b")).toEqual(["b"]);
  });

  it("w istniejącej grupie klik dokłada albo zdejmuje", () => {
    expect(przelaczWGrupie(["a", "b"], "a", "c")).toEqual(["a", "b", "c"]);
    expect(przelaczWGrupie(["a", "b"], "a", "b")).toEqual(["a"]);
  });
});
