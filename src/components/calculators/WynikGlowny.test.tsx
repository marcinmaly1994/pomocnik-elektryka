import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WynikGlowny } from "./WynikGlowny";

describe("WynikGlowny", () => {
  it("para etykieta → wartość jako lista opisów, z jednostką", () => {
    const { container } = render(
      <WynikGlowny wartosci={[{ etykieta: "Przekrój żyły", wartosc: "2,5", jednostka: "mm²" }]} />
    );
    const dt = container.querySelector("dt")!;
    const dd = container.querySelector("dd")!;
    expect(dt).toHaveTextContent("Przekrój żyły");
    expect(dd).toHaveTextContent("2,5 mm²");
  });

  it("korzeń ma klasę pe-result i przekazuje data-testid (stoją na nich testy e2e)", () => {
    const { container } = render(
      <WynikGlowny data-testid="wynik-doboru" wartosci={[{ etykieta: "a", wartosc: "1" }]} />
    );
    expect(container.firstElementChild).toHaveClass("pe-result");
    expect(screen.getByTestId("wynik-doboru")).toBe(container.firstElementChild);
  });

  it("1–2 wartości są duże (24/30 px), 3–4 średnie (20 px)", () => {
    const { container, rerender } = render(
      <WynikGlowny wartosci={[{ etykieta: "a", wartosc: "1" }, { etykieta: "b", wartosc: "2" }]} />
    );
    for (const dd of container.querySelectorAll("dd")) expect(dd.className).toMatch(/text-2xl.*sm:text-3xl/);
    rerender(
      <WynikGlowny
        wartosci={[
          { etykieta: "a", wartosc: "1" },
          { etykieta: "b", wartosc: "2" },
          { etykieta: "c", wartosc: "3" },
        ]}
      />
    );
    for (const dd of container.querySelectorAll("dd")) expect(dd.className).toContain("text-xl");
  });

  it("ton akcent daje kolor miedzi, domyślny — kolor główny", () => {
    const { container } = render(
      <WynikGlowny
        wartosci={[
          { etykieta: "Zs max", wartosc: "2,73", jednostka: "Ω", ton: "akcent" },
          { etykieta: "Ia", wartosc: "80", jednostka: "A" },
        ]}
      />
    );
    const [a, b] = container.querySelectorAll("dd");
    expect(a.className).toContain("text-copper");
    expect(b.className).toContain("text-blueprint");
  });

  it("treść pod wartościami (znaczniki, komunikat) jest w tym samym bloku", () => {
    render(
      <WynikGlowny data-testid="w" wartosci={[]}>
        <p>nie udało się dobrać</p>
      </WynikGlowny>
    );
    expect(screen.getByTestId("w")).toHaveTextContent("nie udało się dobrać");
  });

  it("bez wartości nie renderuje pustej listy", () => {
    const { container } = render(<WynikGlowny wartosci={[]}>x</WynikGlowny>);
    expect(container.querySelector("dl")).toBeNull();
  });
});
