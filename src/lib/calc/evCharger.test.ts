import { describe, expect, it } from "vitest";
import { obliczObwodEV, type EVWejscie } from "./evCharger";

function ev(over: Partial<EVWejscie> = {}): EVWejscie {
  return {
    mocLadowania_W: 7360,
    liczba_faz: "1",
    cos_phi: 1,
    dlugosc_m: 15,
    sposob_ulozenia: "w_scianie",
    maWbudowanaOchroneDC: false,
    ...over,
  };
}

describe("obwód EV — prąd i dobór przewodu", () => {
  it("Ib = P/(U·cosφ) dla ładowarki 1-fazowej 7,36 kW (typowe 32 A)", () => {
    const r = obliczObwodEV(ev());
    expect(r.bledy).toEqual([]);
    expect(r.wartosci!.Ib_A).toBeCloseTo(32, 0);
  });

  it("korzysta z sizeCircuit — dobiera realny przekrój i zabezpieczenie", () => {
    const r = obliczObwodEV(ev());
    expect(r.wartosci!.dobor.przekroj_mm2).not.toBeNull();
    expect(r.wartosci!.dobor.aparat).not.toBeNull();
  });

  it("3-fazowa ładowarka 11 kW: Ib = P/(√3·U·cosφ) ≈ 15,9 A", () => {
    const r = obliczObwodEV(ev({ mocLadowania_W: 11000, liczba_faz: "3" }));
    expect(r.wartosci!.Ib_A).toBeCloseTo(15.88, 1);
  });

  it("obwód traktowany jako pełne obciążenie ciągłe — mówi o tym wprost, bez współczynnika redukcji", () => {
    const r = obliczObwodEV(ev());
    expect(r.zalozenia.join(" ")).toMatch(/PEŁNYM prądem ciągle/);
    expect(r.zalozenia.join(" ")).toMatch(/dedykowany/);
  });
});

describe("obwód EV — wymagany typ RCD (PN-HD 60364-7-722)", () => {
  it("bez wbudowanej ochrony DC wymagany RCD typu B albo A+RDC-DD", () => {
    const r = obliczObwodEV(ev({ maWbudowanaOchroneDC: false }));
    expect(r.wartosci!.wymaganyRCD).toBe("typB_albo_RDC-DD");
    expect(r.zalozenia.join(" ")).toMatch(/składową stałą/);
    expect(r.zalozenia.join(" ")).toMatch(/NIE WYSTARCZA/);
  });

  it("z wbudowaną ochroną DC standardowy RCD typu A wystarczy", () => {
    const r = obliczObwodEV(ev({ maWbudowanaOchroneDC: true }));
    expect(r.wartosci!.wymaganyRCD).toBe("typA_wystarczy");
    expect(r.zalozenia.join(" ")).toMatch(/wystarczający/);
  });
});

describe("obwód EV — walidacja i werdykt", () => {
  it("moc niedodatnia i cosφ poza zakresem są odrzucane", () => {
    expect(obliczObwodEV(ev({ mocLadowania_W: 0 })).bledy.map((b) => b.code)).toContain("MOC");
    expect(obliczObwodEV(ev({ cos_phi: 1.5 })).bledy.map((b) => b.code)).toContain("COSFI");
  });

  it("udany dobór daje werdykt z konkretnym kablem i zabezpieczeniem", () => {
    const r = obliczObwodEV(ev());
    expect(r.ocena!.verdict).toBe("spelniony");
    expect(r.ocena!.komunikat).toMatch(/Dobrano/);
  });

  it("zbyt duży prąd na krótkim szeregu przekrojów daje werdykt niespełniony", () => {
    // 3-fazowa ładowarka 400 kW to absurd, ale ma sprawdzić ścieżkę błędu doboru
    const r = obliczObwodEV(ev({ mocLadowania_W: 400_000, liczba_faz: "3" }));
    expect(r.ocena!.verdict).toBe("niespelniony");
  });
});
