import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "./badge";
import { KOLORY } from "@/lib/tokeny";
import { kontrast } from "@/test/kontrast";

describe("Badge", () => {
  it("renderuje treść jako <span> i przekazuje atrybuty", () => {
    render(
      <Badge variant="info" title="przekrój">
        2,5 mm²
      </Badge>
    );
    const z = screen.getByText("2,5 mm²");
    expect(z.tagName).toBe("SPAN");
    expect(z).toHaveAttribute("title", "przekrój");
  });

  it("domyślny wariant to neutralny", () => {
    expect(badgeVariants({})).toBe(badgeVariants({ variant: "neutral" }));
  });

  it("minimum 12 px i zaokrąglenie ze skali", () => {
    expect(badgeVariants({})).toContain("text-xs");
    expect(badgeVariants({})).toContain("rounded");
  });

  // Pary tekst/tło dokładnie takie, jakich używa komponent — odłożone z PR 1 (dawny znacznik z arkusza).
  it.each([
    ["info", KOLORY.blueprint, KOLORY.blueprintTlo],
    ["accent", KOLORY.caution, KOLORY.copperTlo],
    ["success", KOLORY.success, KOLORY.successTlo],
    ["caution", KOLORY.caution, KOLORY.cautionTlo],
    ["danger", KOLORY.danger, KOLORY.dangerTlo],
  ])("wariant %s ma kontrast ≥ 4,5:1", (_n, tekst, tlo) => {
    expect(kontrast(tekst, tlo)).toBeGreaterThanOrEqual(4.5);
  });
});
